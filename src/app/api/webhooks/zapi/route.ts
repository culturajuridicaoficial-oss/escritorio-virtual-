import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { lerMensagemZapi } from "@/lib/zapi";
import { supabaseAdmin } from "@/lib/supabase";
import { nomeCurto, registrarEvento } from "@/lib/eventos";
import { mensagemDoLead, registrarLead } from "@/lib/crm";

// Z-API -> mensagens recebidas no WhatsApp.
// Configure na Z-API o webhook "Ao receber": https://<seu-dominio>/api/webhooks/zapi?secret=<ZAPI_WEBHOOK_SECRET>
// Fase 1: registra lead e mensagem. Fase 3: os agentes comerciais passam a responder.
export async function POST(req: Request) {
  if (new URL(req.url).searchParams.get("secret") !== env("ZAPI_WEBHOOK_SECRET")) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const mensagem = lerMensagemZapi(await req.json());
  if (!mensagem) return NextResponse.json({ ok: true, ignorado: true });

  const db = supabaseAdmin();
  // Mesmo telefone do formulário ou da Kiwify = mesmo lead (um card só no CRM).
  const { lead: registrado } = await registrarLead({ projetoId: null, telefone: mensagem.telefone, nome: mensagem.nome, origem: "whatsapp" });
  const { data: lead, error } = await db
    .from("leads")
    .select("id, projeto_id, origem, projetos(slug)")
    .eq("id", registrado.id)
    .single();
  if (error) throw error;

  const { error: erroMsg } = await db.from("mensagens_whatsapp").upsert(
    {
      lead_id: lead.id,
      zapi_message_id: mensagem.messageId,
      direcao: "entrada",
      texto: mensagem.texto,
    },
    { onConflict: "zapi_message_id", ignoreDuplicates: true },
  );
  if (erroMsg) throw erroMsg;
  await mensagemDoLead(lead.id, mensagem.texto);

  const slug = (lead.projetos as unknown as { slug: string } | null)?.slug ?? null;
  const funcao =
    lead.origem === "abandono" ? "comercial-carrinho" : lead.origem === "comprador" ? "comercial-pos" : "comercial-popup";
  await registrarEvento({
    projetoId: lead.projeto_id,
    slug,
    funcao: slug ? funcao : null,
    tipo: "mensagem_lead",
    mensagem: `Nova mensagem de ${nomeCurto(mensagem.nome)}`,
  });

  return NextResponse.json({ ok: true });
}
