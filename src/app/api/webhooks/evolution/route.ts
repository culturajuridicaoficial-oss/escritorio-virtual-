import { NextResponse, after } from "next/server";
import { env } from "@/lib/env";
import { lerWebhookEvolution } from "@/lib/evolution";
import { receberMensagem, responderDepois } from "@/lib/atendimento";

export const maxDuration = 60;

// Evolution API -> mensagens do WhatsApp. Em cada instância (uma por projeto), configure o
// webhook https://<dominio>/api/webhooks/evolution?secret=<EVOLUTION_WEBHOOK_SECRET>
// com o evento MESSAGES_UPSERT. O nome da instância diz de qual projeto é a mensagem.
export async function POST(req: Request) {
  if (new URL(req.url).searchParams.get("secret") !== env("EVOLUTION_WEBHOOK_SECRET")) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const payload = await req.json().catch(() => null);
  const mensagem = payload ? lerWebhookEvolution(payload) : null;
  if (!mensagem) return NextResponse.json({ ok: true, ignorado: true });

  // Responde rápido à Evolution e trabalha depois. Mensagem do nosso número espera 5 s:
  // as que a própria IA enviou já estarão gravadas e não são confundidas com uma pessoa.
  after(async () => {
    try {
      if (mensagem.deMim) await new Promise((r) => setTimeout(r, 5000));
      const r = await receberMensagem(mensagem, payload);
      if (r?.responder) await responderDepois(r.leadId);
    } catch (e) {
      console.error("Evolution:", e);
    }
  });
  return NextResponse.json({ ok: true });
}
