import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "./supabase";
import { registrarEvento } from "./eventos";
import { abrirTarefa, agenteAtual, fecharTarefa } from "./tarefas";
import { claude, explicarErro, lerRespostaDoLote, paramsDoLote } from "./agentes/claude";
import { chamadaEstatico, chamadaRodada, chamadaVideo, ENTREGA_PADRAO, Peca, PecaEstatica, Rodada, type Entregas } from "./agentes/fabrica";
import { carregarFunil, falharPeca, prepararProducao, prepararRodada, salvarPeca, salvarRodada } from "./fabrica";

// Rodada diária em lote (Batch API): metade do preço, resposta em até 24 h (quase sempre em
// menos de 1 h). O cron envia; a coleta roda no início de cada cron e quando alguém abre o
// painel. Pedidos feitos pelo painel continuam na hora.

type ItemRodada = { tipo: "rodada"; funilId: string; entregas: Entregas; tarefaId: string | null; projetoId: string; agenteId: string; titulo: string };
type ItemPeca = { tipo: "peca"; criativoId: string; tarefaId: string | null; projetoId: string; agenteId: string; titulo: string };
type Item = ItemRodada | ItemPeca;

async function enviar(tipo: "rodada" | "producao", pedidos: Array<{ id: string; item: Item; params: Anthropic.Beta.Messages.BatchCreateParams.Request["params"] }>) {
  const lote = await claude().beta.messages.batches.create({
    requests: pedidos.map((p) => ({ custom_id: p.id, params: p.params })),
  });
  const itens = Object.fromEntries(pedidos.map((p) => [p.id, p.item]));
  const { error } = await supabaseAdmin().from("lotes_ia").insert({ id: lote.id, tipo, itens });
  if (error) throw error;
  return lote.id;
}

/** Rodada automática do dia de cada funil, num lote só. */
export async function enviarRodadasEmLote(funilIds: string[]) {
  const pedidos = [];
  for (const funilId of funilIds) {
    const prep = await prepararRodada(funilId, ENTREGA_PADRAO, null);
    const titulo = `${prep.tarefa.titulo} (lote, metade do preço)`;
    const tarefaId = await abrirTarefa({ ...prep.tarefa, titulo });
    pedidos.push({
      id: `rodada-${funilId}`,
      item: { tipo: "rodada" as const, funilId, entregas: ENTREGA_PADRAO, tarefaId, projetoId: prep.tarefa.projetoId, agenteId: `${prep.tarefa.slug}:ofertas`, titulo },
      params: paramsDoLote(chamadaRodada(prep.entrada, prep.anexos)),
    });
  }
  return pedidos.length ? enviar("rodada", pedidos) : null;
}

/** Estáticos e vídeos pendentes, num lote só. Cada peça fica marcada com o lote. */
export async function enviarProducaoEmLote(criativoIds: string[]) {
  const pedidos = [];
  for (const id of criativoIds) {
    const prep = await prepararProducao(id);
    if (!prep) continue;
    const titulo = `${prep.tarefa.titulo} (lote)`;
    const tarefaId = await abrirTarefa({ ...prep.tarefa, titulo });
    const chamada = prep.chamada.tipo === "video" ? chamadaVideo(prep.chamada.entrada, prep.anexos) : chamadaEstatico(prep.chamada.entrada, prep.anexos);
    pedidos.push({
      id: `peca-${id}`,
      item: { tipo: "peca" as const, criativoId: id, tarefaId, projetoId: prep.projetoId, agenteId: `${prep.slug}:${prep.funcao}`, titulo },
      params: paramsDoLote(chamada),
    });
  }
  if (!pedidos.length) return null;
  const loteId = await enviar("producao", pedidos);
  await supabaseAdmin()
    .from("criativos")
    .update({ lote_id: loteId })
    .in("id", pedidos.map((p) => (p.item as ItemPeca).criativoId));
  return loteId;
}

let ultimaColeta = 0;

/**
 * Busca os lotes que terminaram e grava os resultados. Rodadas prontas mandam as peças para
 * um novo lote de produção. Seguro rodar em paralelo: cada lote é reservado antes de processar.
 */
export async function coletarLotes(opcoes: { semPressa?: boolean } = {}) {
  if (opcoes.semPressa && Date.now() - ultimaColeta < 60_000) return { coletados: 0 };
  ultimaColeta = Date.now();
  const db = supabaseAdmin();
  const { data: abertos } = await db.from("lotes_ia").select("id").eq("status", "enviado");
  let coletados = 0;
  for (const { id } of abertos ?? []) {
    const lote = await claude().beta.messages.batches.retrieve(id);
    if (lote.processing_status !== "ended") continue;
    const { data: reservado } = await db
      .from("lotes_ia")
      .update({ status: "coletando" })
      .eq("id", id)
      .eq("status", "enviado")
      .select("itens")
      .maybeSingle();
    if (!reservado) continue;
    try {
      await processar(id, reservado.itens as Record<string, Item>);
      await db.from("lotes_ia").update({ status: "concluido", concluido_em: new Date().toISOString() }).eq("id", id);
      coletados++;
    } catch (e) {
      await db.from("lotes_ia").update({ status: "erro", erro: (e as Error).message }).eq("id", id);
    }
  }
  return { coletados };
}

async function processar(loteId: string, itens: Record<string, Item>) {
  const novasPecas: string[] = [];
  const vistos = new Set<string>();

  for await (const r of await claude().beta.messages.batches.results(loteId)) {
    const item = itens[r.custom_id];
    if (!item) continue;
    vistos.add(r.custom_id);
    const quem = { projetoId: item.projetoId, agenteId: item.agenteId, titulo: item.titulo };
    try {
      if (r.result.type !== "succeeded") throw new Error(motivoDoLote(r.result));
      const mensagem = r.result.message;
      if (item.tipo === "rodada") {
        const funil = await carregarFunil(item.funilId);
        const rodada = await agenteAtual.run(quem, () => lerRespostaDoLote(mensagem, Rodada));
        const { pendentes } = await salvarRodada(funil, item.entregas, rodada, null);
        novasPecas.push(...pendentes);
      } else {
        const prep = await prepararProducao(item.criativoId, { semAnexos: true });
        // Produzida na hora pelo painel enquanto o lote rodava: descarta a do lote.
        if (!prep || prep.criativo.lote_id !== loteId) {
          await fecharTarefa(item.tarefaId, "concluida");
          continue;
        }
        const schema = prep.chamada.tipo === "video" ? Peca : PecaEstatica;
        try {
          const peca = await agenteAtual.run(quem, () => lerRespostaDoLote(mensagem, schema));
          await salvarPeca(prep, peca);
        } catch (e) {
          await falharPeca(prep, explicarErro(e));
          throw e;
        }
      }
      await fecharTarefa(item.tarefaId, "concluida");
    } catch (e) {
      await fecharTarefa(item.tarefaId, "erro", explicarErro(e));
      if (item.tipo === "peca") await liberarPeca(item.criativoId, loteId, explicarErro(e));
      else await registrarEvento({ projetoId: item.projetoId, slug: item.agenteId.split(":")[0], funcao: "ofertas", tipo: "oferta", mensagem: "A rodada do dia falhou; peça de novo pelo painel" });
    }
  }

  // Pedido sem resposta no lote (não deveria acontecer): libera a peça e fecha a tarefa.
  for (const [customId, item] of Object.entries(itens)) {
    if (vistos.has(customId)) continue;
    await fecharTarefa(item.tarefaId, "erro", "Sem resposta no lote.");
    if (item.tipo === "peca") await liberarPeca(item.criativoId, loteId, "Sem resposta no lote. Clique em Tentar de novo.");
  }

  if (novasPecas.length) await enviarProducaoEmLote(novasPecas);
}

/** Peça do lote que falhou: vira "erro" para o painel oferecer Tentar de novo (se ninguém já refez). */
async function liberarPeca(criativoId: string, loteId: string, mensagem: string) {
  await supabaseAdmin()
    .from("criativos")
    .update({ status: "erro", erro: mensagem, lote_id: null, updated_at: new Date().toISOString() })
    .eq("id", criativoId)
    .eq("lote_id", loteId);
}

function motivoDoLote(resultado: Anthropic.Beta.Messages.BetaMessageBatchResult): string {
  if (resultado.type === "expired") return "O lote passou de 24 h sem resposta. Clique em Tentar de novo.";
  if (resultado.type === "canceled") return "O lote foi cancelado. Clique em Tentar de novo.";
  if (resultado.type === "errored") return explicarErro(new Error(resultado.error.error?.message ?? "Erro no lote."));
  return "Erro no lote.";
}
