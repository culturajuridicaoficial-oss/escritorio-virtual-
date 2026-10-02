export type AgenteInfo = {
  id: string;
  nome: string;
  cor: string;
  funcaoId: string;
  funcaoNome: string;
  /** Time da Sala de Marketing (copy, design, trafego, bi, video, dev) ou comercial. */
  time: string;
  ordem: number;
  projetoSlug: string;
  projetoNome: string;
  ultimaFala: string | null;
  tarefasHoje: number;
};

export type EventoInfo = {
  id: number | string;
  agenteId: string | null;
  projetoSlug: string | null;
  tipo: string;
  mensagem: string;
  valor: number | null;
  criadoEm: string;
};

export type ProjetoInfo = {
  id: string;
  slug: string;
  nome: string;
  metaDiaria: number | null;
};

export type TarefaInfo = {
  id: string;
  agenteId: string | null;
  projetoSlug: string | null;
  titulo: string;
  status: "em_andamento" | "concluida" | "erro";
  iniciadaEm: string;
  concluidaEm: string | null;
};
