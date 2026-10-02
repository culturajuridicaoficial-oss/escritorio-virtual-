import { NextResponse } from "next/server";
import { cronAutorizado } from "@/lib/cron";
import { coletarLotes } from "@/lib/lotes";
import { buscarInsights, somaCompras } from "@/lib/meta";
import { projetosAtivos } from "@/lib/projetos";
import { supabaseAdmin } from "@/lib/supabase";
import { reais, registrarEvento } from "@/lib/eventos";
import { comTarefa } from "@/lib/tarefas";

export const maxDuration = 300;

const dia = (deslocamento: number) => new Date(Date.now() + deslocamento * 86_400_000).toISOString().slice(0, 10);

// Todo dia (de hora em hora no plano Pro): traz as métricas de ontem e de hoje de cada projeto.
export async function GET(req: Request) {
  if (!cronAutorizado(req)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  await coletarLotes().catch(() => {}); // lotes da rodada diária que terminaram

  const resultado: Record<string, number | string> = {};
  for (const projeto of await projetosAtivos()) {
    if (!projeto.meta_ad_account_id) continue;
    try {
      const conta = projeto.meta_ad_account_id;
      const linhas = await comTarefa(
        { projetoId: projeto.id, slug: projeto.slug, funcao: "trafego", titulo: "Atualizando as métricas do Meta Ads" },
        () => buscarInsights(conta, dia(-1), dia(0)),
      );
      const registros = linhas.map((l) => ({
        ad_id: l.ad_id,
        data: l.date_start,
        projeto_id: projeto.id,
        ad_name: l.ad_name ?? null,
        adset_id: l.adset_id ?? null,
        campaign_id: l.campaign_id ?? null,
        campaign_name: l.campaign_name ?? null,
        gasto: Number(l.spend ?? 0),
        impressoes: Number(l.impressions ?? 0),
        cliques: Number(l.clicks ?? 0),
        ctr: l.ctr ? Number(l.ctr) : null,
        cpc: l.cpc ? Number(l.cpc) : null,
        cpm: l.cpm ? Number(l.cpm) : null,
        compras: Math.round(somaCompras(l.actions)),
        receita: somaCompras(l.action_values),
        payload: l,
        updated_at: new Date().toISOString(),
      }));
      if (registros.length) {
        const { error } = await supabaseAdmin().from("metricas_anuncios").upsert(registros, { onConflict: "ad_id,data" });
        if (error) throw error;
      }

      const gastoHoje = registros.filter((r) => r.data === dia(0)).reduce((s, r) => s + r.gasto, 0);
      await registrarEvento({
        projetoId: projeto.id,
        slug: projeto.slug,
        funcao: "otimizador",
        tipo: "sync_meta",
        mensagem: `Métricas atualizadas. Gasto hoje: ${reais(gastoHoje)}`,
      });
      resultado[projeto.slug] = registros.length;
    } catch (e) {
      resultado[projeto.slug] = `erro: ${(e as Error).message}`;
    }
  }
  return NextResponse.json({ ok: true, resultado });
}
