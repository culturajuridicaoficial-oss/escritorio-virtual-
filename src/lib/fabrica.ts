import { supabaseAdmin } from "./supabase";
import { registrarEvento } from "./eventos";
import { comTarefa } from "./tarefas";
import { explicarErro } from "./agentes/claude";
import type Anthropic from "@anthropic-ai/sdk";
import {
  Briefing,
  ENTREGA_PADRAO,
  Entregas,
  animarVideo,
  desenharEstatico,
  escreverRodada,
  reescreverOferta,
  reescreverPagina,
  gerarBriefing,
  briefingDoQuestionario,
  Questionario,
  limparHtml,
  type Rodada,
} from "./agentes/fabrica";

// Orquestra a fábrica de criativos: briefing -> rodada de copy -> design de cada peça
// -> aprovação humana. Cada passo vira evento no escritório virtual.

type ProjetoFabrica = { id: string; slug: string; nome: string; sigla: string };

async function carregarProjeto(slug: string): Promise<ProjetoFabrica> {
  const { data, error } = await supabaseAdmin().from("projetos").select("id, slug, nome, sigla").eq("slug", slug).single();
  if (error) throw new Error(`Projeto não encontrado: ${slug}`);
  return data as ProjetoFabrica;
}

// ----------------------------------------------------------------- funis

/** Cada briefing é um funil com código único (ex.: DPL-WKS-01); as peças herdam o código. */
type FunilFabrica = {
  id: string;
  codigo: string;
  nome: string;
  briefing: Briefing | null;
  questionario: Questionario | null;
  pagina_vendas_url: string | null;
  projeto: ProjetoFabrica;
};

/** O que o time recebe como briefing: o briefing + as respostas do dono (quando o funil nasceu do questionário). */
export function briefingParaOTime(funil: { briefing: Briefing | null; questionario?: Questionario | null } | null): Briefing {
  if (!funil?.briefing) throw new Error("A peça não está ligada a um funil com briefing.");
  return (funil.questionario ? { ...funil.briefing, respostas_do_dono: funil.questionario } : funil.briefing) as Briefing;
}

export async function carregarFunil(id: string, slug?: string): Promise<FunilFabrica> {
  const { data, error } = await supabaseAdmin()
    .from("funis")
    .select("id, codigo, nome, briefing, questionario, pagina_vendas_url, projeto:projetos(id, slug, nome, sigla)")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) throw new Error("Funil não encontrado.");
  const funil = data as unknown as FunilFabrica;
  if (slug && funil.projeto.slug !== slug) throw new Error("Este funil é de outro projeto.");
  return funil;
}

/** Código de uma versão refeita: ...-OF-001 -> ...-OF-001-R1 -> ...-OF-001-R2 */
export function codigoRefeito(codigo: string | null) {
  if (!codigo) return null;
  const m = codigo.match(/^(.*)-R(\d+)$/);
  return m ? `${m[1]}-R${Number(m[2]) + 1}` : `${codigo}-R1`;
}

export async function criarFunil(slug: string, dados: { nome: string; sigla: string; url?: string; autor: string }) {
  const projeto = await carregarProjeto(slug);
  const nome = dados.nome.trim().slice(0, 120);
  const sigla = dados.sigla.trim().toUpperCase();
  if (!nome) throw new Error("Dê um nome ao produto.");
  if (!/^[A-Z0-9]{2,5}$/.test(sigla)) throw new Error("A sigla do produto precisa ter de 2 a 5 letras ou números.");
  const { data, error } = await supabaseAdmin().rpc("criar_funil", {
    p_projeto_id: projeto.id,
    p_sigla_produto: sigla,
    p_nome: nome,
    p_url: dados.url?.trim() || null,
    p_autor: dados.autor,
  });
  if (error) throw error;
  const funil = data as { id: string; codigo: string };
  await registrarEvento({ projetoId: projeto.id, slug, funcao: "ofertas", tipo: "briefing", mensagem: `Novo funil ${funil.codigo} 🧭` });
  return funil;
}

export async function renomearFunil(funilId: string, slug: string, nome: string) {
  const funil = await carregarFunil(funilId, slug);
  const limpo = nome.trim().slice(0, 120);
  if (!limpo) throw new Error("Dê um nome ao produto.");
  const { error } = await supabaseAdmin().from("funis").update({ nome: limpo }).eq("id", funil.id);
  if (error) throw error;
}

export async function atualizarBriefing(
  funilId: string,
  slug: string,
  dados: { url?: string; briefing?: unknown; gerar?: boolean; questionario?: unknown },
) {
  const funil = await carregarFunil(funilId, slug);
  const projeto = funil.projeto;
  const url = dados.url ?? funil.pagina_vendas_url;
  let briefing: Briefing;
  let questionario: Questionario | undefined;
  if (dados.questionario) {
    questionario = Questionario.parse(dados.questionario);
    const respostas = questionario;
    // Guarda as respostas antes de chamar o agente: se ele falhar, nada do que foi respondido se perde.
    await supabaseAdmin()
      .from("funis")
      .update({ questionario, nome: questionario.nome.trim().slice(0, 120) || funil.nome })
      .eq("id", funil.id);
    await registrarEvento({ projetoId: projeto.id, slug, funcao: "ofertas", tipo: "briefing", mensagem: "Lendo o questionário do produto 📝" });
    briefing = await comTarefa(
      { projetoId: projeto.id, slug, funcao: "ofertas", titulo: `Montando o briefing ${funil.codigo} pelo questionário` },
      () => briefingDoQuestionario(`${projeto.nome} (produto: ${respostas.nome})`, respostas),
    );
  } else if (dados.gerar) {
    if (!url) throw new Error("Cadastre o link da página de vendas antes de gerar o briefing.");
    await registrarEvento({ projetoId: projeto.id, slug, funcao: "ofertas", tipo: "briefing", mensagem: "Lendo a página de vendas 📄" });
    briefing = await comTarefa(
      { projetoId: projeto.id, slug, funcao: "ofertas", titulo: "Lendo a página de vendas e montando o briefing" },
      () => gerarBriefing(`${projeto.nome} (produto: ${funil.nome})`, url),
    );
  } else {
    briefing = Briefing.parse(dados.briefing);
  }
  const { error } = await supabaseAdmin()
    .from("funis")
    .update({
      briefing,
      pagina_vendas_url: url,
      briefing_atualizado_em: new Date().toISOString(),
      ...(questionario ? { questionario, nome: questionario.nome.trim().slice(0, 120) || funil.nome } : {}),
    })
    .eq("id", funil.id);
  if (error) throw error;
  await registrarEvento({ projetoId: projeto.id, slug, funcao: "ofertas", tipo: "briefing", mensagem: `Briefing ${funil.codigo} pronto ✅` });
  return briefing;
}

// ----------------------------------------------------------------- referências anexadas

export type Referencia = { nome: string; tipo: string; caminho: string };
const BUCKET = "referencias";

/** Baixa os anexos do pedido e monta os blocos de imagem/PDF para o Claude. */
export async function anexosDoPedido(referencias: Referencia[]): Promise<Anthropic.Beta.BetaContentBlockParam[]> {
  const blocos: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const r of referencias.slice(0, 6)) {
    const { data } = await supabaseAdmin().storage.from(BUCKET).download(r.caminho);
    if (!data) continue;
    const base64 = Buffer.from(await data.arrayBuffer()).toString("base64");
    if (r.tipo === "application/pdf") {
      blocos.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 }, title: r.nome });
    } else if (["image/png", "image/jpeg", "image/webp", "image/gif"].includes(r.tipo)) {
      blocos.push({
        type: "image",
        source: { type: "base64", media_type: r.tipo as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data: base64 },
      });
    }
  }
  return blocos;
}

/** URL assinada para o painel enviar um anexo direto ao armazenamento (sem passar pelo servidor). */
export async function urlParaEnviarReferencia(slug: string, nome: string) {
  const seguro = nome.normalize("NFD").replace(/[^\w.-]+/g, "-").slice(-80);
  const caminho = `${slug}/${crypto.randomUUID()}-${seguro}`;
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).createSignedUploadUrl(caminho);
  if (error) throw error;
  return { caminho, token: data.token };
}

type PedidoCarregado = { id: string; texto: string; links: string[]; referencias: Referencia[] };

async function carregarPedido(id: string | null): Promise<PedidoCarregado | null> {
  if (!id) return null;
  const { data } = await supabaseAdmin().from("pedidos").select("id, texto, links, referencias").eq("id", id).maybeSingle();
  return (data as PedidoCarregado | null) ?? null;
}

async function atualizarPedido(id: string, campos: Record<string, unknown>) {
  await supabaseAdmin().from("pedidos").update({ ...campos, updated_at: new Date().toISOString() }).eq("id", id);
}

/** Pedido do painel: registra, e o time de copy escreve na hora o que foi pedido. */
export async function criarPedido(entrada: {
  slug: string;
  funilId: string;
  autor: string;
  texto: string;
  entregas: Entregas;
  links: string[];
  referencias: Referencia[];
}) {
  const funil = await carregarFunil(entrada.funilId, entrada.slug);
  const projeto = funil.projeto;
  if (!funil.briefing) throw new Error(`O funil ${funil.codigo} ainda não tem briefing.`);
  const entregas = Entregas.parse(entrada.entregas);
  if (!entregas.oferta && !entregas.pagina && entregas.estaticos === 0 && entregas.videos === 0) {
    throw new Error("Escolha pelo menos uma entrega.");
  }
  const { data: pedido, error } = await supabaseAdmin()
    .from("pedidos")
    .insert({
      projeto_id: projeto.id,
      funil_id: funil.id,
      autor: entrada.autor,
      texto: entrada.texto.slice(0, 4000),
      entregas,
      links: entrada.links.slice(0, 10),
      referencias: entrada.referencias
        .filter((r) => r.caminho.startsWith(`${entrada.slug}/`))
        .slice(0, 6),
    })
    .select("id")
    .single();
  if (error) throw error;

  await registrarEvento({
    projetoId: projeto.id,
    slug: entrada.slug,
    funcao: "ofertas",
    tipo: "briefing",
    mensagem: `Pedido ${funil.codigo}: ${entrada.texto.slice(0, 60)}`,
  });
  try {
    const resultado = await novaRodada(funil.id, entregas, pedido.id);
    await atualizarPedido(pedido.id, { status: resultado.pendentes.length ? "produzindo" : "entregue" });
    return { pedidoId: pedido.id as string, ...resultado };
  } catch (e) {
    await atualizarPedido(pedido.id, { status: "erro", erro: explicarErro(e) });
    throw e;
  }
}

function descreverEntregas(e: Entregas) {
  const partes = [
    e.oferta && "oferta",
    e.pagina && "página",
    e.estaticos && `${e.estaticos} estático${e.estaticos > 1 ? "s" : ""}`,
    e.videos && `${e.videos} roteiro${e.videos > 1 ? "s" : ""}`,
  ].filter(Boolean);
  return partes.join(", ");
}

/** Ponto 01 a 04: o time de copy escreve o que foi pedido (ou a rodada automática padrão). */
export async function novaRodada(funilId: string, entregas: Entregas = ENTREGA_PADRAO, pedidoId: string | null = null) {
  const prep = await prepararRodada(funilId, entregas, pedidoId);
  const rodada = await comTarefa(prep.tarefa, () => escreverRodada(prep.entrada, prep.anexos));
  return salvarRodada(prep.funil, entregas, rodada, pedidoId);
}

/** Junta o que o time de copy precisa para a rodada (briefing, relatório, histórico e pedido). */
export async function prepararRodada(funilId: string, entregas: Entregas, pedidoId: string | null) {
  const funil = await carregarFunil(funilId);
  const projeto = funil.projeto;
  const slug = projeto.slug;
  if (!funil.briefing) throw new Error(`O funil ${funil.codigo} ainda não tem briefing. Gere o briefing pelo painel.`);
  const db = supabaseAdmin();

  const pedido = await carregarPedido(pedidoId);
  await registrarEvento({
    projetoId: projeto.id,
    slug,
    funcao: "ofertas",
    tipo: "oferta",
    mensagem: pedido ? "Trabalhando no seu pedido ✍️" : "Escrevendo uma nova rodada ✍️",
  });

  const [{ data: relatorio }, { data: ofertasAnteriores }, { data: criativosAnteriores }] = await Promise.all([
    db.from("relatorios").select("conteudo").eq("projeto_id", projeto.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db
      .from("ofertas")
      .select("titulo, promessa, status, motivo_reprovacao")
      .eq("funil_id", funil.id)
      .in("status", ["aprovada", "reprovada", "publicada"])
      .order("created_at", { ascending: false })
      .limit(10),
    db
      .from("criativos")
      .select("tipo, copy, status, motivo_reprovacao")
      .eq("funil_id", funil.id)
      .in("status", ["aprovado", "reprovado", "publicado"])
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const historico = [
    ...(ofertasAnteriores ?? []).map((o) => ({
      tipo: "oferta",
      status: o.status,
      resumo: `${o.titulo}: ${o.promessa ?? ""}`,
      motivo: o.motivo_reprovacao,
    })),
    ...(criativosAnteriores ?? []).map((c) => ({
      tipo: c.tipo,
      status: c.status,
      resumo: JSON.stringify(c.copy).slice(0, 400),
      motivo: c.motivo_reprovacao,
    })),
  ];

  const briefing = briefingParaOTime(funil);
  const anexos = pedido ? await anexosDoPedido(pedido.referencias) : [];
  const titulo = pedido
    ? `${funil.codigo} · ${pedido.texto.slice(0, 70)}${pedido.texto.length > 70 ? "…" : ""} (${descreverEntregas(entregas)})`
    : `${funil.codigo} · rodada automática: ${descreverEntregas(entregas)}`;
  return {
    funil,
    anexos,
    tarefa: { projetoId: projeto.id, slug, funcao: "ofertas", titulo },
    entrada: {
      projeto: projeto.nome,
      briefing,
      relatorio: (relatorio?.conteudo ?? null) as unknown,
      historico,
      entregas,
      pedido: pedido ? { texto: pedido.texto, links: pedido.links } : null,
    },
  };
}

/** Grava a oferta e as peças da rodada; estáticos e vídeos ficam "em produção" para o design. */
export async function salvarRodada(funil: FunilFabrica, entregas: Entregas, rodada: Rodada, pedidoId: string | null) {
  const projeto = funil.projeto;
  const slug = projeto.slug;
  const db = supabaseAdmin();

  const { data: oferta, error } = await db
    .from("ofertas")
    .insert({
      projeto_id: projeto.id,
      funil_id: funil.id,
      titulo: rodada.oferta.titulo,
      promessa: rodada.oferta.promessa,
      preco: rodada.oferta.preco,
      bonus: rodada.oferta.bonus,
      garantia: rodada.oferta.garantia,
      racional: rodada.oferta.racional,
      // Sem oferta nova pedida, a oferta atual entra só como base das peças (não precisa aprovar)
      status: entregas.oferta ? "aguardando_aprovacao" : "rascunho",
      criado_por: `${slug}:ofertas`,
      pedido_id: pedidoId,
    })
    .select("id")
    .single();
  if (error) throw error;

  const linhas = [
    ...(entregas.pagina && rodada.pagina
      ? [{ tipo: "pagina", copy: rodada.pagina, status: "aguardando_aprovacao", formato: "pagina", criado_por: `${slug}:paginas` }]
      : []),
    ...rodada.estaticos
      .slice(0, entregas.estaticos)
      .map((e) => ({ tipo: "estatico", copy: e, status: "em_producao", formato: entregas.formato_estatico, criado_por: `${slug}:design` })),
    ...rodada.videos
      .slice(0, entregas.videos)
      .map((v) => ({ tipo: "video", copy: v, status: "em_producao", formato: "1080x1920", criado_por: `${slug}:video` })),
  ].map((l) => ({ ...l, projeto_id: projeto.id, funil_id: funil.id, oferta_id: oferta.id }));

  const { data: criados, error: erroCriativos } = linhas.length
    ? await db.from("criativos").insert(linhas).select("id, tipo, status")
    : { data: [], error: null };
  if (erroCriativos) throw erroCriativos;

  if (entregas.oferta) {
    await registrarEvento({ projetoId: projeto.id, slug, funcao: "ofertas", tipo: "oferta", mensagem: `Nova oferta: ${rodada.oferta.titulo}` });
  }
  if (entregas.pagina) {
    await registrarEvento({ projetoId: projeto.id, slug, funcao: "paginas", tipo: "criativo", mensagem: "Página nova pronta para aprovação 📄" });
  }

  return {
    ofertaId: oferta.id as string,
    pendentes: (criados ?? []).filter((c) => c.status === "em_producao").map((c) => c.id as string),
  };
}

/** Ponto 06 e 07: o designer e o editor de vídeo produzem a peça de um criativo. */
export async function produzirCriativo(id: string) {
  const prep = await prepararProducao(id);
  if (!prep) return { id, status: "fora_de_producao" };
  try {
    const peca = await comTarefa(prep.tarefa, () =>
      prep.chamada.tipo === "video"
        ? animarVideo(prep.chamada.entrada, prep.anexos)
        : desenharEstatico(prep.chamada.entrada, prep.anexos),
    );
    return await salvarPeca(prep, peca);
  } catch (e) {
    return falharPeca(prep, explicarErro(e));
  }
}

export type Producao = NonNullable<Awaited<ReturnType<typeof prepararProducao>>>;

/** Junta o que o designer ou o editor de vídeo precisa. null se a peça não está para produzir. */
export async function prepararProducao(id: string, opcoes: { semAnexos?: boolean } = {}) {
  const db = supabaseAdmin();
  const { data: criativo, error } = await db
    .from("criativos")
    .select("id, codigo, tipo, copy, status, formato, oferta_id, projeto_id, feedback, refaz_de, lote_id, ofertas(titulo, promessa, preco, bonus, garantia, racional, pedido_id), projetos(slug), funis(briefing, questionario)")
    .eq("id", id)
    .single();
  if (error || !criativo) throw new Error("Criativo não encontrado.");
  if (criativo.status !== "em_producao" && criativo.status !== "erro") return null;

  const projeto = {
    slug: (criativo.projetos as unknown as { slug: string }).slug,
    briefing: briefingParaOTime(criativo.funis as unknown as FunilFabrica | null),
  };
  const oferta = criativo.ofertas as unknown as Rodada["oferta"] & { pedido_id: string | null };
  const funcao = criativo.tipo === "video" ? "video" : "design";
  const pedido = await carregarPedido(oferta.pedido_id);
  const anexos = pedido && !opcoes.semAnexos ? await anexosDoPedido(pedido.referencias.filter((r) => r.tipo.startsWith("image/"))) : [];
  let refacao: { motivo: string; html_anterior: string | null } | null = null;
  if (criativo.refaz_de && criativo.feedback) {
    const { data: anterior } = await db.from("criativos").select("html").eq("id", criativo.refaz_de).maybeSingle();
    refacao = { motivo: criativo.feedback, html_anterior: anterior?.html ?? null };
  }
  const angulo = (criativo.copy as { angulo?: string }).angulo ?? "";
  const chamada =
    criativo.tipo === "video"
      ? {
          tipo: "video" as const,
          entrada: { briefing: projeto.briefing, oferta, video: criativo.copy as Rodada["videos"][number], pedido: pedido?.texto ?? null, refacao },
        }
      : {
          tipo: "estatico" as const,
          entrada: {
            briefing: projeto.briefing,
            oferta,
            anuncio: criativo.copy as Rodada["estaticos"][number],
            formato: criativo.formato ?? "1080x1080",
            pedido: pedido?.texto ?? null,
            refacao,
          },
        };
  return {
    criativo: { id: criativo.id as string, tipo: criativo.tipo as string, copy: criativo.copy, oferta_id: criativo.oferta_id as string | null, lote_id: criativo.lote_id as string | null },
    projetoId: criativo.projeto_id as string,
    slug: projeto.slug,
    funcao,
    pedidoId: pedido?.id ?? null,
    anexos,
    chamada,
    tarefa: {
      projetoId: criativo.projeto_id as string,
      slug: projeto.slug,
      funcao,
      titulo: `${refacao ? "Refazendo" : criativo.tipo === "video" ? "Editando" : "Desenhando"} ${criativo.codigo ?? (criativo.tipo === "video" ? "vídeo" : "estático")}: ${angulo}`,
    },
  };
}

/** Grava a peça pronta: vai para "aguardando aprovação". */
export async function salvarPeca(prep: Producao, peca: { html: string; textos?: unknown }) {
  const { criativo } = prep;
  // No estático, os textos podem ter mudado numa refação: a copy acompanha a arte.
  const copy = peca.textos ? { ...(criativo.copy as object), ...(peca.textos as object) } : criativo.copy;
  await supabaseAdmin()
    .from("criativos")
    .update({ html: limparHtml(peca.html), copy, status: "aguardando_aprovacao", erro: null, lote_id: null, updated_at: new Date().toISOString() })
    .eq("id", criativo.id);
  await registrarEvento({
    projetoId: prep.projetoId,
    slug: prep.slug,
    funcao: prep.funcao,
    tipo: "criativo",
    mensagem: criativo.tipo === "video" ? "Vídeo pronto para aprovação 🎬" : "Criativo pronto para aprovação 🎨",
  });
  await fecharPedidoSeTerminou(criativo.oferta_id, prep.pedidoId);
  return { id: criativo.id, status: "aguardando_aprovacao" };
}

export async function falharPeca(prep: Producao, mensagem: string) {
  await supabaseAdmin()
    .from("criativos")
    .update({ status: "erro", erro: mensagem, lote_id: null, updated_at: new Date().toISOString() })
    .eq("id", prep.criativo.id);
  await fecharPedidoSeTerminou(prep.criativo.oferta_id, prep.pedidoId);
  return { id: prep.criativo.id, status: "erro", erro: mensagem };
}

/**
 * Refazer pelo quadro: a peça atual é reprovada com o motivo e o time faz uma nova versão.
 * Estático e vídeo: nova peça em produção (o painel pede a produção). Página e oferta: reescritas na hora.
 */
export async function refazer(entrada: { tipo: "oferta" | "criativo"; id: string; motivo: string; revisor: string }) {
  const db = supabaseAdmin();
  const agora = new Date().toISOString();
  const motivo = entrada.motivo.trim();
  if (!motivo) throw new Error("Diga o que precisa mudar para o time refazer.");

  if (entrada.tipo === "oferta") {
    const { data: oferta, error } = await db
      .from("ofertas")
      .select("id, codigo, titulo, promessa, preco, bonus, garantia, racional, projeto_id, projetos(slug), funis(briefing, questionario)")
      .eq("id", entrada.id)
      .single();
    if (error) throw error;
    const projeto = {
      slug: (oferta.projetos as unknown as { slug: string }).slug,
      briefing: briefingParaOTime(oferta.funis as unknown as FunilFabrica | null),
    };
    const nova = await comTarefa(
      { projetoId: oferta.projeto_id, slug: projeto.slug, funcao: "ofertas", titulo: `Refazendo oferta ${oferta.codigo ?? ""}: ${oferta.titulo}` },
      () => reescreverOferta({ briefing: projeto.briefing, oferta: oferta as unknown as Rodada["oferta"], motivo }),
    );
    await db
      .from("ofertas")
      .update({ ...nova, codigo: codigoRefeito(oferta.codigo), status: "aguardando_aprovacao", feedback: motivo, motivo_reprovacao: null, revisado_por: entrada.revisor, revisado_em: agora })
      .eq("id", entrada.id);
    await registrarEvento({ projetoId: oferta.projeto_id, slug: projeto.slug, funcao: "ofertas", tipo: "oferta", mensagem: "Oferta refeita, pronta para aprovação ✍️" });
    return { pendentes: [] as string[] };
  }

  const { data: atual, error } = await db
    .from("criativos")
    .select("id, tipo, copy, formato, projeto_id, funil_id, oferta_id, criado_por, ofertas(titulo, promessa, preco, bonus, garantia, racional), projetos(slug), funis(briefing, questionario)")
    .eq("id", entrada.id)
    .single();
  if (error) throw error;
  await db
    .from("criativos")
    .update({ status: "reprovado", motivo_reprovacao: `Refazer: ${motivo}`, revisado_por: entrada.revisor, revisado_em: agora })
    .eq("id", entrada.id);

  const projeto = {
    slug: (atual.projetos as unknown as { slug: string }).slug,
    briefing: briefingParaOTime(atual.funis as unknown as FunilFabrica | null),
  };
  const base = {
    projeto_id: atual.projeto_id,
    funil_id: atual.funil_id,
    oferta_id: atual.oferta_id,
    tipo: atual.tipo,
    formato: atual.formato,
    criado_por: atual.criado_por,
    refaz_de: atual.id,
    feedback: motivo,
  };

  if (atual.tipo === "pagina") {
    const pagina = await comTarefa(
      { projetoId: atual.projeto_id, slug: projeto.slug, funcao: "paginas", titulo: "Refazendo a página de vendas" },
      () => reescreverPagina({ briefing: projeto.briefing, oferta: atual.ofertas as unknown as Rodada["oferta"], pagina: atual.copy, motivo }),
    );
    await db.from("criativos").insert({ ...base, copy: pagina, status: "aguardando_aprovacao" });
    await registrarEvento({ projetoId: atual.projeto_id, slug: projeto.slug, funcao: "paginas", tipo: "criativo", mensagem: "Página refeita, pronta para aprovação 📄" });
    return { pendentes: [] as string[] };
  }

  const { data: nova, error: erroNova } = await db
    .from("criativos")
    .insert({ ...base, copy: atual.copy, status: "em_producao" })
    .select("id")
    .single();
  if (erroNova) throw erroNova;
  return { pendentes: [nova.id as string] };
}

/** Quando a última peça do pedido sai da produção, o pedido vira "entregue". */
async function fecharPedidoSeTerminou(ofertaId: string | null, pedidoId: string | null) {
  if (!ofertaId || !pedidoId) return;
  const { count } = await supabaseAdmin()
    .from("criativos")
    .select("id", { count: "exact", head: true })
    .eq("oferta_id", ofertaId)
    .eq("status", "em_producao");
  if (!count) await atualizarPedido(pedidoId, { status: "entregue" });
}

export async function revisar(entrada: {
  tipo: "oferta" | "criativo";
  id: string;
  decisao: "aprovar" | "reprovar";
  motivo?: string;
  revisor: string;
}) {
  const db = supabaseAdmin();
  const tabela = entrada.tipo === "oferta" ? "ofertas" : "criativos";
  const status =
    entrada.tipo === "oferta"
      ? entrada.decisao === "aprovar" ? "aprovada" : "reprovada"
      : entrada.decisao === "aprovar" ? "aprovado" : "reprovado";
  const { data, error } = await db
    .from(tabela)
    .update({
      status,
      motivo_reprovacao: entrada.decisao === "reprovar" ? (entrada.motivo ?? null) : null,
      revisado_por: entrada.revisor,
      revisado_em: new Date().toISOString(),
    })
    .eq("id", entrada.id)
    .select("projeto_id, projetos(slug)")
    .single();
  if (error) throw error;

  const slug = (data.projetos as unknown as { slug: string }).slug;
  const funcao = entrada.tipo === "oferta" ? "ofertas" : "design";
  await registrarEvento({
    projetoId: data.projeto_id,
    slug,
    funcao,
    tipo: "aprovacao",
    mensagem: entrada.decisao === "aprovar" ? "Aprovado! 🎉" : "Reprovado, vou ajustar na próxima 💪",
  });
  return { status };
}
