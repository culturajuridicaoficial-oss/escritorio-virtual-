import { NextResponse } from "next/server";
import { erroJson, exigirEquipe } from "@/lib/equipe";
import { atualizarBriefing } from "@/lib/fabrica";

export const maxDuration = 300;

// { projeto, funil, url?, gerar?: true } lê a página de vendas; { questionario } monta pelo questionário;
// { briefing } salva o editado.
export async function POST(req: Request) {
  const auth = await exigirEquipe(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const corpo = await req.json();
    const briefing = await atualizarBriefing(String(corpo.funil ?? ""), corpo.projeto, { url: corpo.url, briefing: corpo.briefing, gerar: corpo.gerar, questionario: corpo.questionario });
    return NextResponse.json({ briefing });
  } catch (e) {
    return erroJson(e);
  }
}
