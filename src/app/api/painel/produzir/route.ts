import { NextResponse } from "next/server";
import { erroJson, exigirEquipe } from "@/lib/equipe";
import { produzirCriativo } from "@/lib/fabrica";

export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = await exigirEquipe(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const { id } = await req.json();
    return NextResponse.json(await produzirCriativo(id));
  } catch (e) {
    return erroJson(e);
  }
}
