import { env } from "./env";

const CAMPOS = [
  "ad_id", "ad_name", "adset_id", "campaign_id", "campaign_name",
  "spend", "impressions", "clicks", "ctr", "cpc", "cpm", "actions", "action_values",
].join(",");

type Acao = { action_type: string; value: string };
export type LinhaInsight = {
  ad_id: string;
  ad_name?: string;
  adset_id?: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: Acao[];
  action_values?: Acao[];
  date_start: string;
};

const TIPOS_COMPRA = ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"];

/** Pega o primeiro tipo de compra presente (evita contar a mesma compra duas vezes). */
export function somaCompras(acoes: Acao[] | undefined): number {
  for (const tipo of TIPOS_COMPRA) {
    const acao = acoes?.find((a) => a.action_type === tipo);
    if (acao) return Number(acao.value) || 0;
  }
  return 0;
}

/** Insights por anúncio e por dia de uma conta de anúncios, com paginação. */
export async function buscarInsights(contaId: string, desde: string, ate: string): Promise<LinhaInsight[]> {
  const versao = process.env.META_API_VERSION || "v23.0";
  const params = new URLSearchParams({
    level: "ad",
    fields: CAMPOS,
    time_range: JSON.stringify({ since: desde, until: ate }),
    time_increment: "1",
    limit: "500",
    access_token: env("META_ACCESS_TOKEN"),
  });
  let url: string | null = `https://graph.facebook.com/${versao}/act_${contaId}/insights?${params}`;
  const linhas: LinhaInsight[] = [];
  while (url) {
    const resposta = await fetch(url);
    const corpo = (await resposta.json()) as {
      data?: LinhaInsight[];
      paging?: { next?: string };
      error?: { message: string };
    };
    if (!resposta.ok || corpo.error) {
      throw new Error(`Meta API: ${corpo.error?.message ?? resposta.status}`);
    }
    linhas.push(...(corpo.data ?? []));
    url = corpo.paging?.next ?? null;
  }
  return linhas;
}
