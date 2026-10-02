import type { AgenteInfo, EventoInfo, TarefaInfo } from "./tipos";

// Modo demonstração: mesmos squads do seed, com eventos simulados.
const FUNCOES: Array<[string, string, string]> = [
  ["ofertas", "Estrategista de ofertas", "copy"],
  ["copy-pagina", "Copywriter de página", "copy"],
  ["copy-estatico", "Copywriter de estáticos", "copy"],
  ["copy-video", "Roteirista de vídeo", "copy"],
  ["paginas", "Construtor de páginas", "dev"],
  ["design", "Designer", "design"],
  ["video", "Editor de vídeo", "video"],
  ["trafego", "Gestor de tráfego", "trafego"],
  ["otimizador", "Otimizador", "trafego"],
  ["analista", "Analista", "bi"],
  ["comercial-popup", "SDR do pop-up", "comercial"],
  ["comercial-carrinho", "Recuperador de carrinho", "comercial"],
  ["comercial-pos", "Pós-venda", "comercial"],
  ["analista-ofertas", "Analista de ofertas", "copy"],
  ["analista-meta", "Analista de Meta Ads", "trafego"],
];
const CORES = ["#e5484d", "#8e4ec6", "#3e63dd", "#12a594", "#f76b15", "#d6409f", "#ffc53d",
  "#0090ff", "#30a46c", "#6e56cf", "#e54666", "#ad7f58", "#46a758", "#f5f5f3", "#5ef0a8"];
const SQUADS: Array<[string, string, string[]]> = [
  ["doido-por-leilao", "Doido Por Leilão",
    ["Otto", "Clara", "Caio", "Vitor", "Paula", "Dani", "Eva", "Teo", "Olga", "Ana", "Lia", "Rui", "Bia"]],
  ["sf-educacao", "SF Educação",
    ["Sofia", "Bruno", "Lara", "Igor", "Nina", "Hugo", "Alice", "Davi", "Rita", "Enzo", "Maya", "Leo", "Iris"]],
  ["vanessa-espansione", "Vanessa Espansione",
    ["Vera", "Murilo", "Tais", "Gael", "Luna", "Saulo", "Cecilia", "Joel", "Helena", "Pietro", "Yara", "Raul", "Zoe"]],
];

// Mesmas funções desativadas no banco (1 agente por time na Sala de Marketing).
const DESATIVADAS = new Set(["copy-pagina", "copy-estatico", "copy-video", "otimizador"]);

export function agentesDemo(): AgenteInfo[] {
  return SQUADS.flatMap(([slug, nomeProjeto, nomes]) =>
    FUNCOES.flatMap(([funcaoId, funcaoNome, time], i) => DESATIVADAS.has(funcaoId) ? [] : [{
      id: `${slug}:${funcaoId}`,
      nome: nomes[i] ?? (funcaoId === "analista-ofertas" ? "Veredito" : "Lupa"),
      cor: CORES[i],
      funcaoId,
      funcaoNome,
      time,
      ordem: i + 1,
      projetoSlug: slug,
      projetoNome: nomeProjeto,
      ultimaFala: null,
      tarefasHoje: Math.floor(Math.random() * 8),
    }]),
  );
}

const FALAS: Record<string, string[]> = {
  "analista-ofertas": ["Nota 6,5: a promessa está vaga", "OM-01: headline sem especificidade", "Oferta pronta para tráfego, com ajustes"],
  "analista-meta": ["CPA 18% acima da meta: fadiga no criativo 3", "Connect rate de 62%: checar a página", "Escalar o conjunto 2 em 20%"],
  ofertas: ["Nova oferta: bônus de aula ao vivo", "Testando preço de R$ 297", "Oferta com garantia de 7 dias"],
  "copy-pagina": ["Reescrevendo a headline", "Seção de objeções pronta", "Página v3 com nova promessa"],
  "copy-estatico": ["5 ganchos novos para testar", "Copy do carrossel pronta", "Variação com prova social"],
  "copy-video": ["Roteiro de 30s pronto", "Gancho dos 3 primeiros segundos", "Roteiro estilo UGC"],
  paginas: ["Página publicada na Vercel", "Ajustando a versão mobile", "Teste A/B no ar"],
  design: ["3 criativos novos gerados", "Ajustando cores da marca", "Formato stories pronto"],
  video: ["Vídeo com narração renderizado", "Cortes para Reels prontos", "Legendas aplicadas"],
  trafego: ["Campanha nova no ar", "Público semelhante criado", "Conjunto de anúncios duplicado"],
  otimizador: ["Pausei anúncio com CPA alto", "Escalando o vencedor em 20%", "Gasto hoje: R$ 812,40"],
  analista: ["Analisando os últimos 7 dias", "CTR subiu 18% na semana", "Ranking dos anúncios pronto"],
  "comercial-popup": ["Oi Paula! Posso te ajudar?", "Lead novo do pop-up", "Enviei o link da página"],
  "comercial-carrinho": ["Oi Marcos, ficou alguma dúvida?", "Carrinho recuperado!", "Enviei cupom de retorno"],
  "comercial-pos": ["Seja bem-vinda, Cláudia!", "Acesso enviado por e-mail", "Pesquisa de satisfação enviada"],
};
const CLIENTES = ["João S.", "Maria L.", "Pedro A.", "Carla M.", "Rafael T.", "Juliana P.", "Bruno C.", "Fernanda R."];
const VALORES = [97, 147, 197, 297, 497, 597];
const sortear = <T,>(lista: T[]) => lista[Math.floor(Math.random() * lista.length)];

let contador = 0;
export function eventoDemo(agentes: AgenteInfo[], forcarVenda = false): EventoInfo {
  const sorte = forcarVenda ? 0 : Math.random();
  const projeto = sortear(SQUADS)[0];
  const doSquad = agentes.filter((a) => a.projetoSlug === projeto);
  const base = { id: `demo-${++contador}`, projetoSlug: projeto, criadoEm: new Date().toISOString() };

  if (sorte < 0.18) {
    const valor = sortear(VALORES);
    return {
      ...base,
      agenteId: `${projeto}:comercial-pos`,
      tipo: "venda",
      mensagem: `${sortear(CLIENTES)} comprou R$ ${valor},00`,
      valor,
    };
  }
  if (sorte < 0.23) {
    return { ...base, agenteId: `${projeto}:analista`, tipo: "relatorio", mensagem: "Relatório pronto! Reunião com o time de copy", valor: null };
  }
  const agente = sortear(doSquad);
  return { ...base, agenteId: agente.id, tipo: "trabalho", mensagem: sortear(FALAS[agente.funcaoId]), valor: null };
}

// Tarefas simuladas: um agente do marketing começa algo e termina alguns segundos depois.
const TAREFAS: Record<string, string[]> = {
  "analista-ofertas": ["Auditando a página de vendas", "Analisando oferta e copy dos estáticos"],
  "analista-meta": ["Analisando métricas dos últimos 7 dias", "Decompondo o CPA por campanha"],
  ofertas: ["Escrevendo oferta, página, 3 estáticos e 2 roteiros", "Lendo a página de vendas e montando o briefing"],
  design: ["Desenhando estático: dor", "Desenhando estático: prova", "Desenhando estático: oferta"],
  video: ["Editando vídeo: curiosidade", "Editando vídeo: transformação"],
  paginas: ["Montando a página de vendas da nova oferta", "Ajustando a versão mobile da página"],
  trafego: ["Atualizando as métricas do Meta Ads", "Montando o público semelhante"],
  analista: ["Analisando os resultados dos últimos 7 dias", "Comparando o CPA dos anúncios"],
};
let contadorTarefa = 0;
export function tarefaDemo(agentes: AgenteInfo[], aoMudar: (t: TarefaInfo) => void) {
  const candidatos = agentes.filter((a) => TAREFAS[a.funcaoId]);
  const agente = sortear(candidatos);
  if (!agente) return;
  const tarefa: TarefaInfo = {
    id: `tarefa-demo-${++contadorTarefa}`,
    agenteId: agente.id,
    projetoSlug: agente.projetoSlug,
    titulo: sortear(TAREFAS[agente.funcaoId]),
    status: "em_andamento",
    iniciadaEm: new Date().toISOString(),
    concluidaEm: null,
  };
  aoMudar(tarefa);
  setTimeout(() => aoMudar({ ...tarefa, status: "concluida", concluidaEm: new Date().toISOString() }), 8000 + Math.random() * 12000);
}
