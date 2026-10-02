"use client";

import { useEffect, useRef } from "react";

/** Janela (pop-up) do painel: fecha no ✕, no Esc ou clicando fora. */
export function Janela({
  titulo,
  subtitulo,
  estreita,
  aoFechar,
  children,
}: {
  titulo: React.ReactNode;
  subtitulo?: React.ReactNode;
  estreita?: boolean;
  aoFechar: () => void;
  children: React.ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogo.current?.showModal();
  }, []);
  return (
    <dialog ref={dialogo} className={`janela ${estreita ? "janela-estreita" : ""}`} onClose={aoFechar}
      onClick={(e) => e.target === dialogo.current && dialogo.current?.close()}>
      <div className="janela-conteudo">
        <header className="janela-topo">
          <div>
            {subtitulo && <span className="painel-rotulo">{subtitulo}</span>}
            <h2>{titulo}</h2>
          </div>
          <button className="janela-fechar" onClick={() => dialogo.current?.close()} aria-label="Fechar">✕</button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
