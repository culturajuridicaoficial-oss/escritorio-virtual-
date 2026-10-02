"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MotorRecepcao, MUNDO_RECEPCAO, posicoesDasPortas } from "./motor";
import { reais, resumoDoDia, useDadosAoVivo } from "../escritorio/dados";
import { somDoSino } from "../escritorio/som";
import { BotaoSom } from "../escritorio/BotaoSom";
import { Marca } from "../escritorio/Marca";
import { ChatDeVendas } from "../escritorio/ChatDeVendas";

export function Recepcao() {
  const palco = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const motor = useRef<MotorRecepcao | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const { projetos, agentes, vendas, feed, demo, erro } = useDadosAoVivo((e) => {
    if (!e.projetoSlug) return;
    if (e.tipo === "venda") {
      motor.current?.venda(e.projetoSlug, e.valor);
      somDoSino.tocar();
    } else if (e.tipo === "meta_batida") {
      // espera o cliente chegar à porta antes da festa
      const slug = e.projetoSlug;
      setTimeout(() => {
        motor.current?.comemorarMeta(slug);
        somDoSino.festa();
      }, 2500);
    }
  });

  useEffect(() => {
    if (projetos.length === 0 || !canvas.current || !palco.current) return;
    const m = new MotorRecepcao(canvas.current, projetos.map((p) => ({ slug: p.slug, nome: p.nome })));
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
  }, [projetos]);

  // Portas de quem já bateu a meta hoje ficam com o LED verde e o troféu
  useEffect(() => {
    for (const p of projetos) if (resumoDoDia(vendas, p).bateu) motor.current?.marcarMetaBatida(p.slug);
  }, [projetos, vendas]);

  useEffect(() => {
    if (motor.current) motor.current.hover = hover;
  }, [hover]);

  const portas = posicoesDasPortas(projetos.map((p) => ({ slug: p.slug, nome: p.nome })));
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return (
    <main className="recepcao">
      <header className="topo">
        <div className="topo-esq">
          <Marca subtitulo="Recepção" />
          {demo && <em className="selo">demonstração</em>}
          <BotaoSom />
        </div>
        <p className="topo-legenda">
          <span className="ponto-vivo" aria-hidden /> Sistema ativo · {agentes?.length ?? 0} agentes em{" "}
          {projetos.length} escritórios
        </p>
      </header>

      {erro && <p className="erro">Não foi possível carregar a recepção: {erro}</p>}

      <div className="corpo">
      <div className="corpo-principal">
      <div ref={palco} className="palco" style={{ aspectRatio: `${MUNDO_RECEPCAO.w} / ${MUNDO_RECEPCAO.h}`, maxWidth: `calc((100vh - 260px) * ${MUNDO_RECEPCAO.w / MUNDO_RECEPCAO.h})` }}>
        <canvas ref={canvas} aria-hidden />
        {portas.map((porta) => {
          const projeto = projetos.find((p) => p.slug === porta.slug)!;
          return (
            <Link
              key={porta.slug}
              href={`/escritorio/${porta.slug}`}
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
              <span className="sr-only">Entrar no escritório {projeto.nome}</span>
            </Link>
          );
        })}
      </div>

      <section className="cartoes" aria-label="Escritórios">
        {projetos.map((p) => {
          const r = resumoDoDia(vendas, p);
          const squad = agentes?.filter((a) => a.projetoSlug === p.slug).length ?? 0;
          return (
            <Link key={p.slug} href={`/escritorio/${p.slug}`} className={`cartao ${r.bateu ? "batida" : ""}`}
              onMouseEnter={() => setHover(p.slug)} onMouseLeave={() => setHover(null)}>
              <span className="cartao-rotulo">ESCRITÓRIO</span>
              <strong className="cartao-nome">
                {p.nome}
                {r.bateu ? " 🏆" : ""}
              </strong>
              <span className="cartao-linha">
                {squad} agentes · {r.quantidade} {r.quantidade === 1 ? "venda" : "vendas"} hoje · {reais(r.total)}
              </span>
              {r.meta ? (
                <div className="meta" role="progressbar" aria-valuemin={0} aria-valuemax={r.meta} aria-valuenow={r.total}
                  aria-label={`Meta do dia de ${p.nome}`}>
                  <div style={{ width: `${r.progresso * 100}%` }} />
                  <small>meta {reais(r.meta)}</small>
                </div>
              ) : null}
              <span className="cartao-entrar">Entrar →</span>
            </Link>
          );
        })}
        <Link href="/escritorio" className="cartao cartao-todos">
          <span className="cartao-rotulo">VISÃO GERAL</span>
          <strong className="cartao-nome">Todos os escritórios</strong>
          <span className="cartao-linha">Os squads lado a lado, para a TV</span>
          <span className="cartao-entrar">Abrir →</span>
        </Link>
      </section>
      </div>
      <ChatDeVendas feed={feed} projetos={projetos} mostrarProjeto />
      </div>
    </main>
  );
}
