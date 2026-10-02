import { NextResponse } from "next/server";
import { erroJson, exigirAdmin } from "@/lib/equipe";
import { supabaseAdmin } from "@/lib/supabase";

// Consumo da API da Anthropic (US$) por escritório: hoje, 7 dias, mês e total, e o mês por agente.
export async function GET(req: Request) {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const db = supabaseAdmin();
    const [projetos, porAgente, agentes] = await Promise.all([
      db.from("consumo_por_projeto").select("projeto_id, hoje, sete_dias, mes, total, chamadas"),
      db.from("consumo_por_agente_mes").select("projeto_id, agente_id, custo, chamadas"),
      db.from("agentes").select("id, nome, funcoes(nome)"),
    ]);
    for (const r of [projetos, porAgente, agentes]) if (r.error) throw r.error;
    const nomes = new Map(
      (agentes.data ?? []).map((a) => [a.id, `${a.nome} · ${(a.funcoes as unknown as { nome: string } | null)?.nome ?? ""}`]),
    );
    return NextResponse.json({
      projetos: projetos.data,
      agentes: (porAgente.data ?? []).map((a) => ({ ...a, nome: a.agente_id ? nomes.get(a.agente_id) ?? a.agente_id : "Sem agente" })),
    });
  } catch (e) {
    return erroJson(e);
  }
}
