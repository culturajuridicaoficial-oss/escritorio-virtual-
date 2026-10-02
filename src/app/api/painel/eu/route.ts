import { NextResponse } from "next/server";
import { exigirEquipe } from "@/lib/equipe";

export async function GET(req: Request) {
  const auth = await exigirEquipe(req);
  if ("resposta" in auth) return auth.resposta;
  return NextResponse.json({ email: auth.email, admin: !!auth.admin });
}
