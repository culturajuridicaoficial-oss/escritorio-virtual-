import { NextResponse } from "next/server";
import { cronAutorizado } from "@/lib/cron";
import { supabaseAdmin } from "@/lib/supabase";
import { coletarLotes, enviarProducaoEmLote, enviarRodadasEmLote } from "@/lib/lotes";

export const maxDuration = 300;

// Todo dia, depois do relatório: uma rodada nova no funil mais recente de cada projeto,
// e produção de tudo que estiver pendente. Vai em lote (metade do preço): as peças aparecem
// no /painel quando o lote termina (quase sempre em menos de 1 h; a coleta roda quando
// alguém abre o painel e no início de cada cron).
export async function GET(req: Request) {
  if (!cronAutorizado(req)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const db = supabaseAdmin();
  const coleta = await coletarLotes().catch((e) => ({ erro: String(e) }));

  const { data: funis } = await db
    .from("funis")
    .select("id, codigo, projeto_id, projetos!inner(ativo)")
    .eq("projetos.ativo", true)
    .not("briefing", "is", null)
    .order("created_at", { ascending: false });
  const vistos = new Set<string>();
  const doDia = (funis ?? []).filter((f) => !vistos.has(f.projeto_id) && vistos.add(f.projeto_id));
  const rodadas = await enviarRodadasEmLote(doDia.map((f) => f.id)).catch((e) => `erro: ${(e as Error).message}`);

  // Peças paradas em produção (fora de lote e sem ninguém produzindo há 30 min).
  const { data: pendentes } = await db
    .from("criativos")
    .select("id")
    .eq("status", "em_producao")
    .is("lote_id", null)
    .lt("updated_at", new Date(Date.now() - 30 * 60000).toISOString())
    .limit(15);
  const producao = await enviarProducaoEmLote((pendentes ?? []).map((c) => c.id)).catch((e) => `erro: ${(e as Error).message}`);

  return NextResponse.json({ coleta, funis: doDia.map((f) => f.codigo), lote_rodadas: rodadas, lote_producao: producao });
}
