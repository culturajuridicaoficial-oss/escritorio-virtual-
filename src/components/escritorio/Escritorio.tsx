"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { MotorEscritorio, TIMES, tamanhoDoMundo, type SalaDoProjeto } from "./motor";
import { somDoSino } from "./som";
import { reais, resumoDoDia, useDadosAoVivo } from "./dados";
import { BotaoSom } from "./BotaoSom";
import { Marca } from "./Marca";
import { ChatDeVendas } from "./ChatDeVendas";
import { ColunaDeTarefas, tarefaAtiva } from "./ColunaDeTarefas";
import { Crm } from "./Crm";
import type { EventoInfo } from "./tipos";

const NOME_DA_SALA: Record<SalaDoProjeto, string> = { marketing: "Sala de Marketing", comercial: "Sala Comercial" };
const ehMarketing = (time: string) => TIMES.some((t) => t.id === time);

/**
 * Uma sala do escritório de um projeto (`slug` + `sala`) ou todos os squads juntos (sem `slug`).
 * Sala de Marketing: times em filas e a coluna de tarefas. Sala Comercial: sino e chat de vendas.
 */
export function Escritorio({ slug, sala }: { slug?: string; sala?: SalaDoProjeto }) {
  const palco = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const motor = useRef<MotorEscritorio | null>(null);

  const doEscritorio = (e: EventoInfo) => !slug || e.projetoSlug === slug;
  const { projetos, agentes, vendas, feed, tarefas, demo, erro } = useDadosAoVivo((e) => {
    if (doEscritorio(e)) motor.current?.aplicar(e);
  });

  const projetosAqui = slug ? projetos.filter((p) => p.slug === slug) : projetos;
  const agentesAqui =
    agentes?.filter(
      (a) =>
        (!slug || a.projetoSlug === slug) &&
        (!sala || (sala === "marketing" ? ehMarketing(a.time) : !ehMarketing(a.time))),
    ) ?? null;
  const naoExiste = slug && projetos.length > 0 && projetosAqui.length === 0;
  const mundo = tamanhoDoMundo(slug ? 1 : projetosAqui.length, sala);

  // Liga o motor de desenho
  useEffect(() => {
    if (!agentesAqui || agentesAqui.length === 0 || !canvas.current || !palco.current) return;
    const m = new MotorEscritorio(canvas.current, agentesAqui, sala);
    m.aoTocarSino = () => somDoSino.tocar();
    m.aoComemorarMeta = () => somDoSino.festa();
    motor.current = m;
    const observador = new ResizeObserver(([e]) => m.redimensionar(e.contentRect.width));
    observador.observe(palco.current);
    let quadro = 0;
    const loop = (t: number) => {
      m.passo(t);
      m.desenhar(t);
      quadro = requestAnimationFrame(loop);
    };
    quadro = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(quadro);
      observador.disconnect();
      motor.current = null;
    };
    // O motor é recriado só quando a lista de agentes muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentes, slug, sala]);

  // Agente com tarefa aberta fica trabalhando na mesa; ao terminar, volta ao normal.
  const tarefasAqui = tarefas.filter((t) => !slug || t.projetoSlug === slug);
  useEffect(() => {
    const m = motor.current;
    if (!m || !agentesAqui) return;
    for (const a of agentesAqui) {
      const atual = tarefasAqui.find((t) => t.agenteId === a.id && tarefaAtiva(t));
      m.ocupar(a.id, atual ? atual.titulo : null);
    }
  });

  const vendasAqui = vendas.filter(doEscritorio);
  const ultima = vendasAqui[0];
  const nomeProjeto = projetosAqui[0]?.nome ?? "";
  const comCrm = !!slug && sala === "comercial";
  const titulo = slug ? `${nomeProjeto}${sala ? ` · ${NOME_DA_SALA[sala]}` : ""}` : "Todos os escritórios";

  return (
    <main className="escritorio">
      <header className="topo">
        <div className="topo-esq">
          <Marca subtitulo={titulo ? `Escritório · ${titulo}` : "Escritório"} />
          {slug && <Link href={`/escritorio/${slug}`} className="voltar">← {nomeProjeto || "Projeto"}</Link>}
          <Link href="/" className="voltar">{slug ? "Recepção" : "← Recepção"}</Link>
          {demo && <em className="selo">demonstração</em>}
          <BotaoSom />
          {slug && <Link href={`/escritorio/${slug}/painel`} className="atalho-painel">📋 Painel do projeto</Link>}
        </div>
        <div className="ticker" aria-live="polite">
          {ultima ? (
            <span key={ultima.id}>
              🔔 {ultima.mensagem}
              {!slug && ultima.projetoSlug && (
                <small> · {projetos.find((p) => p.slug === ultima.projetoSlug)?.nome}</small>
              )}
            </span>
          ) : (
            <span className="apagado">Esperando a primeira venda do dia…</span>
          )}
        </div>
        <ul className="placar">
          {projetosAqui.map((p) => {
            const r = resumoDoDia(vendas, p);
            return (
              <li key={p.slug} className={r.bateu ? "batida" : ""}>
                <span>
                  {slug ? "Hoje" : p.nome}
                  {r.bateu ? " 🏆" : ""}
                </span>
                <strong>
                  {r.quantidade} {r.quantidade === 1 ? "venda" : "vendas"} · {reais(r.total)}
                </strong>
                {r.meta ? (
                  <div className="meta" role="progressbar" aria-valuemin={0} aria-valuemax={r.meta} aria-valuenow={r.total}
                    aria-label={`Meta do dia de ${p.nome}`}>
                    <div style={{ width: `${r.progresso * 100}%` }} />
                    <small>meta {reais(r.meta)}</small>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </header>

      {erro && <p className="erro">Não foi possível carregar o time: {erro}</p>}
      {naoExiste ? (
        <p className="erro">
          Este escritório não existe. <Link href="/">Voltar para a recepção</Link>
        </p>
      ) : (
        <div className={`corpo ${sala === "marketing" ? "sala-marketing" : ""}`}>
          {sala === "marketing" && agentesAqui && <ColunaDeTarefas agentes={agentesAqui} tarefas={tarefasAqui} />}
          <div className="corpo-principal">
            {/* Na Sala Comercial a sala ocupa a metade de cima e o CRM fica embaixo. */}
            <div ref={palco} className="palco" style={{ aspectRatio: `${mundo.w} / ${mundo.h}`, maxWidth: `calc((${comCrm ? "50vh - 60px" : "100vh - 110px"}) * ${mundo.w / mundo.h})` }}>
              <canvas ref={canvas} aria-label={`Escritório virtual: ${titulo}`} />
            </div>
            {comCrm && <Crm slug={slug} />}
          </div>
          {sala !== "marketing" && <ChatDeVendas feed={feed.filter(doEscritorio)} projetos={projetos} mostrarProjeto={!slug} />}
        </div>
      )}
    </main>
  );
}
