import { NextResponse } from "next/server";
import { erroJson, exigirEquipe } from "@/lib/equipe";
import { refazer } from "@/lib/fabrica";

export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = await exigirEquipe(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const { tipo, id, motivo } = await req.json();
    if (!["oferta", "criativo"].includes(tipo) || !id) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
    return NextResponse.json(await refazer({ tipo, id, motivo: String(motivo ?? ""), revisor: auth.email }));
  } catch (e) {
    return erroJson(e);
  }
}
