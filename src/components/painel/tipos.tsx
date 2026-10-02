// Tipos e utilidades do painel do projeto.

export type Briefing = {
  produto: string;
  para_quem: string;
  dores: string[];
  desejos: string[];
  promessa_principal: string;
  mecanismo: string;
  preco_atual: string;
  oferta_atual: string;
  provas: string[];
  objecoes: string[];
  tom_de_voz: string;
  identidade_visual: { cores: string[]; estilo: string };
  restricoes: string[];
};

export type Criativo = {
  id: string;
  codigo: string | null;
  funil_id: string | null;
  tipo: "pagina" | "estatico" | "video";
  copy: Record<string, unknown>;
  html: string | null;
  formato: string | null;
  status: string;
  erro: string | null;
  motivo_reprovacao: string | null;
  feedback: string | null;
  refaz_de: string | null;
  lote_id: string | null;
  created_at: string;
};

export type Oferta = {
  id: string;
  codigo: string | null;
  funil_id: string | null;
  titulo: string;
  promessa: string | null;
  preco: number | null;
  bonus: Array<{ nome: string; descricao: string }> | null;
  garantia: string | null;
  racional: string | null;
  checkout_url: string | null;
  status: string;
  motivo_reprovacao: string | null;
  feedback: string | null;
  pedido_id: string | null;
  created_at: string;
  criativos: Criativo[];
};

export type Entregas = {
  oferta: boolean;
  pagina: boolean;
  estaticos: number;
  formato_estatico: "1080x1080" | "1080x1350" | "1080x1920";
  videos: number;
  duracao_video: 15 | 30 | 60;
};

export type Pedido = {
  id: string;
  funil_id: string | null;
  autor: string;
  texto: string;
  entregas: Entregas;
  referencias: Array<{ nome: string; tipo: string; caminho: string }>;
  links: string[];
  status: "escrevendo" | "produzindo" | "entregue" | "erro";
  erro: string | null;
  created_at: string;
};

export type Projeto = { id: string; slug: string; nome: string; sigla: string };

/** Um briefing = um funil, com código único (ex.: DPL-WKS-01) que todas as peças herdam. */
export type Funil = {
  id: string;
  codigo: string;
  nome: string;
  sigla_produto: string;
  pagina_vendas_url: string | null;
  briefing: Briefing | null;
  questionario: Questionario | null;
  briefing_atualizado_em: string | null;
  created_at: string;
};

/** Respostas do questionário (briefing de produto sem página de vendas). */
export type Questionario = {
  nome: string;
  preco: string;
  formato: string;
  acesso: string;
  garantia: string;
  garantia_condicao: string;
  para_quem: string;
  incluido: string[];
  metodo: string[];
  primeiro_resultado: string;
  bonus: string[];
  de_onde: string;
  aonde: string;
  custo_de_ficar: string;
  prova: string;
  frase_do_cliente: string;
  ja_tentou: string;
  consciencia: string;
  culpado: string;
  diferenciais: string[];
  nao_e_para: string;
  proposito: string;
  problemas: Array<{ problema: string; solucao: string }>;
};

export type Dados = { projeto: Projeto; funis: Funil[]; ofertas: Oferta[]; pedidos: Pedido[]; analises: Analise[] };

// ---------------------------------------------------------------- análises (Veredito e Lupa)

export type OrdemDeMudanca = {
  id: string;
  titulo: string;
  prioridade: "P0" | "P1" | "P2";
  esforco: "baixo" | "medio" | "alto";
  peca: string;
  secao: string;
  local_exato: string;
  trecho_atual: string;
  problema: string;
  por_que_importa: string;
  acao: string;
  exemplo: string;
  criterio_de_aceite: string;
  responsavel: string;
  depende_de: string[];
};

export type RelatorioOferta = {
  titulo: string;
  pecas_analisadas: string[];
  lacunas: string[];
  secoes_puladas: string[];
  veredito: {
    nota_geral: number;
    nota_produto: number;
    nota_oferta: number;
    nota_copy: number;
    diagnostico: string;
    pronto_para_trafego: "sim" | "com_ajustes" | "nao";
    tres_mudancas: string[];
  };
  scorecard: Array<{ camada: string; criterio: string; nota: number | null; justificativa: string }>;
  pontos_fortes: Array<{ onde: string; o_que: string; por_que: string }>;
  pontos_negativos: Array<{ onde: string; o_que: string; impacto: string }>;
  ordens: OrdemDeMudanca[];
  testes_ab: Array<{ hipotese: string; variante_a: string; variante_b: string; metrica: string }>;
  comparacao: { corrigido: string[]; piorou: string[]; pendente: string[] } | null;
};

export type AcaoDoPlano = {
  acao: string;
  onde: string;
  por_que: string;
  resultado_esperado: string;
  tipo: "fazer_agora" | "testar" | "monitorar";
  pede_criativo: boolean;
};

export type RelatorioMeta = {
  titulo: string;
  periodo: string;
  premissas: string[];
  resumo_executivo: string;
  status_da_meta: "dentro" | "fora" | "sem_meta";
  numeros_chave: Array<{ metrica: string; atual: string; anterior: string; variacao: string; status: "dentro" | "fora" | "atencao" | "sem_meta" }>;
  diagnostico: Array<{ afirmacao: string; numero: string }>;
  destaques: {
    melhores: Array<{ nivel: string; nome: string; motivo: string }>;
    piores: Array<{ nivel: string; nome: string; motivo: string }>;
    com_dados_suficientes: string[];
    sem_dados_suficientes: Array<{ nome: string; falta: string }>;
  };
  plano: AcaoDoPlano[];
  alertas: string[];
  dados_faltantes: Array<{ metrica: string; o_que_mudaria: string }>;
};

export type Analise = {
  id: string;
  codigo: string | null;
  agente: "analista-ofertas" | "analista-meta";
  funil_id: string | null;
  autor: string;
  alvo: { pagina_url?: string | null; ofertas?: string[]; criativos?: string[]; links?: string[]; texto?: string };
  contexto: Record<string, string>;
  arquivos: Array<{ nome: string; tipo: string; caminho: string }>;
  instrucoes: string;
  status: "analisando" | "pronta" | "erro";
  relatorio: RelatorioOferta | RelatorioMeta | null;
  nota_geral: number | null;
  anterior_id: string | null;
  erro: string | null;
  created_at: string;
};

export const AGENTES_ANALISTAS = {
  "analista-ofertas": { nome: "Veredito", ao: "ao Veredito", funcao: "Analista de ofertas e copy", icone: "⚖️" },
  "analista-meta": { nome: "Lupa", ao: "à Lupa", funcao: "Analista de Meta Ads", icone: "📈" },
} as const;

/** Sigla do produto sugerida pelo nome: iniciais das palavras que importam (Workshop Leilão Online -> WLO). */
export function sugerirSigla(nome: string) {
  const palavras = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .toUpperCase()
    .split(/\s+/)
    .filter((p) => p.length > 2 && !["COM", "PARA", "DOS", "DAS", "QUE", "UMA", "THE", "AND"].includes(p));
  if (palavras.length >= 3) return palavras.slice(0, 3).map((p) => p[0]).join("");
  if (palavras.length === 2) return palavras[0][0] + palavras[1].slice(0, 2);
  const unica = palavras[0] ?? "";
  return (unica[0] ?? "") + unica.slice(1).replace(/[AEIOU]/g, "").slice(0, 2);
}

/** Próximo código livre para aquele produto no projeto (o banco confirma na criação). */
export function proximoCodigo(projeto: Projeto, funis: Funil[], sigla: string) {
  const n = funis.filter((f) => f.sigla_produto === sigla).length + 1;
  return `${projeto.sigla}-${sigla || "???"}-${String(n).padStart(2, "0")}`;
}

/** Código do funil/peça. Clicar copia (útil para colar no nome da campanha). */
export function Codigo({ codigo, copiavel }: { codigo: string | null | undefined; copiavel?: boolean }) {
  if (!codigo) return null;
  if (!copiavel) return <code className="codigo">{codigo}</code>;
  return (
    <button
      type="button"
      className="codigo copiavel"
      title="Copiar código"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(codigo);
        const alvo = e.currentTarget;
        alvo.dataset.copiado = "1";
        setTimeout(() => delete alvo.dataset.copiado, 1200);
      }}
    >
      {codigo}
    </button>
  );
}

export const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export const ROTULO_STATUS: Record<string, string> = {
  em_producao: "Em produção",
  erro: "Erro",
  rascunho: "Oferta atual (base)",
  aguardando_aprovacao: "Para aprovar",
  aprovada: "Aprovada",
  aprovado: "Aprovado",
  reprovada: "Reprovada",
  reprovado: "Reprovado",
  publicada: "Publicada",
  publicado: "Publicado",
  escrevendo: "Time de copy escrevendo",
  analisando: "Analisando",
  pronta: "Pronta",
  produzindo: "Em produção",
  entregue: "Entregue",
};

export const FORMATOS: Array<[Entregas["formato_estatico"], string]> = [
  ["1080x1080", "Feed quadrado (1080×1080)"],
  ["1080x1350", "Feed retrato (1080×1350)"],
  ["1080x1920", "Stories (1080×1920)"],
];

export function Status({ status }: { status: string }) {
  return <span className={`painel-status s-${status}`}>{ROTULO_STATUS[status] ?? status}</span>;
}

export function resumoDasEntregas(e: Entregas) {
  return [
    e.oferta && "nova oferta",
    e.pagina && "página",
    e.estaticos > 0 && `${e.estaticos} estático${e.estaticos > 1 ? "s" : ""}`,
    e.videos > 0 && `${e.videos} vídeo${e.videos > 1 ? "s" : ""} de ${e.duracao_video}s`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Peça desenhada pelo time (HTML) mostrada em tamanho reduzido, sem scripts. */
export function Peca({ criativo, largura, altura }: { criativo: Criativo; largura?: number; altura?: number }) {
  const [w, h] = (criativo.formato ?? "1080x1080").split("x").map(Number);
  const escala = altura ? altura / h : (largura ?? 300) / w;
  return (
    <div className="painel-peca" style={{ width: w * escala, height: h * escala }}>
      <iframe
        title={criativo.tipo === "video" ? "Vídeo" : "Anúncio estático"}
        srcDoc={criativo.html ?? ""}
        sandbox=""
        width={w}
        height={h}
        style={{ transform: `scale(${escala})` }}
      />
    </div>
  );
}
