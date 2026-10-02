"use client";

import { useEffect, useRef, useState } from "react";

// Ditado por voz nos campos de texto, com o reconhecimento de fala do navegador
// (Chrome e Edge; no Safari depende da versão). O áudio vira texto no próprio campo.

type Resultado = { isFinal: boolean; 0: { transcript: string } };
type Reconhecimento = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<Resultado> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function criarReconhecimento(): Reconhecimento | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Reconhecimento; webkitSpeechRecognition?: new () => Reconhecimento };
  const Classe = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Classe ? new Classe() : null;
}

export function BotaoDeAudio({ aoTexto }: { aoTexto: (texto: string) => void }) {
  const [suportado, setSuportado] = useState(true);
  const [ouvindo, setOuvindo] = useState(false);
  const [parcial, setParcial] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const rec = useRef<Reconhecimento | null>(null);
  const callback = useRef(aoTexto);
  callback.current = aoTexto;

  useEffect(() => {
    setSuportado(!!criarReconhecimento());
    return () => rec.current?.stop();
  }, []);

  const alternar = () => {
    if (ouvindo) {
      rec.current?.stop();
      return;
    }
    const r = criarReconhecimento();
    if (!r) return;
    r.lang = "pt-BR";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let provisorio = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) callback.current(res[0].transcript.trim());
        else provisorio += res[0].transcript;
      }
      setParcial(provisorio);
    };
    r.onerror = (e) => setErro(e.error === "not-allowed" ? "Libere o microfone no navegador." : `Não consegui ouvir (${e.error}).`);
    r.onend = () => {
      setOuvindo(false);
      setParcial("");
    };
    setErro(null);
    rec.current = r;
    r.start();
    setOuvindo(true);
  };

  if (!suportado) {
    return (
      <button type="button" className="painel-audio" disabled title="Este navegador não faz ditado por voz. Use o Chrome.">
        🎙️ Áudio indisponível
      </button>
    );
  }
  return (
    <span className="painel-audio-area">
      <button type="button" className={`painel-audio ${ouvindo ? "gravando" : ""}`} onClick={alternar} aria-pressed={ouvindo}>
        {ouvindo ? "⏺ Ouvindo… clique para parar" : "🎙️ Falar"}
      </button>
      {parcial && <span className="painel-audio-parcial">{parcial}</span>}
      {erro && <span className="painel-audio-erro">{erro}</span>}
    </span>
  );
}

/** Campo de texto com o botão de ditado. `separador` junta o que foi falado ao que já estava escrito. */
export function CampoComAudio({
  valor,
  aoMudar,
  rotulo,
  dica,
  ajuda,
  linhas = 3,
  placeholder,
  separador = " ",
  autoFocus,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  rotulo?: React.ReactNode;
  dica?: React.ReactNode;
  ajuda?: React.ReactNode;
  linhas?: number;
  placeholder?: string;
  separador?: string;
  autoFocus?: boolean;
}) {
  const atual = useRef(valor);
  atual.current = valor;
  return (
    <label className="painel-campo">
      {rotulo && <span>{rotulo} {dica && <small>{dica}</small>}</span>}
      {ajuda && <small className="painel-ajuda">{ajuda}</small>}
      <textarea rows={linhas} value={valor} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => aoMudar(e.target.value)} />
      <BotaoDeAudio aoTexto={(t) => aoMudar(atual.current ? `${atual.current.trimEnd()}${separador}${t}` : t)} />
    </label>
  );
}
