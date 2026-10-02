import { env } from "./env";

/** Envia uma mensagem de texto pelo WhatsApp via Z-API. */
export async function enviarTextoZapi(telefone: string, mensagem: string) {
  const url = `https://api.z-api.io/instances/${env("ZAPI_INSTANCE_ID")}/token/${env("ZAPI_TOKEN")}/send-text`;
  const resposta = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Client-Token": env("ZAPI_CLIENT_TOKEN") },
    body: JSON.stringify({ phone: telefone, message: mensagem }),
  });
  if (!resposta.ok) throw new Error(`Z-API ${resposta.status}: ${await resposta.text()}`);
  return resposta.json() as Promise<{ zaapId?: string; messageId?: string }>;
}

export type MensagemRecebida = {
  telefone: string;
  nome: string | null;
  texto: string | null;
  messageId: string | null;
};

/** Lê o callback "ao receber" da Z-API. Ignora grupos e mensagens enviadas por nós. */
export function lerMensagemZapi(p: Record<string, unknown>): MensagemRecebida | null {
  if (p.fromMe === true || p.isGroup === true || !p.phone) return null;
  const texto = (p.text as { message?: string } | undefined)?.message ?? null;
  return {
    telefone: String(p.phone),
    nome: typeof p.senderName === "string" ? p.senderName : null,
    texto,
    messageId: typeof p.messageId === "string" ? p.messageId : null,
  };
}
