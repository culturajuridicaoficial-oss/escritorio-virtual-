import { NextResponse } from "next/server";
import { erroJson, exigirEquipe } from "@/lib/equipe";
import { criarFunil, renomearFunil } from "@/lib/fabrica";

// Novo briefing (funil) no projeto: { projeto, nome, sigla, url? } -> { id, codigo }
export async function POST(req: Request) {
  const auth = await exigirEquipe(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const corpo = await req.json();
    const funil = await criarFunil(String(corpo.projeto ?? ""), {
      nome: String(corpo.nome ?? ""),
      sigla: String(corpo.sigla ?? ""),
      url: corpo.url ? String(corpo.url) : undefined,
      autor: auth.email,
    });
    return NextResponse.json({ id: funil.id, codigo: funil.codigo });
  } catch (e) {
    return erroJson(e);
  }
}

// Renomear: { projeto, funil, nome }. O código do funil não muda.
export async function PATCH(req: Request) {
  const auth = await exigirEquipe(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const corpo = await req.json();
    await renomearFunil(String(corpo.funil ?? ""), String(corpo.projeto ?? ""), String(corpo.nome ?? ""));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroJson(e);
  }
}
