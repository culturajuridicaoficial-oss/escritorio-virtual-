// Base de conhecimento dos produtos (página /escritorio/<projeto>/conhecimento). Cada aba é um
// produto; os campos abaixo são o que a equipe ensina à IA sobre ele.

export const CAMPOS_DO_CONHECIMENTO = [
  { id: "o_que_e", rotulo: "O que é", dica: "Explique o produto como para alguém que nunca ouviu falar." },
  { id: "publico", rotulo: "Para quem é (e para quem não é)", dica: "Perfil do aluno, momento da carreira, área de atuação." },
  { id: "promessa", rotulo: "Promessa e transformação", dica: "O que muda na vida do aluno depois de entrar." },
  { id: "entregaveis", rotulo: "O que o aluno recebe", dica: "Aulas, encontros ao vivo, materiais, comunidade, certificado, frequência." },
  { id: "professores", rotulo: "Professores e especialistas", dica: "Nomes, credenciais e o que cada um ensina." },
  { id: "preco", rotulo: "Preço, planos e pagamento", dica: "Valores, parcelamento, Pix/boleto/cartão, renovação." },
  { id: "garantia", rotulo: "Garantia e cancelamento", dica: "Prazo de garantia, como cancelar, regras de reembolso." },
  { id: "bonus", rotulo: "Bônus", dica: "O que vem junto e por quanto tempo." },
  { id: "diferenciais", rotulo: "Diferenciais", dica: "Por que escolher este e não um concorrente ou um curso avulso." },
  { id: "objecoes", rotulo: "Objeções e como responder", dica: "\"Está caro\", \"não tenho tempo\", \"já faço outro curso\"…" },
  { id: "faq", rotulo: "Perguntas frequentes", dica: "Pergunta e resposta, uma por linha ou em blocos." },
  { id: "acesso", rotulo: "Acesso e suporte", dica: "Como o aluno entra na plataforma, onde pede ajuda, horários." },
  { id: "links", rotulo: "Links", dica: "Página de vendas, checkout, grupo, plataforma." },
  { id: "tom", rotulo: "Tom de voz e cuidados", dica: "Como falar, palavras a evitar, o que nunca prometer." },
  { id: "observacoes", rotulo: "Outras informações", dica: "Qualquer coisa que a IA deva saber e não coube acima." },
] as const;

export type CampoId = (typeof CAMPOS_DO_CONHECIMENTO)[number]["id"];
export type Campos = Partial<Record<CampoId, string>>;

const IDS = new Set<string>(CAMPOS_DO_CONHECIMENTO.map((c) => c.id));

/** Mantém só os campos conhecidos, como texto, sem espaços sobrando. */
export function limparCampos(entrada: unknown): Campos {
  const saida: Campos = {};
  if (!entrada || typeof entrada !== "object") return saida;
  for (const [chave, valor] of Object.entries(entrada)) {
    if (IDS.has(chave) && typeof valor === "string" && valor.trim()) saida[chave as CampoId] = valor.trim().slice(0, 20000);
  }
  return saida;
}
