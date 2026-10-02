import { NextResponse } from "next/server";
import { erroJson, exigirEquipe } from "@/lib/equipe";
import { supabaseAdmin } from "@/lib/supabase";

/** A conversa de WhatsApp de um lead, da mais antiga para a mais nova. */
export async function GET(req: Request) {
  const auth = await exigirEquipe(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const id = new URL(req.url).searchParams.get("id") ?? "";
    const { data, error } = await supabaseAdmin()
      .from("mensagens_whatsapp")
      .select("id, direcao, texto, agente_id, created_at")
      .eq("lead_id", id)
      .order("created_at", { ascending: true })
      .limit(300);
    if (error) throw error;
    return NextResponse.json({ mensagens: data });
  } catch (e) {
    return erroJson(e);
  }
}
