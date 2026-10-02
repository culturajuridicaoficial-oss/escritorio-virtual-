import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { gerarEstruturado, type Chamada } from "./claude";

type Anexos = Anthropic.Beta.BetaContentBlockParam[];

/** O que um pedido (ou a rodada automática) deve entregar. */
export const Entregas = z.object({
  oferta: z.boolean(),
  pagina: z.boolean(),
  estaticos: z.number().int().min(0).max(10),
  formato_estatico: z.enum(["1080x1080", "1080x1350", "1080x1920"]),
  videos: z.number().int().min(0).max(5),
  duracao_video: z.union([z.literal(15), z.literal(30), z.literal(60)]),
});
export type Entregas = z.infer<typeof Entregas>;

export const ENTREGA_PADRAO: Entregas = {
  oferta: true,
  pagina: true,
  estaticos: 3,
  formato_estatico: "1080x1080",
  videos: 2,
  duracao_video: 30,
};

// Fase 2: os agentes que produzem ofertas, páginas e criativos (pontos 01 a 07).
// Tudo sai como "aguardando aprovação" para o /painel.

// ----------------------------------------------------------------- regras comuns

const REGRAS_DE_PUBLICIDADE = `Regras obrigatórias (políticas do Meta e Código de Defesa do Consumidor):
- Nada de promessa de resultado garantido ("ganhe R$ X em Y dias", "garantido", "100% de certeza").
- Nada de depoimento, número de alunos, resultado ou prova que não esteja no briefing. Não invente dados.
- Nada de escassez ou urgência falsa (prazos e vagas só se estiverem no briefing).
- Não fale de características pessoais de quem lê ("você está endividado?", "você é gordo?").
- Antes/depois e alegações de saúde ou renda só com base no briefing e de forma moderada.
Escreva em português do Brasil, direto, no tom de voz do briefing.`;

// ----------------------------------------------------------------- briefing

export const Briefing = z.object({
  produto: z.string().describe("O que é o produto, em 2 ou 3 frases"),
  para_quem: z.string().describe("Público principal"),
  dores: z.array(z.string()),
  desejos: z.array(z.string()),
  promessa_principal: z.string(),
  mecanismo: z.string().describe("Como o produto entrega a promessa (o método, o diferencial)"),
  preco_atual: z.string().describe("Preço e condições como aparecem na página, ou 'não informado'"),
  oferta_atual: z.string().describe("Bônus, garantia e o que vem no pacote hoje"),
  provas: z.array(z.string()).describe("Provas reais que aparecem na página (números, depoimentos, autoridade)"),
  objecoes: z.array(z.string()),
  tom_de_voz: z.string(),
  identidade_visual: z.object({
    cores: z.array(z.string()).describe("Cores em hexadecimal"),
    estilo: z.string().describe("Estilo visual em uma frase"),
  }),
  restricoes: z.array(z.string()).describe("O que nunca dizer ou prometer"),
});
export type Briefing = z.infer<typeof Briefing>;

export async function gerarBriefing(nomeProjeto: string, url: string): Promise<Briefing> {
  const dominio = new URL(url).hostname;
  return gerarEstruturado({
    sistema: `Você é estrategista de marketing de infoprodutos. Leia a página de vendas indicada com a ferramenta web_fetch e monte o briefing do produto para o time de copy e design.
Use somente o que está na página; quando algo não aparecer, escreva "não informado" (ou deixe a lista vazia). Nunca invente provas, números ou depoimentos.
Em identidade_visual, deduza as cores principais e o estilo da própria página.`,
    mensagem: `Projeto: ${nomeProjeto}\nPágina de vendas: ${url}`,
    schema: Briefing,
    esforco: "medium",
    lerPaginas: [dominio],
  });
}

// Briefing sem página de vendas: o dono responde o questionário e o agente monta o briefing.
const texto = z.string().max(4000).default("");
const lista = z.array(z.string().max(1000)).max(40).default([]);
export const Questionario = z.object({
  nome: z.string().min(1).max(120),
  preco: texto,
  formato: texto,
  acesso: texto,
  garantia: texto,
  garantia_condicao: texto,
  para_quem: texto,
  incluido: lista,
  metodo: lista,
  primeiro_resultado: texto,
  bonus: lista,
  de_onde: texto,
  aonde: texto,
  custo_de_ficar: texto,
  prova: texto,
  frase_do_cliente: texto,
  ja_tentou: texto,
  consciencia: texto,
  culpado: texto,
  diferenciais: lista,
  nao_e_para: texto,
  proposito: texto,
  problemas: z.array(z.object({ problema: z.string().max(1000), solucao: z.string().max(1000) })).max(30).default([]),
});
export type Questionario = z.infer<typeof Questionario>;

export async function briefingDoQuestionario(nomeProjeto: string, respostas: Questionario): Promise<Briefing> {
  return gerarEstruturado({
    sistema: `Você é estrategista de marketing de infoprodutos. O dono do produto respondeu um questionário (o produto ainda não tem página de vendas). Monte o briefing para o time de copy e design.
Use somente o que está nas respostas; não invente provas, números, depoimentos, prazos ou garantias. Quando algo não foi respondido, escreva "não informado" (ou deixe a lista vazia).
Como usar as respostas:
- dores: a situação de hoje, a frase literal do cliente (entre aspas, do jeito que ele fala), o que ele já tentou e não funcionou, o custo de continuar como está, e os problemas da tabela.
- desejos: aonde ele chega, o primeiro resultado e o propósito.
- promessa_principal: a transformação de onde ele sai para aonde chega, sem exagerar além da prova.
- mecanismo: o método em 3 passos e os diferenciais (o que o concorrente não faz), com o culpado como inimigo da história.
- oferta_atual: formato, como acessa, o que está incluído, bônus com valores e a garantia com a condição.
- objecoes: deduza das tentativas frustradas, do nível de consciência, de para quem não é e do preço.
- restricoes: inclua não prometer além da prova e não falar com quem o produto não é para.
- tom_de_voz: deduza do jeito que o dono e o cliente falam.
- identidade_visual: o questionário não pergunta isso. Proponha 2 ou 3 cores em hexadecimal coerentes com o produto e escreva no estilo "Sugestão do agente, revise: ...".`,
    mensagem: JSON.stringify({ projeto: nomeProjeto, respostas }),
    schema: Briefing,
    esforco: "medium",
  });
}

// ----------------------------------------------------------------- rodada de copy

const OfertaSchema = z.object({
  titulo: z.string().describe("Nome curto da oferta"),
  promessa: z.string(),
  preco: z.number().nullable().describe("Preço em reais, ou null para manter o atual"),
  bonus: z.array(z.object({ nome: z.string(), descricao: z.string() })),
  garantia: z.string(),
  racional: z.string().describe("Por que essa oferta deve vender mais, citando os dados recebidos"),
});

const PaginaSchema = z.object({
  headline: z.string(),
  subheadline: z.string(),
  cta: z.string().describe("Texto do botão"),
  secoes: z
    .array(z.object({ titulo: z.string(), texto: z.string(), itens: z.array(z.string()) }))
    .describe("De 4 a 6 seções: problema, solução/mecanismo, o que você recebe, bônus, para quem é, garantia"),
  faq: z.array(z.object({ pergunta: z.string(), resposta: z.string() })),
});

const EstaticoSchema = z.object({
  angulo: z.string().describe("O ângulo do anúncio (dor, desejo, prova, curiosidade, oferta...)"),
  headline: z.string().describe("Frase grande da arte, até 8 palavras"),
  apoio: z.string().describe("Frase de apoio da arte, até 14 palavras"),
  cta: z.string().describe("Chamada da arte, até 4 palavras"),
  texto_principal: z.string().describe("Texto que vai acima do anúncio no Meta"),
  titulo_anuncio: z.string().describe("Título que vai abaixo da imagem no Meta, até 40 caracteres"),
});

const VideoSchema = z.object({
  angulo: z.string(),
  gancho: z.string().describe("Frase dos 3 primeiros segundos"),
  duracao_segundos: z.number(),
  cenas: z.array(
    z.object({
      segundos: z.number().describe("Duração da cena"),
      texto_na_tela: z.string().describe("Até 7 palavras"),
      narracao: z.string(),
      visual: z.string().describe("O que aparece na cena"),
    }),
  ),
  cta: z.string(),
  texto_principal: z.string(),
});

export const Rodada = z.object({
  oferta: OfertaSchema,
  pagina: PaginaSchema.nullable().describe("null quando a página de vendas não foi pedida"),
  estaticos: z.array(EstaticoSchema).describe("Exatamente a quantidade de anúncios estáticos pedida, com ângulos diferentes"),
  videos: z.array(VideoSchema).describe("Exatamente a quantidade de vídeos pedida, na duração pedida"),
});
export type Rodada = z.infer<typeof Rodada>;

type EntradaRodada = {
    projeto: string;
    briefing: Briefing;
    relatorio: unknown | null;
    historico: Array<{ tipo: string; status: string; resumo: string; motivo: string | null }>;
    entregas: Entregas;
    pedido: { texto: string; links: string[] } | null;
};

export function escreverRodada(entrada: EntradaRodada, anexos: Anexos = []): Promise<Rodada> {
  return gerarEstruturado(chamadaRodada(entrada, anexos));
}

/** O pedido do time de copy (na hora ou no lote da rodada diária). */
export function chamadaRodada(entrada: EntradaRodada, anexos: Anexos = []): Chamada<typeof Rodada> {
  const { projeto, briefing, ...resto } = entrada;
  return {
    sistema: `Você é o time de copy de um squad de marketing de infoprodutos (estrategista de ofertas, copywriter de página, de anúncios estáticos e roteirista de vídeo).
Em cada entrega você produz o que for pedido em "entregas":
- oferta: se true, crie uma oferta nova; se false, descreva a oferta atual do briefing no campo "oferta" (sem mudar nada), só para dar contexto às peças.
- pagina: se true, escreva a copy da página de vendas; se false, devolva null.
- estaticos e videos: exatamente as quantidades pedidas (zero = lista vazia). Os vídeos devem ter a duracao_video pedida, em segundos.

Quando houver "pedido", ele é a prioridade: siga o que a pessoa escreveu e as referências anexadas (imagens, PDFs e links), sempre dentro das regras abaixo. Se algo do pedido violar as regras, adapte e explique no "racional" da oferta.

Como trabalhar:
- Parta do briefing do produto. Se houver relatório do analista, siga os briefings dele e replique os padrões dos anúncios vencedores.
- Aprenda com o histórico: repita o que foi aprovado e evite o que foi reprovado, respeitando os motivos.
- Cada estático e cada vídeo testa um ângulo diferente.
- Vídeos para Reels e Stories: gancho forte nos 3 primeiros segundos, cenas curtas, texto na tela legível.

${REGRAS_DE_PUBLICIDADE}`,
    contexto: JSON.stringify({ projeto, briefing }),
    mensagem: JSON.stringify(resto),
    schema: Rodada,
    esforco: "high", // criar oferta e copy é onde raciocinar mais paga
    anexos,
    lerPaginas: dominios(entrada.pedido?.links ?? []),
  };
}

function dominios(links: string[]): string[] | undefined {
  const lista = [...new Set(links.flatMap((l) => { try { return [new URL(l).hostname]; } catch { return []; } }))];
  return lista.length ? lista : undefined;
}

// ----------------------------------------------------------------- design (estáticos e vídeos)

export const Peca = z.object({
  html: z.string().describe("Documento HTML completo com CSS embutido"),
  descricao: z.string().describe("Uma frase sobre a escolha visual"),
});
export const PecaEstatica = Peca.extend({
  textos: z
    .object({ headline: z.string(), apoio: z.string(), cta: z.string() })
    .describe("Os textos que ficaram na arte (iguais aos recebidos, a não ser que a refação peça mudança)"),
});

/** Refação: a versão anterior reprovada e o motivo de quem revisou. */
export type Refacao = { motivo: string; html_anterior: string | null } | null;

const REGRAS_DE_REFACAO = `Se houver "refacao", esta é uma nova versão de uma peça que voltou da revisão: corrija exatamente o que o motivo pede e mantenha o que não foi criticado (use o html_anterior como base). Se o motivo pedir mudança de texto, ajuste os textos dentro das regras de publicidade.`;

const REGRAS_DE_HTML = `Regras técnicas do HTML:
- Documento completo e autossuficiente: <!doctype html>, <style> embutido, sem JavaScript.
- Sem imagens ou arquivos externos. Use tipografia, cores, gradientes, formas em CSS/SVG embutido e emojis.
- Pode importar fontes do Google Fonts com @import.
- O <body> deve ter exatamente o tamanho pedido, sem margem e sem rolagem (overflow: hidden).
- Texto grande e legível no celular; contraste alto.`;

type EntradaEstatico = {
  briefing: Briefing;
  oferta: Rodada["oferta"];
  anuncio: Rodada["estaticos"][number];
  formato: string;
  pedido: string | null;
  refacao: Refacao;
};
type EntradaVideo = {
  briefing: Briefing;
  oferta: Rodada["oferta"];
  video: Rodada["videos"][number];
  pedido: string | null;
  refacao: Refacao;
};

export function desenharEstatico(entrada: EntradaEstatico, anexos: Anexos = []): Promise<z.infer<typeof PecaEstatica>> {
  return gerarEstruturado(chamadaEstatico(entrada, anexos));
}

export function animarVideo(entrada: EntradaVideo, anexos: Anexos = []): Promise<z.infer<typeof Peca>> {
  return gerarEstruturado(chamadaVideo(entrada, anexos));
}

// Nas peças de uma mesma rodada, briefing, oferta, pedido e referências são iguais: vão no
// contexto (cache) e só o anúncio ou roteiro de cada peça muda.

export function chamadaEstatico(entrada: EntradaEstatico, anexos: Anexos = []): Chamada<typeof PecaEstatica> {
  const { anuncio, refacao, ...comum } = entrada;
  const [w, h] = entrada.formato.split("x");
  return {
    sistema: `Você é o designer de anúncios estáticos do squad. Crie a arte do anúncio para Instagram/Facebook em ${w}x${h} px.
Se houver pedido ou imagens de referência anexadas, siga o estilo delas (composição, cores, tipografia, clima), sem copiar marcas de terceiros.
Siga a identidade visual do briefing. A arte precisa parar o scroll: hierarquia forte (headline enorme, apoio menor, CTA em destaque), poucos elementos, muito contraste.
Use exatamente os textos recebidos (headline, apoio e CTA), sem acrescentar promessas.
${REGRAS_DE_REFACAO}

${REGRAS_DE_PUBLICIDADE}

${REGRAS_DE_HTML}`,
    contexto: JSON.stringify(comum),
    mensagem: JSON.stringify({ anuncio, refacao }),
    schema: PecaEstatica,
    esforco: "medium",
    anexos,
  };
}

export function chamadaVideo(entrada: EntradaVideo, anexos: Anexos = []): Chamada<typeof Peca> {
  const { video, refacao, ...comum } = entrada;
  return {
    sistema: `Você é o editor de vídeo do squad. Transforme o roteiro num vídeo em motion graphics para Reels/Stories, em 1080x1920 px, feito só com HTML e animações CSS (@keyframes).
Se houver pedido ou imagens de referência anexadas, siga o estilo delas.
Cada cena do roteiro vira um bloco que aparece no seu tempo (use animation-delay com a soma das durações) e some antes da próxima; a última cena traz o CTA.
O vídeo inteiro repete em loop (use a duração total do roteiro no ciclo das animações).
Mostre o texto_na_tela de cada cena em letras grandes, com movimento (entrar, escalar, deslizar), e elementos gráficos que representem o "visual" da cena.
Siga a identidade visual do briefing. Use exatamente os textos do roteiro.
${REGRAS_DE_REFACAO}

${REGRAS_DE_PUBLICIDADE}

${REGRAS_DE_HTML}`,
    contexto: JSON.stringify(comum),
    mensagem: JSON.stringify({ video, refacao }),
    schema: Peca,
    esforco: "medium",
    anexos,
  };
}

// ----------------------------------------------------------------- refação de texto (oferta e página)

export async function reescreverOferta(entrada: {
  briefing: Briefing;
  oferta: Rodada["oferta"];
  motivo: string;
}): Promise<Rodada["oferta"]> {
  return gerarEstruturado({
    sistema: `Você é o estrategista de ofertas do squad. A oferta abaixo voltou da revisão com um motivo. Reescreva a oferta corrigindo exatamente o que o motivo pede e mantendo o que não foi criticado. No racional, diga o que mudou.

${REGRAS_DE_PUBLICIDADE}`,
    contexto: JSON.stringify({ briefing: entrada.briefing }),
    mensagem: JSON.stringify({ oferta: entrada.oferta, motivo: entrada.motivo }),
    schema: OfertaSchema,
    esforco: "medium", // correção pontual pedida no motivo
  });
}

export async function reescreverPagina(entrada: {
  briefing: Briefing;
  oferta: Rodada["oferta"];
  pagina: unknown;
  motivo: string;
}): Promise<z.infer<typeof PaginaSchema>> {
  return gerarEstruturado({
    sistema: `Você é o copywriter de página do squad. A página de vendas abaixo voltou da revisão com um motivo. Reescreva a página corrigindo exatamente o que o motivo pede e mantendo o que não foi criticado.

${REGRAS_DE_PUBLICIDADE}`,
    contexto: JSON.stringify({ briefing: entrada.briefing }),
    mensagem: JSON.stringify({ oferta: entrada.oferta, pagina: entrada.pagina, motivo: entrada.motivo }),
    schema: PaginaSchema,
    esforco: "medium", // correção pontual pedida no motivo
  });
}

/** Defesa extra: o painel mostra as peças em iframe sem scripts, mas limpamos mesmo assim. */
export function limparHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}
