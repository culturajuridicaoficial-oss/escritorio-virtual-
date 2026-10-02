"use client";

import { useEffect, useState } from "react";
import { TIMES } from "./motor";
import type { AgenteInfo, TarefaInfo } from "./tipos";

// Tarefa "em andamento" há mais que isso provavelmente foi interrompida (ex.: tempo
// limite do servidor) e não deve aparecer como se o agente ainda estivesse nela.
export const TAREFA_PARADA_MS = 15 * 60 * 1000;

export const tarefaAtiva = (t: TarefaInfo, agora = Date.now()) =>
  t.status === "em_andamento" && agora - new Date(t.iniciadaEm).getTime() < TAREFA_PARADA_MS;

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

function decorrido(iso: string, agora: number) {
  const s = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

/** Coluna da esquerda do escritório: o que cada agente do marketing está fazendo agora. */
export function ColunaDeTarefas({ agentes, tarefas }: { agentes: AgenteInfo[]; tarefas: TarefaInfo[] }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const marketing = TIMES.flatMap((time) =>
    agentes.filter((a) => a.time === time.id).sort((a, b) => a.ordem - b.ordem).map((a) => ({ agente: a, time: time.nome })),
  );
  const ativas = tarefas.filter((t) => tarefaAtiva(t, agora));
  const concluidas = tarefas.filter((t) => t.status !== "em_andamento").slice(0, 12);

  return (
    <aside className="tarefas" aria-label="Tarefas do time de marketing">
      <header className="chat-topo">
        <span className="chat-titulo">
          <span className="ponto-vivo" aria-hidden /> TAREFAS AGORA
        </span>
        <span className="chat-resumo">
          {ativas.length === 0 ? "Ninguém em tarefa agora" : `${ativas.length} em andamento`}
        </span>
      </header>

      <ul className="tarefas-lista">
        {marketing.map(({ agente, time }) => {
          const atual = ativas.find((t) => t.agenteId === agente.id);
          const ultima = tarefas.find((t) => t.agenteId === agente.id && t.status !== "em_andamento");
          return (
            <li key={agente.id} className={`tarefa-agente ${atual ? "ocupado" : ""}`}>
              <span className="tarefa-avatar" style={{ background: agente.cor }} aria-hidden>
                {agente.nome[0]}
              </span>
              <div>
                <span className="tarefa-quem">
                  <strong>{agente.nome}</strong> · {time}
                </span>
                {atual ? (
                  <p className="tarefa-atual">
                    <span className="tarefa-girando" aria-hidden /> {atual.titulo}
                    <time> · há {decorrido(atual.iniciadaEm, agora)}</time>
                  </p>
                ) : (
                  <p className="tarefa-livre">
                    Disponível
                    {ultima && (
                      <span>
                        {" "}· {ultima.status === "erro" ? "⚠" : "✓"} {ultima.titulo} ({hora(ultima.concluidaEm ?? ultima.iniciadaEm)})
                      </span>
                    )}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <h3 className="tarefas-subtitulo">Concluídas hoje</h3>
      <ol className="tarefas-feitas">
        {concluidas.length === 0 && <li className="chat-vazio">Nada concluído ainda hoje.</li>}
        {concluidas.map((t) => {
          const agente = agentes.find((a) => a.id === t.agenteId);
          return (
            <li key={t.id} className={t.status === "erro" ? "erro" : ""}>
              <time>{hora(t.concluidaEm ?? t.iniciadaEm)}</time>
              <span>
                {t.status === "erro" ? "⚠" : "✓"} <strong>{agente?.nome ?? "Agente"}</strong> {t.titulo}
              </span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
