import ExcelJS from "exceljs";

// Lê o CSV/XLSX exportado do Gerenciador de Anúncios e calcula as métricas por código
// (o analista recebe os números prontos, não faz conta de cabeça).

type Linha = Record<string, string>;

/** Nome de coluna sem acento, minúsculo e sem pontuação, para casar exportações em português e inglês. */
const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();

// Cada métrica: o primeiro nome de coluna que aparecer na planilha (português ou inglês).
const COLUNAS: Record<string, string[]> = {
  campanha: ["nome da campanha", "campaign name"],
  conjunto: ["nome do conjunto de anuncios", "ad set name"],
  anuncio: ["nome do anuncio", "ad name"],
  dia: ["dia", "day", "data", "date"],
  inicio: ["inicio dos relatorios", "reporting starts"],
  fim: ["termino dos relatorios", "reporting ends"],
  gasto: ["valor usado", "amount spent", "valor gasto"],
  impressoes: ["impressoes", "impressions"],
  alcance: ["alcance", "reach"],
  frequencia: ["frequencia", "frequency"],
  cliques_link: ["cliques no link", "link clicks"],
  lp_views: ["visualizacoes da pagina de destino", "landing page views"],
  video_3s: ["reproducoes de 3 segundos", "3 second video plays", "visualizacoes de 3 segundos do video"],
  thruplays: ["thruplays", "thruplay"],
  resultados: ["resultados", "results"],
  compras: ["compras", "purchases"],
  leads: ["leads", "cadastros"],
  valor_conversao: ["valor de conversao de compras", "purchases conversion value", "valor de conversao"],
  veiculacao: ["veiculacao", "delivery"],
  indicador: ["indicador de resultado", "result indicator", "tipo de resultado"],
};

function acharColunas(cabecalho: string[]) {
  const mapa: Partial<Record<keyof typeof COLUNAS, string>> = {};
  const norm = cabecalho.map((c) => [c, normalizar(c)] as const);
  for (const [chave, nomes] of Object.entries(COLUNAS)) {
    for (const nome of nomes) {
      // nome exato primeiro; depois começo (ex.: "valor usado (brl)")
      const achou = norm.find(([, n]) => n === nome) ?? norm.find(([, n]) => n.startsWith(nome));
      if (achou) {
        mapa[chave as keyof typeof COLUNAS] = achou[0];
        break;
      }
    }
  }
  return mapa;
}

/** "1.234,56" (pt-BR) ou "1,234.56" (en) -> número, conforme o separador decimal do arquivo. */
function numero(v: string | undefined, decimal: "," | "."): number {
  if (!v) return 0;
  let s = v.replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  s = decimal === "," ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Separador decimal do arquivo: o Gerenciador em português usa vírgula ("150,50" e "10.000");
 * em inglês, ponto. Decide pelos valores com centavos; na dúvida, português.
 */
function separadorDecimal(valores: string[]): "," | "." {
  let virgula = 0;
  let ponto = 0;
  for (const v of valores) {
    if (/,\d{1,2}$/.test(v.trim())) virgula++;
    else if (/\.\d{1,2}$/.test(v.trim())) ponto++;
  }
  return ponto > virgula ? "." : ",";
}

/** CSV com aspas, separador , ou ; (o Gerenciador usa vírgula; o Excel em pt-BR salva com ponto e vírgula). */
function lerCsv(texto: string): string[][] {
  const limpo = texto.replace(/^﻿/, "");
  const primeira = limpo.split(/\r?\n/, 1)[0] ?? "";
  const sep = (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpo[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  if (campo || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((c) => c.trim()));
}

async function lerXlsx(conteudo: ArrayBuffer): Promise<string[][]> {
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.load(conteudo);
  const aba = livro.worksheets[0];
  if (!aba) return [];
  const linhas: string[][] = [];
  aba.eachRow({ includeEmpty: false }, (row) => {
    const valores = (row.values as unknown[]).slice(1);
    linhas.push(
      valores.map((v) => {
        if (v === null || v === undefined) return "";
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (typeof v === "object" && "result" in (v as object)) return String((v as { result: unknown }).result ?? "");
        if (typeof v === "object" && "text" in (v as object)) return String((v as { text: unknown }).text ?? "");
        return String(v);
      }),
    );
  });
  return linhas;
}

type Soma = {
  gasto: number;
  impressoes: number;
  alcance: number;
  cliques_link: number;
  lp_views: number;
  video_3s: number;
  thruplays: number;
  resultados: number;
  valor_conversao: number;
};
const SOMAVEIS = ["gasto", "impressoes", "alcance", "cliques_link", "lp_views", "video_3s", "thruplays", "resultados", "valor_conversao"] as const;

const arred = (n: number, casas = 2) => Math.round(n * 10 ** casas) / 10 ** casas;
const div = (a: number, b: number) => (b > 0 ? a / b : null);

/** Métricas derivadas, na mesma ordem da hierarquia: negócio, funil, atenção, entrega. */
function derivadas(s: Soma) {
  const r = (v: number | null, casas = 2) => (v === null ? null : arred(v, casas));
  return {
    gasto: arred(s.gasto),
    resultados: s.resultados,
    cpa: r(div(s.gasto, s.resultados)),
    roas: r(div(s.valor_conversao, s.gasto)),
    valor_conversao: arred(s.valor_conversao),
    conversao_pagina_pct: r(div(s.resultados * 100, s.lp_views)),
    connect_rate_pct: r(div(s.lp_views * 100, s.cliques_link)),
    ctr_link_pct: r(div(s.cliques_link * 100, s.impressoes)),
    cpc_link: r(div(s.gasto, s.cliques_link)),
    // sem reproduções de vídeo (anúncio estático), hook e hold rate não se aplicam
    hook_rate_pct: s.video_3s > 0 ? r(div(s.video_3s * 100, s.impressoes)) : null,
    hold_rate_pct: r(div(s.thruplays * 100, s.video_3s)),
    cpm: r(div(s.gasto * 1000, s.impressoes)),
    impressoes: s.impressoes,
    // alcance não soma entre linhas (a mesma pessoa aparece em vários anúncios): só vale por linha
    frequencia: r(div(s.impressoes, s.alcance)),
    cliques_link: s.cliques_link,
    lp_views: s.lp_views,
  };
}

export type ResumoDaPlanilha = {
  arquivo: string;
  linhas: number;
  colunas_encontradas: string[];
  colunas_faltando: string[];
  periodo: { inicio: string | null; fim: string | null };
  total: ReturnType<typeof derivadas>;
  por_nivel: Record<string, Array<{ nome: string } & ReturnType<typeof derivadas>>>;
  por_dia: Array<{ dia: string } & ReturnType<typeof derivadas>>;
  amostra: Linha[];
  aviso?: string;
};

export async function resumirPlanilha(nome: string, tipo: string, conteudo: ArrayBuffer): Promise<ResumoDaPlanilha> {
  const xlsx = /\.xlsx$/i.test(nome) || tipo.includes("spreadsheetml");
  const tabela = xlsx ? await lerXlsx(conteudo) : lerCsv(new TextDecoder("utf-8").decode(conteudo));
  const [cabecalho = [], ...corpo] = tabela;
  const col = acharColunas(cabecalho);
  const linhas: Linha[] = corpo.map((l) => Object.fromEntries(cabecalho.map((c, i) => [c, l[i] ?? ""])));
  // Exportações trazem uma linha de total no fim (sem nome de campanha/anúncio): fica de fora da soma.
  const nomeDe = (l: Linha) => (col.anuncio && l[col.anuncio]) || (col.conjunto && l[col.conjunto]) || (col.campanha && l[col.campanha]) || "";
  const dados = linhas.filter((l) => !(col.campanha || col.conjunto || col.anuncio) || nomeDe(l).trim());

  const vazia = (): Soma => ({ gasto: 0, impressoes: 0, alcance: 0, cliques_link: 0, lp_views: 0, video_3s: 0, thruplays: 0, resultados: 0, valor_conversao: 0 });
  // XLSX traz número de verdade (ponto decimal); CSV depende do idioma da exportação.
  const decimal = xlsx
    ? "."
    : separadorDecimal(dados.flatMap((l) => [col.gasto, col.valor_conversao, col.frequencia].map((c) => (c ? l[c] ?? "" : ""))));
  const somar = (alvo: Soma, l: Linha) => {
    for (const k of SOMAVEIS) {
      const coluna = k === "resultados" ? col.resultados ?? col.compras ?? col.leads : col[k];
      if (coluna) alvo[k] += numero(l[coluna], decimal);
    }
  };

  const total = vazia();
  const niveis: Record<string, Map<string, Soma>> = {};
  const dias = new Map<string, Soma>();
  for (const l of dados) {
    somar(total, l);
    for (const nivel of ["campanha", "conjunto", "anuncio"] as const) {
      const coluna = col[nivel];
      if (!coluna) continue;
      const chave = l[coluna]?.trim() || "(sem nome)";
      niveis[nivel] ??= new Map();
      const s = niveis[nivel].get(chave) ?? vazia();
      somar(s, l);
      niveis[nivel].set(chave, s);
    }
    if (col.dia && l[col.dia]) {
      const s = dias.get(l[col.dia]) ?? vazia();
      somar(s, l);
      dias.set(l[col.dia], s);
    }
  }

  const datas = [
    ...dados.map((l) => (col.inicio ? l[col.inicio] : "")),
    ...dados.map((l) => (col.fim ? l[col.fim] : "")),
    ...[...dias.keys()],
  ].filter(Boolean).sort();
  const essenciais = ["gasto", "impressoes", "cliques_link", "lp_views", "resultados"] as const;

  return {
    arquivo: nome,
    linhas: dados.length,
    colunas_encontradas: Object.keys(col),
    colunas_faltando: essenciais.filter((k) => !(k === "resultados" ? col.resultados ?? col.compras ?? col.leads : col[k])),
    periodo: { inicio: datas[0] ?? null, fim: datas[datas.length - 1] ?? null },
    total: derivadas(total),
    por_nivel: Object.fromEntries(
      Object.entries(niveis).map(([nivel, mapa]) => [
        nivel,
        [...mapa.entries()]
          .map(([nome, s]) => ({ nome, ...derivadas(s) }))
          .sort((a, b) => b.gasto - a.gasto)
          .slice(0, 60),
      ]),
    ),
    por_dia: [...dias.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, s]) => ({ dia, ...derivadas(s) })).slice(-62),
    amostra: dados.slice(0, 40),
    aviso: cabecalho.length === 0 ? "Planilha vazia ou em formato não reconhecido." : undefined,
  };
}

/** Mesmas contas para as métricas que o sistema já sincroniza do Meta (tabela metricas_anuncios). */
export function resumirMetricasSincronizadas(
  linhas: Array<{ data: string; campaign_name: string | null; ad_name: string | null; gasto: number; impressoes: number; cliques: number; compras: number; receita: number }>,
) {
  const vazia = (): Soma => ({ gasto: 0, impressoes: 0, alcance: 0, cliques_link: 0, lp_views: 0, video_3s: 0, thruplays: 0, resultados: 0, valor_conversao: 0 });
  const somar = (s: Soma, l: (typeof linhas)[number]) => {
    s.gasto += Number(l.gasto);
    s.impressoes += Number(l.impressoes);
    s.cliques_link += Number(l.cliques);
    s.resultados += Number(l.compras);
    s.valor_conversao += Number(l.receita);
  };
  const total = vazia();
  const campanhas = new Map<string, Soma>();
  const anuncios = new Map<string, Soma>();
  const dias = new Map<string, Soma>();
  for (const l of linhas) {
    somar(total, l);
    for (const [mapa, chave] of [[campanhas, l.campaign_name ?? "(sem nome)"], [anuncios, l.ad_name ?? "(sem nome)"], [dias, l.data]] as const) {
      const s = mapa.get(chave) ?? vazia();
      somar(s, l);
      mapa.set(chave, s);
    }
  }
  const lista = (m: Map<string, Soma>) => [...m.entries()].map(([nome, s]) => ({ nome, ...derivadas(s) })).sort((a, b) => b.gasto - a.gasto).slice(0, 60);
  return {
    observacao: "Métricas sincronizadas da API do Meta. Cliques = cliques no link; resultados = compras. Sem visualizações de página nem vídeo.",
    total: derivadas(total),
    por_campanha: lista(campanhas),
    por_anuncio: lista(anuncios),
    por_dia: [...dias.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, s]) => ({ dia, ...derivadas(s) })),
  };
}
