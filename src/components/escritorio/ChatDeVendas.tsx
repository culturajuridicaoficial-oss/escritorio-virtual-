"use client";

import { useEffect, useRef } from "react";
import { reais } from "./dados";
import type { EventoInfo, ProjetoInfo } from "./tipos";

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

const LIGACOES = new Set(["de", "da", "do", "das", "dos", "e", "por"]);
const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter((p) => p && !LIGACOES.has(p.toLowerCase()))
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");

/**
 * Chat lateral com as vendas do dia, entrando ao vivo.
 * `feed` vem do mais recente para o mais antigo; o chat mostra na ordem de conversa.
 */
export function ChatDeVendas({
  feed,
  projetos,
  mostrarProjeto,
}: {
  feed: EventoInfo[];
  projetos: ProjetoInfo[];
  mostrarProjeto: boolean;
}) {
  const lista = useRef<HTMLOListElement>(null);
  const grudadoNoFim = useRef(true);
  const mensagens = [...feed].reverse();
  const vendas = feed.filter((e) => e.tipo === "venda");
  const total = vendas.reduce((s, v) => s + (v.valor ?? 0), 0);

  // Desce para a última mensagem, a não ser que a pessoa tenha rolado para cima para ler.
  useEffect(() => {
    const el = lista.current;
    if (el && grudadoNoFim.current) el.scrollTop = el.scrollHeight;
  }, [feed.length]);

  return (
    <aside className="chat" aria-label="Chat de vendas">
      <header className="chat-topo">
        <span className="chat-titulo">
          <span className="ponto-vivo" aria-hidden /> CHAT DE VENDAS
        </span>
        <span className="chat-resumo">
          {vendas.length} {vendas.length === 1 ? "venda" : "vendas"} hoje · {reais(total)}
        </span>
      </header>
      <ol
        ref={lista}
        className="chat-lista"
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget;
          grudadoNoFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {mensagens.length === 0 && <li className="chat-vazio">As vendas do dia aparecem aqui, ao vivo.</li>}
        {mensagens.map((m) => {
          const projeto = projetos.find((p) => p.slug === m.projetoSlug);
          if (m.tipo === "meta_batida") {
            return (
              <li key={m.id} className="chat-msg chat-meta">
                <span className="chat-avatar" aria-hidden>🏆</span>
                <div>
                  <span className="chat-quem">
                    {projeto?.nome ?? "Meta"} <time>{hora(m.criadoEm)}</time>
                  </span>
                  <p>
                    Meta do dia batida! <strong>{m.valor ? reais(m.valor) : ""}</strong>
                  </p>
                </div>
              </li>
            );
          }
          const [quem] = m.mensagem.split(" comprou");
          return (
            <li key={m.id} className="chat-msg">
              <span className="chat-avatar" aria-hidden>
                {projeto ? iniciais(projeto.nome) : "🔔"}
              </span>
              <div>
                <span className="chat-quem">
                  {mostrarProjeto && projeto ? projeto.nome : "Nova venda"} <time>{hora(m.criadoEm)}</time>
                </span>
                <p>
                  🔔 {quem} comprou <strong>{m.valor ? reais(m.valor) : ""}</strong>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
