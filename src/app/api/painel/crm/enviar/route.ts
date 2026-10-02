import { NextResponse } from "next/server";
import { z } from "zod";
import { erroJson, exigirEquipe } from "@/lib/equipe";
import { enviarComoEquipe } from "@/lib/atendimento";

/** A equipe responde o lead pelo CRM (pelo número do projeto). A IA fica pausada nesse lead. */
export async function POST(req: Request) {
  const auth = await exigirEquipe(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const { id, texto } = z.object({ id: z.string().uuid(), texto: z.string().trim().min(1).max(2000) }).parse(await req.json());
    await enviarComoEquipe(id, texto, auth.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroJson(e);
  }
}
