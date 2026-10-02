import { NextResponse } from "next/server";
import { z } from "zod";
import { erroJson, exigirEquipe } from "@/lib/equipe";
import { supabaseAdmin } from "@/lib/supabase";
import { ETAPAS, aplicarRegrasDoFollowUp, moverLead } from "@/lib/crm";

// CRM da Sala Comercial (só para a equipe logada: telefone e conversa são dados pessoais).
// Mostra os leads do projeto e os que chegaram pelo WhatsApp ainda sem projeto.
export async function GET(req: Request) {
  const auth = await exigirEquipe(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const db = supabaseAdmin();
    const slug = new URL(req.url).searchParams.get("projeto") ?? "";
    const { data: projeto } = await db.from("projetos").select("id").eq("slug", slug).maybeSingle();
    if (!projeto) return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });

    await aplicarRegrasDoFollowUp();
    const { data: leads, error } = await db
      .from("leads")
      .select(
        "id, nome, telefone, email, projeto_id, origens, funil_codigo, etapa, etapa_desde, agente_id, valor, pagamento, checkout_url, " +
          "ultima_mensagem, ultima_mensagem_em, followup_tentativas, perdido_motivo, humano, humano_motivo, optout, created_at, updated_at, agentes(nome, cor)",
      )
      .or(`projeto_id.eq.${projeto.id},projeto_id.is.null`)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return NextResponse.json({ leads });
  } catch (e) {
    return erroJson(e);
  }
}

const Mudanca = z.object({
  id: z.string().uuid(),
  etapa: z.enum(ETAPAS).optional(),
  projeto: z.string().optional(), // ligar um lead sem projeto a este projeto
  humano: z.boolean().optional(), // true: uma pessoa assume (IA pausada); false: devolve para a IA
});

/** Mover o card na mão (arrastando ou pela janela do lead). */
export async function PATCH(req: Request) {
  const auth = await exigirEquipe(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const m = Mudanca.parse(await req.json());
    const campos: Record<string, unknown> = {};
    if (m.projeto) {
      const { data: projeto } = await supabaseAdmin().from("projetos").select("id").eq("slug", m.projeto).maybeSingle();
      if (projeto) campos.projeto_id = projeto.id;
    }
    if (m.humano !== undefined) {
      campos.humano = m.humano;
      campos.humano_motivo = m.humano ? `Assumido por ${auth.email}` : null;
    }
    if (m.etapa === "perdido") campos.perdido_motivo = `Movido por ${auth.email}`;
    if (m.etapa === "follow_up") campos.followup_tentativas = 0;
    const { data: atual } = await supabaseAdmin().from("leads").select("etapa").eq("id", m.id).single();
    await moverLead(m.id, m.etapa ?? atual?.etapa, campos, true);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroJson(e);
  }
}
