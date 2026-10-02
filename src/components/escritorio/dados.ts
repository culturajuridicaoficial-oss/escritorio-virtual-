"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase";
import { agentesDemo, eventoDemo, tarefaDemo } from "./demo";
import type { AgenteInfo, EventoInfo, ProjetoInfo, TarefaInfo } from "./tipos";

// Dados ao vivo da recepção e dos escritórios: projetos, agentes, vendas do dia
// e os eventos que chegam pelo Supabase Realtime (ou simulados, no modo demonstração).

// "Hoje" sempre no horário de Brasília (UTC-3, sem horário de verão).
export const diaBrasilia = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const hoje = () => diaBrasilia(new Date());
const inicioDeHoje = () => `${hoje()}T00:00:00-03:00`;
const META_DEMO = 1500;

export const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type LinhaAgente = {
  id: string;
  nome: string;
  cor: string;
  ultima_fala: string | null;
  tarefas_hoje: number;
  updated_at: string;
  funcao_id: string;
  funcoes: { nome: string; ordem: number; time: string } | null;
  projetos: { slug: string; nome: string } | null;
};

type LinhaEvento = {
  id: number;
  agente_id: string | null;
  projeto_id: string | null;
  tipo: string;
  mensagem: string;
  valor: number | null;
  created_at: string;
};

type LinhaTarefa = {
  id: string;
  agente_id: string | null;
  projeto_id: string | null;
  titulo: string;
  status: TarefaInfo["status"];
  iniciada_em: string;
  concluida_em: string | null;
};

function paraTarefa(l: LinhaTarefa, projetos: ProjetoInfo[]): TarefaInfo {
  return {
    id: l.id,
    agenteId: l.agente_id,
    projetoSlug: projetos.find((p) => p.id === l.projeto_id)?.slug ?? l.agente_id?.split(":")[0] ?? null,
    titulo: l.titulo,
    status: l.status,
    iniciadaEm: l.iniciada_em,
    concluidaEm: l.concluida_em,
  };
}

/** Junta uma tarefa nova ou atualizada na lista (mais recente primeiro). */
function juntarTarefa(lista: TarefaInfo[], t: TarefaInfo): TarefaInfo[] {
  const resto = lista.filter((x) => x.id !== t.id);
  return [t, ...resto].sort((a, b) => b.iniciadaEm.localeCompare(a.iniciadaEm)).slice(0, 300);
}

function paraAgente(l: LinhaAgente): AgenteInfo {
  return {
    id: l.id,
    nome: l.nome,
    cor: l.cor,
    funcaoId: l.funcao_id,
    funcaoNome: l.funcoes?.nome ?? l.funcao_id,
    time: l.funcoes?.time ?? "copy",
    ordem: l.funcoes?.ordem ?? 99,
    projetoSlug: l.projetos?.slug ?? "",
    projetoNome: l.projetos?.nome ?? "",
    ultimaFala: l.ultima_fala,
    tarefasHoje: diaBrasilia(new Date(l.updated_at)) === hoje() ? l.tarefas_hoje : 0,
  };
}

function paraEvento(l: LinhaEvento, projetos: ProjetoInfo[]): EventoInfo {
  return {
    id: l.id,
    agenteId: l.agente_id,
    projetoSlug: projetos.find((p) => p.id === l.projeto_id)?.slug ?? l.agente_id?.split(":")[0] ?? null,
    tipo: l.tipo,
    mensagem: l.mensagem,
    valor: l.valor === null ? null : Number(l.valor),
    criadoEm: l.created_at,
  };
}

export type DadosAoVivo = {
  projetos: ProjetoInfo[];
  agentes: AgenteInfo[] | null;
  vendas: EventoInfo[];
  /** Vendas e metas batidas do dia, mais recente primeiro (alimenta o chat de vendas). */
  feed: EventoInfo[];
  /** Tarefas dos agentes de hoje (e as que seguem em andamento), mais recente primeiro. */
  tarefas: TarefaInfo[];
  demo: boolean;
  erro: string | null;
};

/**
 * Carrega tudo uma vez e chama `aoEvento` a cada evento novo.
 * As vendas do dia ficam em `vendas` (mais recente primeiro).
 */
export function useDadosAoVivo(
  aoEvento: (evento: EventoInfo) => void,
  aoTarefa?: (tarefa: TarefaInfo) => void,
): DadosAoVivo {
  const [projetos, setProjetos] = useState<ProjetoInfo[]>([]);
  const [agentes, setAgentes] = useState<AgenteInfo[] | null>(null);
  const [feed, setFeed] = useState<EventoInfo[]>([]);
  const [tarefas, setTarefas] = useState<TarefaInfo[]>([]);
  const callbackTarefa = useRef(aoTarefa);
  callbackTarefa.current = aoTarefa;
  const [demo, setDemo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const callback = useRef(aoEvento);
  callback.current = aoEvento;

  // Carga inicial
  useEffect(() => {
    const db = supabaseNavegador();
    if (!db) {
      const lista = agentesDemo();
      const projetosDemo = [...new Map(lista.map((a) => [a.projetoSlug, a.projetoNome])).entries()].map(
        ([slug, nome]) => ({ id: slug, slug, nome, metaDiaria: META_DEMO }),
      );
      setDemo(true);
      setProjetos(projetosDemo);
      setAgentes(lista);
      return;
    }
    (async () => {
      const [rp, ra] = await Promise.all([
        db.from("projetos").select("id, slug, nome, meta_diaria").eq("ativo", true).order("nome"),
        db
          .from("agentes")
          .select("id, nome, cor, ultima_fala, tarefas_hoje, updated_at, funcao_id, funcoes(nome, ordem, time), projetos(slug, nome)")
          .eq("ativo", true),
      ]);
      if (rp.error || ra.error) return setErro((rp.error ?? ra.error)!.message);
      const listaProjetos: ProjetoInfo[] = (rp.data as { id: string; slug: string; nome: string; meta_diaria: number | null }[]).map(
        (p) => ({ id: p.id, slug: p.slug, nome: p.nome, metaDiaria: p.meta_diaria === null ? null : Number(p.meta_diaria) }),
      );
      setProjetos(listaProjetos);
      setAgentes((ra.data as unknown as LinhaAgente[]).map(paraAgente));

      const { data: ev } = await db
        .from("agente_eventos")
        .select("id, agente_id, projeto_id, tipo, mensagem, valor, created_at")
        .in("tipo", ["venda", "meta_batida"])
        .gte("created_at", inicioDeHoje())
        .order("created_at", { ascending: false })
        .limit(500);
      setFeed(((ev ?? []) as LinhaEvento[]).map((l) => paraEvento(l, listaProjetos)));

      const { data: tf } = await db
        .from("tarefas")
        .select("id, agente_id, projeto_id, titulo, status, iniciada_em, concluida_em")
        .or(`iniciada_em.gte.${inicioDeHoje()},status.eq.em_andamento`)
        .order("iniciada_em", { ascending: false })
        .limit(300);
      const iniciais = ((tf ?? []) as LinhaTarefa[]).map((l) => paraTarefa(l, listaProjetos));
      setTarefas(iniciais);
      for (const t of iniciais) if (t.status === "em_andamento") callbackTarefa.current?.(t);
    })();
  }, []);

  // Eventos ao vivo
  useEffect(() => {
    if (!agentes || projetos.length === 0) return;
    const receber = (evento: EventoInfo) => {
      if (evento.tipo === "venda" || evento.tipo === "meta_batida") setFeed((f) => [evento, ...f].slice(0, 500));
      callback.current(evento);
    };

    if (demo) {
      // No modo demonstração quem avisa da meta é o navegador (no real, é o banco).
      const totais = new Map<string, number>();
      const receberDemo = (evento: EventoInfo) => {
        receber(evento);
        if (evento.tipo !== "venda" || !evento.projetoSlug) return;
        const antes = totais.get(evento.projetoSlug) ?? 0;
        const depois = antes + (evento.valor ?? 0);
        totais.set(evento.projetoSlug, depois);
        if (antes < META_DEMO && depois >= META_DEMO) {
          receber({ ...evento, id: `${evento.id}-meta`, tipo: "meta_batida", mensagem: "Meta do dia batida! 🏆" });
        }
      };
      const primeira = setTimeout(() => receberDemo(eventoDemo(agentes, true)), 1500);
      const id = setInterval(() => receberDemo(eventoDemo(agentes)), 2200);
      const receberTarefa = (t: TarefaInfo) => {
        setTarefas((lista) => juntarTarefa(lista, t));
        callbackTarefa.current?.(t);
      };
      const idTarefas = setInterval(() => tarefaDemo(agentes, receberTarefa), 3000);
      return () => {
        clearTimeout(primeira);
        clearInterval(id);
        clearInterval(idTarefas);
      };
    }

    const db = supabaseNavegador();
    if (!db) return;
    const canal = db
      .channel(`ao-vivo-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agente_eventos" }, (p) =>
        receber(paraEvento(p.new as LinhaEvento, projetos)),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "tarefas" }, (p) => {
        if (!p.new || !("id" in p.new)) return;
        const t = paraTarefa(p.new as LinhaTarefa, projetos);
        setTarefas((lista) => juntarTarefa(lista, t));
        callbackTarefa.current?.(t);
      })
      .subscribe();
    return () => {
      db.removeChannel(canal);
    };
  }, [agentes, projetos, demo]);

  const vendas = feed.filter((e) => e.tipo === "venda");
  return { projetos, agentes, vendas, feed, tarefas, demo, erro };
}

export function resumoDoDia(vendas: EventoInfo[], projeto: ProjetoInfo) {
  const doProjeto = vendas.filter((v) => v.projetoSlug === projeto.slug);
  const total = doProjeto.reduce((s, v) => s + (v.valor ?? 0), 0);
  const meta = projeto.metaDiaria;
  return {
    quantidade: doProjeto.length,
    total,
    meta,
    progresso: meta ? Math.min(1, total / meta) : 0,
    bateu: !!meta && total >= meta,
    ultima: doProjeto[0] ?? null,
  };
}
