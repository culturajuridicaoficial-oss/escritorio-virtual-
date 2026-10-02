import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { assinaturaKiwifyValida, lerPedidoKiwify } from "@/lib/kiwify";
import { projetoDoProdutoKiwify } from "@/lib/projetos";
import { supabaseAdmin } from "@/lib/supabase";
import { nomeCurto, reais, registrarEvento } from "@/lib/eventos";
import { pedidoDoLead } from "@/lib/crm";

// Kiwify -> vendas, carrinhos abandonados e reembolsos.
// Configure na Kiwify a URL: https://<seu-dominio>/api/webhooks/kiwify
export async function POST(req: Request) {
  const corpo = await req.text();
  const assinatura = new URL(req.url).searchParams.get("signature");
  if (!assinaturaKiwifyValida(corpo, assinatura, env("KIWIFY_WEBHOOK_TOKEN"))) {
    return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ erro: "json inválido" }, { status: 400 });
  }

  const pedido = lerPedidoKiwify(payload);
  if (!pedido) return NextResponse.json({ ok: true, ignorado: true });

  const projeto = await projetoDoProdutoKiwify(pedido.produtoId);
  const db = supabaseAdmin();

  // Se o pedido já estava pago, não toca o sino de novo (a Kiwify reenvia webhooks).
  const { data: anterior } = await db
    .from("vendas")
    .select("status")
    .eq("kiwify_order_id", pedido.orderId)
    .maybeSingle();

  const { error } = await db.from("vendas").upsert(
    {
      kiwify_order_id: pedido.orderId,
      projeto_id: projeto?.id ?? null,
      produto_id: pedido.produtoId,
      produto_nome: pedido.produtoNome,
      status: pedido.status,
      evento: pedido.evento,
      valor: pedido.valor,
      cliente_nome: pedido.clienteNome,
      cliente_email: pedido.clienteEmail,
      cliente_telefone: pedido.clienteTelefone,
      utm: pedido.utm,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "kiwify_order_id" },
  );
  if (error) throw error;

  if (pedido.status === anterior?.status) return NextResponse.json({ ok: true, repetido: true });

  // CRM: o pedido entra no lead do mesmo telefone/e-mail (Pix gerado, pago, carrinho...).
  await pedidoDoLead(
    { projetoId: projeto?.id ?? null, telefone: pedido.clienteTelefone, email: pedido.clienteEmail, nome: pedido.clienteNome },
    { status: pedido.status, valor: pedido.valor, metodo: pedido.metodo, checkoutUrl: pedido.checkoutUrl },
  ).catch((e) => console.error("CRM (Kiwify):", e));

  const base = { projetoId: projeto?.id ?? null, slug: projeto?.slug ?? null };
  const cliente = nomeCurto(pedido.clienteNome);

  if (pedido.status === "paid") {
    await registrarEvento({
      ...base,
      funcao: "comercial-pos",
      tipo: "venda",
      mensagem: `${cliente} comprou ${pedido.valor ? reais(pedido.valor) : ""}`.trim(),
      valor: pedido.valor,
    });
  } else if (pedido.status === "abandoned") {
    await registrarEvento({
      ...base,
      funcao: "comercial-carrinho",
      tipo: "carrinho_abandonado",
      mensagem: `Carrinho abandonado: ${cliente}`,
    });
  } else if (pedido.status === "refunded" || pedido.status === "chargedback") {
    await registrarEvento({
      ...base,
      funcao: "comercial-pos",
      tipo: "reembolso",
      mensagem: `${pedido.status === "refunded" ? "Reembolso" : "Chargeback"}: ${cliente}`,
      valor: pedido.valor,
    });
  }

  return NextResponse.json({ ok: true });
}
