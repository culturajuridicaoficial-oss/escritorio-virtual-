import { env } from "./env";

// Evolution API (WhatsApp): uma instância por projeto. Envia texto e lê o webhook
// "messages.upsert". O payload bruto fica salvo em mensagens_whatsapp.payload para conferir.

/** Envia uma mensagem de texto. `digitando` mostra "digitando…" antes (ms). Devolve o id da mensagem. */
export async function enviarTextoEvolution(instancia: string, numero: string, texto: string, digitando = 1500) {
  const base = env("EVOLUTION_URL").replace(/\/$/, "");
  const resposta = await fetch(`${base}/message/sendText/${encodeURIComponent(instancia)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: env("EVOLUTION_API_KEY") },
    body: JSON.stringify({ number: numero, text: texto, delay: digitando }),
  });
  if (!resposta.ok) throw new Error(`Evolution ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`);
  const corpo = (await resposta.json().catch(() => ({}))) as { key?: { id?: string } };
  return corpo.key?.id ?? null;
}

export type MensagemEvolution = {
  instancia: string;
  telefone: string;
  nome: string | null;
  texto: string | null;
  id: string | null;
  deMim: boolean; // enviada pelo número do projeto (pela API ou por uma pessoa no celular)
};

type Dic = Record<string, unknown>;
const obj = (v: unknown): Dic => (v && typeof v === "object" ? (v as Dic) : {});
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Só dígitos do JID: "5511987654321@s.whatsapp.net" -> "5511987654321". */
const numeroDoJid = (jid: string | null) => (jid && /@s\.whatsapp\.net$/.test(jid) ? jid.split("@")[0].replace(/\D/g, "") : null);

/** Lê o webhook "messages.upsert". Ignora grupos, status e eventos sem texto nem mídia. */
export function lerWebhookEvolution(p: Dic): MensagemEvolution | null {
  const evento = String(p.event ?? "").toLowerCase().replace(/_/g, ".");
  if (evento !== "messages.upsert") return null;
  const data = obj(Array.isArray(p.data) ? p.data[0] : p.data);
  const key = obj(data.key);
  const jid = str(key.remoteJid);
  if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") return null;
  // Contas novas do WhatsApp usam @lid no remoteJid; o telefone vem em remoteJidAlt/senderPn.
  const telefone = numeroDoJid(jid) ?? numeroDoJid(str(key.remoteJidAlt)) ?? numeroDoJid(str(key.senderPn)) ?? numeroDoJid(str(data.sender));
  if (!telefone) return null;

  const m = obj(data.message);
  const texto =
    str(m.conversation) ??
    str(obj(m.extendedTextMessage).text) ??
    str(obj(m.imageMessage).caption) ??
    str(obj(m.videoMessage).caption) ??
    str(obj(m.documentMessage).caption) ??
    (m.audioMessage ? "(áudio)" : m.imageMessage ? "(imagem)" : m.documentMessage ? "(documento)" : m.stickerMessage ? "(figurinha)" : null);
  if (!texto) return null;

  return {
    instancia: String(p.instance ?? ""),
    telefone,
    nome: str(data.pushName),
    texto,
    id: str(key.id),
    deMim: key.fromMe === true,
  };
}
