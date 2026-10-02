import { supabaseAdmin } from "./supabase";
import { enviarTextoEvolution, type MensagemEvolution } from "./evolution";
import { FOLLOW_UP, aplicarRegrasDoFollowUp, mensagemDoLead, mensagemParaOLead, moverLead, registrarLead } from "./crm";
import { nomeCurto, registrarEvento } from "./eventos";
import { agenteAtual } from "./tarefas";
import { responderLead, type Papel, type Resposta } from "./agentes/comercial";

// Atendimento no WhatsApp (Evolution): recebe as mensagens, os agentes comerciais respondem,
// e a rodada a cada 15 min faz o primeiro contato e os follow-ups (2 h, até 4 vezes).

type Projeto = { id: string; slug: string; nome: string; whatsapp_instancia: string | null; atendimento_ia: boolean };
type Lead = {
  id: string;
  telefone: string;
  nome: string | null;
  projeto_id: string | null;
  origens: string[];
  etapa: string;
  pagamento: string | null;
  checkout_url: string | null;
  funil_codigo: string | null;
  followup_tentativas: number;
  humano: boolean;
  optout: boolean;
};
const CAMPOS_LEAD = "id, telefone, nome, projeto_id, origens, etapa, pagamento, checkout_url, funil_codigo, followup_tentativas, humano, optout";

const PARAR = /^\s*(parar|pare|sair|stop|cancelar|descadastrar|n[aã]o quero mais( receber)?)\s*[.!]*\s*$/i;

/** Horário comercial para mensagens que nós iniciamos (8h às 21h de Brasília). */
function emHorario(d = new Date()) {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(d));
  return h >= 8 && h < 21;
}

async function projetoDaInstancia(instancia: string): Promise<Projeto | null> {
  const db = supabaseAdmin();
  const campos = "id, slug, nome, whatsapp_instancia, atendimento_ia";
  const { data } = await db.from("projetos").select(campos).eq("whatsapp_instancia", instancia).maybeSingle();
  if (data) return data as Projeto;
  const { data: porSlug } = await db.from("projetos").select(campos).eq("slug", instancia).maybeSingle();
  return (porSlug as Projeto | null) ?? null;
}

async function carregarProjeto(id: string): Promise<Projeto | null> {
  const { data } = await supabaseAdmin().from("projetos").select("id, slug, nome, whatsapp_instancia, atendimento_ia").eq("id", id).maybeSingle();
  return (data as Projeto | null) ?? null;
}

/** Mensagem que chegou pela Evolution (do lead, ou do nosso número). Devolve o lead se a IA deve responder. */
export async function receberMensagem(m: MensagemEvolution, payload: unknown): Promise<{ leadId: string; responder: boolean } | null> {
  const projeto = await projetoDaInstancia(m.instancia);
  const db = supabaseAdmin();
  const { lead } = await registrarLead({ projetoId: projeto?.id ?? null, telefone: m.telefone, nome: m.deMim ? null : m.nome, origem: "whatsapp" });

  const { data: gravada } = await db
    .from("mensagens_whatsapp")
    .upsert(
      { lead_id: lead.id, externo_id: m.id, direcao: m.deMim ? "saida" : "entrada", texto: m.texto, payload },
      { onConflict: "externo_id", ignoreDuplicates: true },
    )
    .select("id");
  if (m.id && !gravada?.length) return null; // repetida (inclusive as que nós mesmos enviamos pela API)

  if (m.deMim) {
    // Alguém respondeu pelo celular do projeto: uma pessoa assumiu, a IA para.
    await supabaseAdmin().from("leads").update({ humano: true, humano_motivo: "Uma pessoa respondeu pelo WhatsApp" }).eq("id", lead.id);
    await mensagemParaOLead(lead.id, m.texto ?? "", null);
    return null;
  }

  await mensagemDoLead(lead.id, m.texto);
  if (m.texto && PARAR.test(m.texto)) {
    await db.from("leads").update({ optout: true }).eq("id", lead.id);
    await moverLead(lead.id, "perdido", { perdido_motivo: "Pediu para não receber mensagens" }, true);
  }
  if (projeto) {
    await registrarEvento({ projetoId: projeto.id, slug: projeto.slug, funcao: "comercial-popup", tipo: "mensagem_lead", mensagem: `Nova mensagem de ${nomeCurto(m.nome)}` });
  }
  return { leadId: lead.id, responder: !!projeto?.atendimento_ia };
}

/** Qual agente cuida do lead. */
function papelDo(lead: Lead): Papel {
  if (lead.etapa === "compra_feita") return "pos";
  if (lead.origens.includes("carrinho") || lead.etapa === "aguardando_pagamento") return "carrinho";
  return "popup";
}

async function contextoDoLead(lead: Lead, projeto: Projeto) {
  const db = supabaseAdmin();
  let funil = null as { id: string; briefing: unknown; pagina_vendas_url: string | null } | null;
  if (lead.funil_codigo) {
    const { data } = await db.from("funis").select("id, briefing, pagina_vendas_url").eq("codigo", lead.funil_codigo).maybeSingle();
    funil = data;
  }
  if (!funil?.briefing) {
    const { data } = await db
      .from("funis")
      .select("id, briefing, pagina_vendas_url")
      .eq("projeto_id", projeto.id)
      .not("briefing", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    funil = data;
  }
  let link = funil?.pagina_vendas_url ?? null;
  if (funil) {
    const { data: oferta } = await db
      .from("ofertas")
      .select("checkout_url")
      .eq("funil_id", funil.id)
      .not("checkout_url", "is", null)
      .in("status", ["aprovada", "publicada"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    link = oferta?.checkout_url ?? link;
  }
  const { data: msgs } = await db
    .from("mensagens_whatsapp")
    .select("direcao, texto, created_at")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(30);
  const conversa = (msgs ?? []).reverse().map((x) => ({ de: x.direcao === "entrada" ? ("lead" as const) : ("nos" as const), texto: x.texto ?? "", quando: x.created_at }));
  const papel = papelDo(lead);
  const { data: agente } = await db.from("agentes").select("id, nome").eq("id", `${projeto.slug}:comercial-${papel}`).maybeSingle();
  return { briefing: funil?.briefing ?? null, link, conversa, papel, agente: agente ?? { id: `${projeto.slug}:comercial-${papel}`, nome: "Atendimento" } };
}

/** Reserva o lead por 2 min para só um agente falar com ele por vez. */
async function reservar(leadId: string) {
  const agora = new Date().toISOString();
  const { data } = await supabaseAdmin()
    .from("leads")
    .update({ respondendo_ate: new Date(Date.now() + 120_000).toISOString() })
    .eq("id", leadId)
    .or(`respondendo_ate.is.null,respondendo_ate.lt.${agora}`)
    .select("id");
  return !!data?.length;
}
const liberar = (leadId: string) => supabaseAdmin().from("leads").update({ respondendo_ate: null }).eq("id", leadId);

/** O agente fala com o lead (responder, primeiro contato ou follow-up) e envia pela Evolution. */
export async function atenderLead(leadId: string, modo: "responder" | "primeiro_contato" | "follow_up") {
  const db = supabaseAdmin();
  const { data } = await db.from("leads").select(CAMPOS_LEAD).eq("id", leadId).single();
  const lead = data as Lead | null;
  if (!lead || !lead.projeto_id || lead.humano || lead.optout || lead.telefone.startsWith("email:")) return "ignorado";
  const projeto = await carregarProjeto(lead.projeto_id);
  if (!projeto?.atendimento_ia) return "ignorado";
  if (!(await reservar(lead.id))) return "ocupado";

  try {
    const ctx = await contextoDoLead(lead, projeto);
    if (!ctx.briefing) return "sem briefing";
    if (modo === "responder" && ctx.conversa.at(-1)?.de !== "lead") return "nada a responder";

    const resposta: Resposta = await agenteAtual.run(
      { projetoId: projeto.id, agenteId: ctx.agente.id, titulo: `WhatsApp: ${nomeCurto(lead.nome)}` },
      () =>
        responderLead({
          papel: ctx.papel,
          agente: ctx.agente.nome,
          projeto: projeto.nome,
          briefing: ctx.briefing,
          linkDeCompra: ctx.link,
          lead: { nome: lead.nome, origens: lead.origens, etapa: lead.etapa, pagamento: lead.pagamento, checkout_url: lead.checkout_url },
          conversa: ctx.conversa,
          modo,
          tentativa: lead.followup_tentativas + 1,
          agora: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
        }),
    );

    const instancia = projeto.whatsapp_instancia ?? projeto.slug;
    for (const texto of resposta.mensagens.slice(0, 3)) {
      const id = await enviarTextoEvolution(instancia, lead.telefone, texto, Math.min(4000, 800 + texto.length * 25));
      await db.from("mensagens_whatsapp").upsert(
        { lead_id: lead.id, externo_id: id, direcao: "saida", texto, agente_id: ctx.agente.id },
        { onConflict: "externo_id", ignoreDuplicates: true },
      );
      await mensagemParaOLead(lead.id, texto, ctx.agente.id);
    }
    await aplicarAcao(lead.id, resposta);
    if (resposta.mensagens.length) {
      await registrarEvento({ projetoId: projeto.id, slug: projeto.slug, funcao: `comercial-${ctx.papel}`, tipo: "mensagem_lead", mensagem: `${ctx.agente.nome} respondeu ${nomeCurto(lead.nome)}` });
    }
    return resposta.acao;
  } finally {
    await liberar(lead.id);
  }
}

async function aplicarAcao(leadId: string, r: Resposta) {
  const db = supabaseAdmin();
  if (r.acao === "enviou_link") await moverLead(leadId, "aguardando_pagamento", { pagamento: "link_enviado" });
  else if (r.acao === "vai_comprar") await moverLead(leadId, "aguardando_pagamento", { pagamento: "vai_comprar" });
  else if (r.acao === "comprou") await db.from("leads").update({ humano: true, humano_motivo: `Diz que já pagou: confirme o pagamento. ${r.motivo}` }).eq("id", leadId);
  else if (r.acao === "humano") await db.from("leads").update({ humano: true, humano_motivo: r.motivo }).eq("id", leadId);
  else if (r.acao === "optout") {
    await db.from("leads").update({ optout: true }).eq("id", leadId);
    await moverLead(leadId, "perdido", { perdido_motivo: "Pediu para não receber mensagens" }, true);
  } else if (r.acao === "sem_interesse") await moverLead(leadId, "perdido", { perdido_motivo: `Sem interesse: ${r.motivo}` }, true);
}

/** Resposta ao lead: espera alguns segundos (a pessoa costuma mandar várias mensagens seguidas). */
export async function responderDepois(leadId: string) {
  await new Promise((r) => setTimeout(r, 8000));
  const { data } = await supabaseAdmin().from("leads").select("ultima_entrada_em").eq("id", leadId).single();
  // Chegou mensagem nova nesses segundos: a chamada dela é que responde.
  if (data?.ultima_entrada_em && Date.now() - new Date(data.ultima_entrada_em).getTime() < 7500) return "aguardando";
  return atenderLead(leadId, "responder");
}

/**
 * Rodada a cada 15 min (agendador do Supabase): regras de tempo do CRM, primeiro contato com
 * quem se cadastrou ou abandonou o carrinho e follow-up de quem parou de responder.
 */
export async function rodadaComercial() {
  await aplicarRegrasDoFollowUp();
  if (!emHorario()) return { fora_do_horario: true };
  const db = supabaseAdmin();
  const { data: projetos } = await db.from("projetos").select("id").eq("atendimento_ia", true);
  const ids = (projetos ?? []).map((p) => p.id);
  if (!ids.length) return { projetos: 0 };

  const cincoMin = new Date(Date.now() - 5 * 60000).toISOString();
  const intervalo = new Date(Date.now() - FOLLOW_UP.intervaloHoras * 3600000).toISOString();
  const [{ data: novos }, { data: followups }] = await Promise.all([
    db.from("leads").select("id").in("projeto_id", ids).eq("etapa", "para_atender").is("ultima_saida_em", null).is("ultima_entrada_em", null)
      .eq("humano", false).eq("optout", false).lt("created_at", cincoMin).not("telefone", "like", "email:%").limit(20),
    db.from("leads").select("id").in("projeto_id", ids).eq("etapa", "follow_up").lt("followup_tentativas", FOLLOW_UP.tentativas)
      .eq("humano", false).eq("optout", false).lt("ultima_saida_em", intervalo).limit(20),
  ]);
  const resultado: Record<string, string> = {};
  for (const l of novos ?? []) resultado[l.id] = await atenderLead(l.id, "primeiro_contato").catch((e) => `erro: ${(e as Error).message}`);
  for (const l of followups ?? []) resultado[l.id] = await atenderLead(l.id, "follow_up").catch((e) => `erro: ${(e as Error).message}`);
  return { primeiro_contato: novos?.length ?? 0, follow_up: followups?.length ?? 0, resultado };
}

/** Uma pessoa da equipe responde pelo CRM (a IA fica pausada nesse lead). */
export async function enviarComoEquipe(leadId: string, texto: string, quem: string) {
  const db = supabaseAdmin();
  const { data } = await db.from("leads").select("telefone, projeto_id").eq("id", leadId).single();
  if (!data?.projeto_id) throw new Error("Ligue o lead a um projeto antes de responder.");
  if (data.telefone.startsWith("email:")) throw new Error("Este lead não tem WhatsApp.");
  const projeto = await carregarProjeto(data.projeto_id);
  if (!projeto) throw new Error("Projeto não encontrado.");
  const id = await enviarTextoEvolution(projeto.whatsapp_instancia ?? projeto.slug, data.telefone, texto, 500);
  await db.from("mensagens_whatsapp").upsert({ lead_id: leadId, externo_id: id, direcao: "saida", texto }, { onConflict: "externo_id", ignoreDuplicates: true });
  await db.from("leads").update({ humano: true, humano_motivo: `Atendido por ${quem}` }).eq("id", leadId);
  await mensagemParaOLead(leadId, texto, null);
}
