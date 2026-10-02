import { supabaseAdmin } from "./supabase";

export type TipoEvento =
  | "venda"
  | "carrinho_abandonado"
  | "reembolso"
  | "mensagem_lead"
  | "sync_meta"
  | "relatorio"
  | "briefing"
  | "oferta"
  | "criativo"
  | "aprovacao";

/** Registra o que um agente fez. O escritório virtual anima a partir disso. */
export async function registrarEvento(evento: {
  projetoId: string | null;
  slug: string | null;
  funcao: string | null;
  tipo: TipoEvento;
  mensagem: string;
  valor?: number | null;
}) {
  const agenteId = evento.slug && evento.funcao ? `${evento.slug}:${evento.funcao}` : null;
  const { error } = await supabaseAdmin().from("agente_eventos").insert({
    agente_id: agenteId,
    projeto_id: evento.projetoId,
    tipo: evento.tipo,
    mensagem: evento.mensagem.slice(0, 140),
    valor: evento.valor ?? null,
  });
  if (error) throw error;
}

/** "João da Silva" -> "João S." — o escritório vai para a TV, sem dado pessoal completo. */
export function nomeCurto(nome: string | null | undefined): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "Cliente";
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`;
}

export function reais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
