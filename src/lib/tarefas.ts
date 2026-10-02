import { AsyncLocalStorage } from "node:async_hooks";
import { supabaseAdmin } from "./supabase";

/** Quem está trabalhando agora: o registro de consumo da IA usa para saber o escritório e o agente. */
export const agenteAtual = new AsyncLocalStorage<{ projetoId: string; agenteId: string; titulo: string }>();

type Tarefa = { projetoId: string; slug: string; funcao: string; titulo: string };

/** Abre a tarefa "em andamento" do agente (o escritório mostra na hora). Devolve o id, ou null se falhar. */
export async function abrirTarefa(tarefa: Tarefa): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from("tarefas")
    .insert({ projeto_id: tarefa.projetoId, agente_id: `${tarefa.slug}:${tarefa.funcao}`, titulo: tarefa.titulo.slice(0, 160) })
    .select("id")
    .single();
  return (data?.id as string | undefined) ?? null;
}

export async function fecharTarefa(id: string | null, status: "concluida" | "erro", erro?: string) {
  if (!id) return;
  await supabaseAdmin()
    .from("tarefas")
    .update({ status, erro: erro ?? null, concluida_em: new Date().toISOString() })
    .eq("id", id);
}

/**
 * Executa um trabalho de agente registrando a tarefa: "em andamento" ao começar e
 * "concluída" (ou "erro") ao terminar. O escritório mostra isso ao vivo.
 * Falha ao registrar a tarefa nunca derruba o trabalho em si.
 */
export async function comTarefa<T>(tarefa: Tarefa, trabalho: () => Promise<T>): Promise<T> {
  const id = await abrirTarefa(tarefa);
  try {
    const resultado = await agenteAtual.run(
      { projetoId: tarefa.projetoId, agenteId: `${tarefa.slug}:${tarefa.funcao}`, titulo: tarefa.titulo.slice(0, 160) },
      trabalho,
    );
    await fecharTarefa(id, "concluida");
    return resultado;
  } catch (e) {
    await fecharTarefa(id, "erro", (e as Error).message);
    throw e;
  }
}
