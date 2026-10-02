import { supabaseAdmin } from "./supabase";

// CRM da Sala Comercial. Cada lead é um card que anda pelas etapas; formulário, WhatsApp e
// Kiwify se juntam no mesmo lead pelo telefone (ou pelo e-mail, quando não há telefone).

export const ETAPAS = ["para_atender", "em_atendimento", "follow_up", "aguardando_pagamento", "compra_feita", "perdido"] as const;
export type Etapa = (typeof ETAPAS)[number];
export type Origem = "formulario" | "whatsapp" | "carrinho" | "compra";

/** Follow-up: a cada 2 h sem resposta, até 4 tentativas em 3 dias; depois, perdido. */
export const FOLLOW_UP = { intervaloHoras: 2, tentativas: 4, prazoDias: 3 };

const ORDEM: Record<Etapa, number> = {
  para_atender: 0,
  em_atendimento: 1,
  follow_up: 1,
  aguardando_pagamento: 2,
  compra_feita: 3,
  perdido: 1,
};

/** Só dígitos, com o 55 do Brasil quando vier sem DDI: "(11) 98765-4321" -> "5511987654321". */
export function normalizarTelefone(telefone: string | null | undefined): string | null {
  const d = (telefone ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.length <= 11 ? `55${d}` : d;
}

type Lead = {
  id: string;
  etapa: Etapa;
  origens: string[];
  projeto_id: string | null;
  nome: string | null;
  email: string | null;
  telefone: string;
};

async function acharLead(telefone: string | null, email: string | null): Promise<Lead | null> {
  const db = supabaseAdmin();
  const campos = "id, etapa, origens, projeto_id, nome, email, telefone";
  if (telefone) {
    const { data } = await db.from("leads").select(campos).eq("telefone", telefone).maybeSingle();
    if (data) return data as Lead;
  }
  if (email) {
    const { data } = await db.from("leads").select(campos).ilike("email", email).order("created_at").limit(1).maybeSingle();
    if (data) return data as Lead;
  }
  return null;
}

/**
 * Cria ou atualiza o lead (formulário, WhatsApp, Kiwify). Um lead novo entra em "Para atender";
 * um lead que já existe ganha a nova origem e os dados que faltavam, sem voltar de etapa.
 */
export async function registrarLead(dados: {
  projetoId: string | null;
  telefone?: string | null;
  email?: string | null;
  nome?: string | null;
  origem: Origem;
  funilCodigo?: string | null;
  utm?: Record<string, unknown> | null;
}): Promise<{ lead: Lead; novo: boolean }> {
  const telefone = normalizarTelefone(dados.telefone);
  const email = dados.email?.trim().toLowerCase() || null;
  if (!telefone && !email) throw new Error("Informe telefone ou e-mail.");
  const db = supabaseAdmin();
  const agora = new Date().toISOString();
  const existente = await acharLead(telefone, email);

  if (!existente) {
    const { data, error } = await db
      .from("leads")
      .insert({
        // Sem telefone (só e-mail), o e-mail ocupa o lugar da chave até o telefone chegar.
        telefone: telefone ?? `email:${email}`,
        email,
        nome: dados.nome?.trim() || null,
        projeto_id: dados.projetoId,
        origem: dados.origem,
        origens: [dados.origem],
        funil_codigo: dados.funilCodigo ?? null,
        utm: dados.utm ?? null,
      })
      .select("id, etapa, origens, projeto_id, nome, email, telefone")
      .single();
    if (error) throw error;
    return { lead: data as Lead, novo: true };
  }

  const atualizacao: Record<string, unknown> = { updated_at: agora };
  if (!existente.origens.includes(dados.origem)) atualizacao.origens = [...existente.origens, dados.origem];
  if (!existente.nome && dados.nome) atualizacao.nome = dados.nome.trim();
  if (!existente.email && email) atualizacao.email = email;
  if (!existente.projeto_id && dados.projetoId) atualizacao.projeto_id = dados.projetoId;
  if (telefone && existente.telefone.startsWith("email:")) atualizacao.telefone = telefone;
  if (dados.funilCodigo) atualizacao.funil_codigo = dados.funilCodigo;
  if (dados.utm) atualizacao.utm = dados.utm;
  const { data, error } = await db
    .from("leads")
    .update(atualizacao)
    .eq("id", existente.id)
    .select("id, etapa, origens, projeto_id, nome, email, telefone")
    .single();
  if (error) throw error;
  return { lead: data as Lead, novo: false };
}

/** Move o lead de etapa. Sem `forcar`, só avança (um evento atrasado não puxa o card para trás). */
export async function moverLead(id: string, etapa: Etapa, campos: Record<string, unknown> = {}, forcar = false) {
  const db = supabaseAdmin();
  const { data: atual } = await db.from("leads").select("etapa").eq("id", id).single();
  const muda = atual && atual.etapa !== etapa && (forcar || ORDEM[etapa] >= ORDEM[atual.etapa as Etapa]);
  const agora = new Date().toISOString();
  const { error } = await db
    .from("leads")
    .update({
      ...campos,
      ...(muda ? { etapa, etapa_desde: agora, ...(etapa !== "perdido" ? { perdido_motivo: null } : {}) } : {}),
      updated_at: agora,
    })
    .eq("id", id);
  if (error) throw error;
}

/** Mensagem do lead no WhatsApp: quem estava em follow-up ou perdido volta para o atendimento. */
export async function mensagemDoLead(id: string, texto: string | null) {
  const db = supabaseAdmin();
  const agora = new Date().toISOString();
  const { data: lead } = await db.from("leads").select("etapa, agente_id").eq("id", id).single();
  const campos = { ultima_mensagem: texto, ultima_mensagem_em: agora, ultima_entrada_em: agora, followup_tentativas: 0 };
  if (lead && (lead.etapa === "follow_up" || lead.etapa === "perdido")) {
    await moverLead(id, lead.agente_id ? "em_atendimento" : "para_atender", campos, true);
  } else {
    await moverLead(id, (lead?.etapa as Etapa) ?? "para_atender", campos);
  }
}

/**
 * Mensagem nossa para o lead (agente de IA, Fase 3): "Para atender" vira "Em atendimento";
 * em follow-up, conta mais uma tentativa.
 */
export async function mensagemParaOLead(id: string, texto: string, agenteId: string | null) {
  const db = supabaseAdmin();
  const agora = new Date().toISOString();
  const { data: lead } = await db.from("leads").select("etapa, followup_tentativas").eq("id", id).single();
  const campos: Record<string, unknown> = { ultima_mensagem: texto, ultima_mensagem_em: agora, ultima_saida_em: agora };
  if (agenteId) campos.agente_id = agenteId;
  if (lead?.etapa === "follow_up") campos.followup_tentativas = (lead.followup_tentativas ?? 0) + 1;
  await moverLead(id, lead?.etapa === "para_atender" ? "em_atendimento" : ((lead?.etapa as Etapa) ?? "em_atendimento"), campos);
}

/** Pedido da Kiwify: Pix/boleto gerado -> aguardando pagamento; pago -> compra feita. */
export async function pedidoDoLead(
  dados: { projetoId: string | null; telefone: string | null; email: string | null; nome: string | null },
  pedido: { status: string; valor: number | null; metodo: string | null; checkoutUrl: string | null },
) {
  const origem: Origem = pedido.status === "abandoned" ? "carrinho" : "compra";
  if (!dados.telefone && !dados.email) return null;
  const { lead } = await registrarLead({ ...dados, origem });
  const valor = pedido.valor ?? undefined;
  const checkout_url = pedido.checkoutUrl ?? undefined;
  if (pedido.status === "paid") {
    await moverLead(lead.id, "compra_feita", { pagamento: "pago", valor }, true);
  } else if (pedido.status === "waiting_payment") {
    const pagamento = pedido.metodo === "boleto" ? "boleto_gerado" : pedido.metodo === "pix" ? "pix_gerado" : "link_enviado";
    await moverLead(lead.id, "aguardando_pagamento", { pagamento, valor, checkout_url });
  } else if (pedido.status === "refunded" || pedido.status === "chargedback") {
    await moverLead(lead.id, lead.etapa, { pagamento: "reembolsado" });
  } else if (pedido.status === "abandoned") {
    await moverLead(lead.id, lead.etapa, { checkout_url });
  }
  return lead;
}

/** Regras de tempo do follow-up (2 h, 4 tentativas, 3 dias). */
export async function aplicarRegrasDoFollowUp() {
  await supabaseAdmin().rpc("crm_aplicar_regras", {
    p_intervalo: `${FOLLOW_UP.intervaloHoras} hours`,
    p_tentativas: FOLLOW_UP.tentativas,
    p_prazo: `${FOLLOW_UP.prazoDias} days`,
  });
}
