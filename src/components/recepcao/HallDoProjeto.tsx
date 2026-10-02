"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MotorRecepcao, MUNDO_RECEPCAO, posicoesDasPortas } from "./motor";
import { reais, resumoDoDia, useDadosAoVivo } from "../escritorio/dados";
import { somDoSino } from "../escritorio/som";
import { BotaoSom } from "../escritorio/BotaoSom";
import { Marca } from "../escritorio/Marca";
import { TIMES } from "../escritorio/motor";
import { tarefaAtiva } from "../escritorio/ColunaDeTarefas";

// Hall do escritório de um projeto: duas portas, Sala de Marketing e Sala Comercial.
// Cada venda do projeto traz um cliente que entra pela porta da Sala Comercial.

const SALAS = [
  { slug: "marketing", nome: "Sala de Marketing" },
  { slug: "comercial", nome: "Sala Comercial" },
];
const ehMarketing = (time: string) => TIMES.some((t) => t.id === time);

export function HallDoProjeto({ slug }: { slug: string }) {
  const palco = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const motor = useRef<MotorRecepcao | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const { projetos, agentes, vendas, tarefas, demo, erro } = useDadosAoVivo((e) => {
    if (e.projetoSlug !== slug) return;
    if (e.tipo === "venda") {
      motor.current?.venda("comercial", e.valor);
      somDoSino.tocar();
    } else if (e.tipo === "meta_batida") {
      setTimeout(() => {
        motor.current?.comemorarMeta("comercial", `🏆 ${projeto?.nome ?? ""} bateu a meta do dia!`);
        somDoSino.festa();
      }, 2500);
    }
  });

  const projeto = projetos.find((p) => p.slug === slug);
  const naoExiste = projetos.length > 0 && !projeto;

  useEffect(() => {
    if (!projeto || !canvas.current || !palco.current) return;
    const m = new MotorRecepcao(canvas.current, SALAS);
    m.prefixoVenda = "Venda na";
    m.tituloDaParede = projeto.nome;
    m.falasPadrao = [`Bem-vindo ao ${projeto.nome}!`, "Escolha uma sala 👆", "O time está a todo vapor"];
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
  }, [projeto]);

  useEffect(() => {
    if (motor.current) motor.current.hover = hover;
  }, [hover]);

  const resumo = projeto ? resumoDoDia(vendas, projeto) : null;
  useEffect(() => {
    if (resumo?.bateu) motor.current?.marcarMetaBatida("comercial");
  }, [resumo?.bateu]);

  const doProjeto = agentes?.filter((a) => a.projetoSlug === slug) ?? [];
  const marketing = doProjeto.filter((a) => ehMarketing(a.time));
  const comercial = doProjeto.filter((a) => !ehMarketing(a.time));
  const emTarefa = tarefas.filter((t) => t.projetoSlug === slug && tarefaAtiva(t));
  const portas = posicoesDasPortas(SALAS);
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  if (naoExiste) {
    return (
      <main className="recepcao">
        <p className="erro">
          Este escritório não existe. <Link href="/">Voltar para a recepção</Link>
        </p>
      </main>
    );
  }

  return (
    <main className="recepcao">
      <header className="topo">
        <div className="topo-esq">
          <Marca subtitulo={`Escritório · ${projeto?.nome ?? ""}`} />
          <Link href="/" className="voltar">← Recepção</Link>
          {demo && <em className="selo">demonstração</em>}
          <BotaoSom />
          <Link href={`/escritorio/${slug}/painel`} className="atalho-painel">📋 Painel do projeto</Link>
        </div>
        <p className="topo-legenda">
          <span className="ponto-vivo" aria-hidden /> {doProjeto.length} agentes · {emTarefa.length} em tarefa agora
        </p>
      </header>

      {erro && <p className="erro">Não foi possível carregar o escritório: {erro}</p>}

      <div
        ref={palco}
        className="palco"
        style={{ aspectRatio: `${MUNDO_RECEPCAO.w} / ${MUNDO_RECEPCAO.h}`, maxWidth: `calc((100vh - 260px) * ${MUNDO_RECEPCAO.w / MUNDO_RECEPCAO.h})` }}
      >
        <canvas ref={canvas} aria-hidden />
        {portas.map((porta) => {
          const sala = SALAS.find((s) => s.slug === porta.slug)!;
          return (
            <Link
              key={porta.slug}
              href={`/escritorio/${slug}/${porta.slug}`}
              className="porta"
              style={{
                left: pct(porta.x - 20, MUNDO_RECEPCAO.w),
                top: pct(porta.y - 56, MUNDO_RECEPCAO.h),
                width: pct(porta.w + 40, MUNDO_RECEPCAO.w),
                height: pct(porta.h + 56, MUNDO_RECEPCAO.h),
              }}
              onMouseEnter={() => setHover(porta.slug)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(porta.slug)}
              onBlur={() => setHover(null)}
            >
              <span className="porta-dica">Entrar →</span>
              <span className="sr-only">Entrar na {sala.nome}</span>
            </Link>
          );
        })}
      </div>

      <section className="cartoes cartoes-salas" aria-label="Salas">
        <Link href={`/escritorio/${slug}/marketing`} className="cartao"
          onMouseEnter={() => setHover("marketing")} onMouseLeave={() => setHover(null)}>
          <span className="cartao-rotulo">SALA</span>
          <strong className="cartao-nome">Sala de Marketing</strong>
          <span className="cartao-linha">
            {marketing.length} agentes · {TIMES.length} times · {emTarefa.length === 0 ? "ninguém em tarefa agora" : `${emTarefa.length} em tarefa agora`}
          </span>
          {emTarefa[0] && <span className="cartao-linha">⏳ {emTarefa[0].titulo}</span>}
          <span className="cartao-entrar">Entrar →</span>
        </Link>
        <Link href={`/escritorio/${slug}/comercial`} className={`cartao ${resumo?.bateu ? "batida" : ""}`}
          onMouseEnter={() => setHover("comercial")} onMouseLeave={() => setHover(null)}>
          <span className="cartao-rotulo">SALA</span>
          <strong className="cartao-nome">
            Sala Comercial{resumo?.bateu ? " 🏆" : ""}
          </strong>
          <span className="cartao-linha">
            {comercial.length} agentes · {resumo?.quantidade ?? 0} {resumo?.quantidade === 1 ? "venda" : "vendas"} hoje · {reais(resumo?.total ?? 0)}
          </span>
          {resumo?.meta ? (
            <div className="meta" role="progressbar" aria-valuemin={0} aria-valuemax={resumo.meta} aria-valuenow={resumo.total}
              aria-label="Meta do dia">
              <div style={{ width: `${resumo.progresso * 100}%` }} />
              <small>meta {reais(resumo.meta)}</small>
            </div>
          ) : null}
          <span className="cartao-entrar">Entrar →</span>
        </Link>
      </section>
    </main>
  );
}
