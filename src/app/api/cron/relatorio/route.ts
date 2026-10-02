import { NextResponse } from "next/server";
import { cronAutorizado } from "@/lib/cron";
import { coletarLotes } from "@/lib/lotes";
import { projetosAtivos, type Projeto } from "@/lib/projetos";
import { supabaseAdmin } from "@/lib/supabase";
import { registrarEvento } from "@/lib/eventos";
import { gerarRelatorio, type EntradaAnalista } from "@/lib/agentes/analista";
import { enviarTextoZapi } from "@/lib/zapi";
import { comTarefa } from "@/lib/tarefas";

export const maxDuration = 300;

const NOMES_FUNCAO: Record<string, string> = {
  ofertas: "Ofertas",
  "copy-pagina": "Copy de página",
  "copy-estatico": "Copy de estáticos",
  "copy-video": "Roteiro de vídeo",
};

async function montarEntrada(projeto: Projeto, inicio: string, fim: string): Promise<EntradaAnalista> {
  const db = supabaseAdmin();
  const [{ data: metricas, error: e1 }, { data: vendas, error: e2 }] = await Promise.all([
    db
      .from("metricas_anuncios")
      .select("ad_id, ad_name, campaign_name, gasto, impressoes, cliques, compras, receita")
      .eq("projeto_id", projeto.id)
      .gte("data", inicio)
      .lte("data", fim),
    db
      .from("vendas")
      .select("status, valor")
      .eq("projeto_id", projeto.id)
      .gte("created_at", `${inicio}T00:00:00Z`)
      .lte("created_at", `${fim}T23:59:59Z`),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  // Soma os dias de cada anúncio
  const porAnuncio = new Map<string, EntradaAnalista["anuncios"][number]>();
  for (const m of metricas ?? []) {
    const atual = porAnuncio.get(m.ad_id) ?? {
      ad_id: m.ad_id, ad_name: m.ad_name, campanha: m.campaign_name,
      gasto: 0, impressoes: 0, cliques: 0, compras: 0, receita: 0,
    };
    atual.gasto += Number(m.gasto);
    atual.impressoes += Number(m.impressoes);
    atual.cliques += Number(m.cliques);
    atual.compras += Number(m.compras);
    atual.receita += Number(m.receita);
    porAnuncio.set(m.ad_id, atual);
  }

  const pagas = (vendas ?? []).filter((v) => v.status === "paid");
  return {
    projeto: projeto.nome,
    periodo: { inicio, fim },
    anuncios: [...porAnuncio.values()].sort((a, b) => b.gasto - a.gasto),
    vendasKiwify: {
      quantidade: pagas.length,
      faturamento: pagas.reduce((s, v) => s + Number(v.valor ?? 0), 0),
      reembolsos: (vendas ?? []).filter((v) => v.status === "refunded" || v.status === "chargedback").length,
      carrinhosAbandonados: (vendas ?? []).filter((v) => v.status === "abandoned").length,
    },
  };
}

// Todo dia: relatório dos últimos 7 dias por projeto, entregue ao time de copy do squad.
export async function GET(req: Request) {
  if (!cronAutorizado(req)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  await coletarLotes().catch(() => {}); // lotes da rodada diária que terminaram

  const fim = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const inicio = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const resultado: Record<string, string> = {};

  for (const projeto of await projetosAtivos()) {
    try {
      const entrada = await montarEntrada(projeto, inicio, fim);
      if (entrada.anuncios.length === 0 && entrada.vendasKiwify.quantidade === 0) {
        resultado[projeto.slug] = "sem dados no período";
        continue;
      }

      const relatorio = await comTarefa(
        { projetoId: projeto.id, slug: projeto.slug, funcao: "analista", titulo: `Analisando os resultados de ${inicio} a ${fim}` },
        () => gerarRelatorio(entrada),
      );
      const { error } = await supabaseAdmin().from("relatorios").insert({
        projeto_id: projeto.id,
        periodo_inicio: inicio,
        periodo_fim: fim,
        conteudo: relatorio,
        resumo: relatorio.resumo,
      });
      if (error) throw error;

      await registrarEvento({
        projetoId: projeto.id, slug: projeto.slug, funcao: "analista",
        tipo: "relatorio", mensagem: "Relatório pronto! Reunião com o time de copy",
      });
      for (const b of relatorio.briefings) {
        await registrarEvento({
          projetoId: projeto.id, slug: projeto.slug, funcao: b.para,
          tipo: "briefing", mensagem: b.pedido,
        });
      }

      const destino = process.env.RELATORIO_WHATSAPP_DESTINO;
      if (destino) {
        const texto = [
          `📊 *${projeto.nome}*: relatório de ${inicio} a ${fim}`,
          relatorio.resumo,
          relatorio.padroes.length ? `*O que está funcionando*\n${relatorio.padroes.map((p) => `• ${p}`).join("\n")}` : "",
          relatorio.briefings.length
            ? `*Próximos testes*\n${relatorio.briefings.map((b) => `• ${NOMES_FUNCAO[b.para]}: ${b.pedido}`).join("\n")}`
            : "",
          relatorio.alertas.length ? `⚠️ *Alertas*\n${relatorio.alertas.map((a) => `• ${a}`).join("\n")}` : "",
        ].filter(Boolean).join("\n\n");
        await enviarTextoZapi(destino, texto);
      }
      resultado[projeto.slug] = "ok";
    } catch (e) {
      resultado[projeto.slug] = `erro: ${(e as Error).message}`;
    }
  }
  return NextResponse.json({ ok: true, resultado });
}
