import { supabaseAdmin } from "./supabase";
import { registrarEvento } from "./eventos";
import { comTarefa } from "./tarefas";
import { anexosDoPedido, briefingParaOTime, type Referencia } from "./fabrica";
import { analisarOferta } from "./agentes/veredito";
import { explicarErro } from "./agentes/claude";
import { analisarMetaAds } from "./agentes/metaAds";
import { resumirMetricasSincronizadas, resumirPlanilha } from "./planilha";
import type { Briefing, Questionario } from "./agentes/fabrica";

// Análises pedidas no painel: Veredito (oferta e copy) e Lupa (métricas do Meta Ads).
// O pedido é registrado na hora; o agente trabalha em seguida e o painel acompanha.

export type Agente = "analista-ofertas" | "analista-meta";

type Alvo = {
  pagina_url?: string | null;
  ofertas?: string[];
  criativos?: string[];
  links?: string[];
  texto?: string;
};

const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const PLANILHA = /\.(csv|xlsx)$/i;

export async function pedirAnalise(entrada: {
  slug: string;
  autor: string;
  agente: Agente;
  funilId: string | null;
  alvo: Alvo;
  contexto: Record<string, string>;
  arquivos: Referencia[];
  instrucoes: string;
}) {
  const db = supabaseAdmin();
  const { data: projeto } = await db.from("projetos").select("id, slug").eq("slug", entrada.slug).maybeSingle();
  if (!projeto) throw new Error("Projeto não encontrado.");

  let funil: { id: string; codigo: string; pagina_vendas_url: string | null } | null = null;
  if (entrada.funilId) {
    const { data } = await db.from("funis").select("id, codigo, pagina_vendas_url").eq("id", entrada.funilId).eq("projeto_id", projeto.id).maybeSingle();
    if (!data) throw new Error("Funil não encontrado neste projeto.");
    funil = data;
  }
  if (entrada.agente === "analista-ofertas" && !funil) throw new Error("Escolha o funil que o Veredito vai analisar.");

  const links = (entrada.alvo.links ?? []).map((l) => l.trim()).filter((l) => /^https?:\/\//.test(l)).slice(0, 8);
  const alvo: Alvo = {
    pagina_url: entrada.alvo.pagina_url && /^https?:\/\//.test(entrada.alvo.pagina_url) ? entrada.alvo.pagina_url : null,
    ofertas: (entrada.alvo.ofertas ?? []).slice(0, 10),
    criativos: (entrada.alvo.criativos ?? []).slice(0, 20),
    links,
    texto: (entrada.alvo.texto ?? "").slice(0, 30000),
  };
  const arquivos = entrada.arquivos.filter((a) => a.caminho.startsWith(`${entrada.slug}/`)).slice(0, 8);
  if (
    entrada.agente === "analista-meta" &&
    !arquivos.length &&
    !alvo.texto?.trim()
  ) {
    const { count } = await db.from("metricas_anuncios").select("ad_id", { count: "exact", head: true }).eq("projeto_id", projeto.id);
    if (!count) throw new Error("Envie prints, a planilha exportada do Gerenciador ou cole os números: a conta do Meta ainda não está conectada.");
  }

  // A mesma peça (ou conjunto) analisada de novo é comparada com a análise anterior.
  const codigos = await codigosDoAlvo(alvo);
  const chave =
    entrada.agente === "analista-meta"
      ? `meta:${funil?.id ?? "conta"}`
      : [codigos.map((c) => c.replace(/(-R\d+)+$/, "")).sort().join(","), alvo.pagina_url ?? "", links.join(",")].join("|");
  const { data: anterior } = await db
    .from("analises")
    .select("id")
    .eq("projeto_id", projeto.id)
    .eq("agente", entrada.agente)
    .eq("chave", chave)
    .eq("status", "pronta")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await db
    .from("analises")
    .insert({
      projeto_id: projeto.id,
      funil_id: funil?.id ?? null,
      agente: entrada.agente,
      autor: entrada.autor,
      alvo,
      chave,
      contexto: Object.fromEntries(Object.entries(entrada.contexto ?? {}).map(([k, v]) => [k, String(v).slice(0, 2000)])),
      arquivos,
      instrucoes: entrada.instrucoes.slice(0, 4000),
      anterior_id: anterior?.id ?? null,
    })
    .select("id, codigo")
    .single();
  if (error) throw error;
  return data as { id: string; codigo: string | null };
}

async function codigosDoAlvo(alvo: Alvo) {
  const db = supabaseAdmin();
  const [{ data: of }, { data: cr }] = await Promise.all([
    alvo.ofertas?.length ? db.from("ofertas").select("codigo").in("id", alvo.ofertas) : Promise.resolve({ data: [] }),
    alvo.criativos?.length ? db.from("criativos").select("codigo").in("id", alvo.criativos) : Promise.resolve({ data: [] }),
  ]);
  return [...(of ?? []), ...(cr ?? [])].map((x) => (x as { codigo: string | null }).codigo).filter((c): c is string => !!c);
}

const dominio = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};

/** Análise que deu erro volta para a fila com os mesmos dados (sem refazer o pedido). */
export async function repetirAnalise(id: string, slug: string) {
  const db = supabaseAdmin();
  const { data } = await db.from("analises").select("id, status, projetos(slug)").eq("id", id).maybeSingle();
  if (!data || (data.projetos as unknown as { slug: string }).slug !== slug) throw new Error("Análise não encontrada.");
  if (data.status !== "erro") throw new Error("Só dá para tentar de novo uma análise que deu erro.");
  const { error } = await db
    .from("analises")
    .update({ status: "analisando", erro: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** O agente trabalha. Chamado logo depois do pedido (em segundo plano na mesma requisição). */
export async function rodarAnalise(id: string) {
  const db = supabaseAdmin();
  const { data: a, error } = await db
    .from("analises")
    .select("id, codigo, agente, alvo, contexto, arquivos, instrucoes, anterior_id, projeto_id, projetos(slug, nome), funis(id, codigo, nome, briefing, questionario, pagina_vendas_url)")
    .eq("id", id)
    .single();
  if (error || !a) throw new Error("Análise não encontrada.");
  const projeto = a.projetos as unknown as { slug: string; nome: string };
  const funil = a.funis as unknown as { id: string; codigo: string; nome: string; briefing: Briefing | null; questionario: Questionario | null; pagina_vendas_url: string | null } | null;
  const alvo = a.alvo as Alvo;
  const agente = a.agente as Agente;
  const rotulo = a.codigo ?? funil?.codigo ?? projeto.nome;

  const { data: anterior } = a.anterior_id
    ? await db.from("analises").select("codigo, created_at, relatorio").eq("id", a.anterior_id).maybeSingle()
    : { data: null };

  try {
    const relatorio =
      agente === "analista-ofertas"
        ? await comTarefa(
            { projetoId: a.projeto_id, slug: projeto.slug, funcao: agente, titulo: `Analisando oferta e copy ${rotulo}` },
            async () => {
              await registrarEvento({ projetoId: a.projeto_id, slug: projeto.slug, funcao: agente, tipo: "briefing", mensagem: `Auditando ${rotulo} 🔎` });
              const pecas = await carregarPecas(alvo);
              const urls = [alvo.pagina_url, ...(alvo.links ?? [])].filter((u): u is string => !!u);
              return analisarOferta(
                {
                  data: hoje(),
                  funil: { codigo: funil!.codigo, nome: funil!.nome },
                  briefing: funil!.briefing ? briefingParaOTime(funil) : "não há briefing para este funil",
                  pagina_de_vendas: alvo.pagina_url ?? null,
                  pecas,
                  links: alvo.links ?? [],
                  texto_colado: alvo.texto ?? "",
                  instrucoes: a.instrucoes,
                  analise_anterior: anterior ? { codigo: anterior.codigo, data: anterior.created_at, relatorio: anterior.relatorio } : null,
                },
                [...new Set(urls.map(dominio).filter((d): d is string => !!d))],
              );
            },
          )
        : await comTarefa(
            { projetoId: a.projeto_id, slug: projeto.slug, funcao: agente, titulo: `Analisando métricas do Meta Ads ${rotulo}` },
            async () => {
              await registrarEvento({ projetoId: a.projeto_id, slug: projeto.slug, funcao: agente, tipo: "sync_meta", mensagem: `Lendo as métricas ${rotulo} 📈` });
              const arquivos = a.arquivos as Referencia[];
              const planilhas = await Promise.all(
                arquivos.filter((r) => PLANILHA.test(r.nome)).map(async (r) => {
                  const { data } = await db.storage.from("referencias").download(r.caminho);
                  if (!data) return { arquivo: r.nome, erro: "não foi possível baixar" };
                  try {
                    return await resumirPlanilha(r.nome, r.tipo, await data.arrayBuffer());
                  } catch (e) {
                    return { arquivo: r.nome, erro: `não consegui ler: ${(e as Error).message}` };
                  }
                }),
              );
              const anexos = await anexosDoPedido(arquivos.filter((r) => !PLANILHA.test(r.nome)));
              return analisarMetaAds(
                {
                  data: hoje(),
                  projeto: projeto.nome,
                  funil: funil ? { codigo: funil.codigo, nome: funil.nome } : null,
                  contexto: a.contexto as Record<string, string>,
                  planilhas,
                  metricas_sincronizadas: await metricasSincronizadas(a.projeto_id, funil?.codigo ?? null),
                  vendas_reais: await vendasReais(a.projeto_id),
                  numeros_colados: alvo.texto ?? "",
                  instrucoes: a.instrucoes,
                  analise_anterior: anterior ? { codigo: anterior.codigo, data: anterior.created_at, relatorio: anterior.relatorio } : null,
                },
                anexos,
              );
            },
          );

    const nota = "veredito" in relatorio ? relatorio.veredito.nota_geral : null;
    await db
      .from("analises")
      .update({ status: "pronta", relatorio, nota_geral: nota, erro: null, updated_at: new Date().toISOString() })
      .eq("id", id);
    await registrarEvento({
      projetoId: a.projeto_id,
      slug: projeto.slug,
      funcao: agente,
      tipo: "relatorio",
      mensagem: nota !== null ? `Relatório ${rotulo}: nota ${nota}/10 📋` : `Relatório ${rotulo} pronto 📊`,
    });
  } catch (e) {
    await db.from("analises").update({ status: "erro", erro: explicarErro(e), updated_at: new Date().toISOString() }).eq("id", id);
  }
}

/** Peças do quadro no formato que o Veredito lê: código, tipo, status e a copy. */
async function carregarPecas(alvo: Alvo) {
  const db = supabaseAdmin();
  const [{ data: ofertas }, { data: criativos }] = await Promise.all([
    alvo.ofertas?.length
      ? db.from("ofertas").select("codigo, titulo, promessa, preco, bonus, garantia, racional, checkout_url, status").in("id", alvo.ofertas)
      : Promise.resolve({ data: [] }),
    alvo.criativos?.length
      ? db.from("criativos").select("codigo, tipo, formato, status, copy, refaz_de, feedback, ofertas(codigo, titulo, promessa, preco, bonus, garantia)").in("id", alvo.criativos)
      : Promise.resolve({ data: [] }),
  ]);
  const TIPOS: Record<string, string> = { pagina: "página de vendas", estatico: "anúncio estático", video: "roteiro de anúncio em vídeo" };
  return [
    ...(ofertas ?? []).map((o) => ({ tipo: "oferta", ...o })),
    ...(criativos ?? []).map((c) => {
      const { tipo, ...resto } = c as { tipo: string } & Record<string, unknown>;
      return { tipo: TIPOS[tipo] ?? tipo, ...resto };
    }),
  ];
}

async function metricasSincronizadas(projetoId: string, codigoFunil: string | null) {
  const desde = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  let consulta = supabaseAdmin()
    .from("metricas_anuncios")
    .select("data, campaign_name, ad_name, gasto, impressoes, cliques, compras, receita")
    .eq("projeto_id", projetoId)
    .gte("data", desde)
    .limit(5000);
  // Campanhas com o código do funil no nome (ex.: "DPL-WKS-01 | Conversão | Frio").
  if (codigoFunil) consulta = consulta.ilike("campaign_name", `%${codigoFunil}%`);
  const { data } = await consulta;
  return data?.length ? resumirMetricasSincronizadas(data) : null;
}

async function vendasReais(projetoId: string) {
  const desde = new Date(Date.now() - 60 * 86400000).toISOString();
  const { data } = await supabaseAdmin()
    .from("vendas")
    .select("valor, status, created_at")
    .eq("projeto_id", projetoId)
    .gte("created_at", desde)
    .limit(5000);
  if (!data?.length) return null;
  const porDia = new Map<string, { vendas: number; receita: number }>();
  for (const v of data) {
    if (v.status !== "paid") continue;
    const dia = new Date(v.created_at).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const d = porDia.get(dia) ?? { vendas: 0, receita: 0 };
    d.vendas += 1;
    d.receita += Number(v.valor);
    porDia.set(dia, d);
  }
  return { fonte: "Kiwify (vendas aprovadas)", por_dia: [...porDia.entries()].sort().map(([dia, d]) => ({ dia, ...d })) };
}

