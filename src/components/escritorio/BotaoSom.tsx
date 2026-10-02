"use client";

import { useEffect, useState } from "react";
import { somDoSino } from "./som";

export function BotaoSom() {
  const [ligado, setLigado] = useState(false);
  useEffect(() => setLigado(somDoSino.ativo), []);

  async function alternar() {
    if (ligado) {
      somDoSino.desativar();
      setLigado(false);
      return;
    }
    const ok = await somDoSino.ativar();
    setLigado(ok);
    if (ok) somDoSino.tocar();
  }

  return (
    <button type="button" className={`som ${ligado ? "ligado" : ""}`} onClick={alternar} aria-pressed={ligado}>
      {ligado ? "🔔 Som ligado" : "🔕 Ativar som"}
    </button>
  );
}
