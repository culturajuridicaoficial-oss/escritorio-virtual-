import { NextResponse } from "next/server";
import { rodadaComercial } from "@/lib/atendimento";

export const maxDuration = 300;

// A cada 15 min (agendador do Supabase, pg_cron): follow-ups e primeiro contato.
// A Vercel no plano gratuito só roda cron uma vez por dia, por isso o Supabase chama esta rota.
export async function POST(req: Request) {
  const segredo = process.env.COMERCIAL_CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  return NextResponse.json(await rodadaComercial());
}
