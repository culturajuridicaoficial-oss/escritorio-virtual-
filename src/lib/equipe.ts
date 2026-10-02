import { NextResponse } from "next/server";
import { supabaseAdmin } from "./supabase";
import { explicarErro } from "./agentes/claude";

/**
 * Confere o login do painel: o token do Supabase Auth vem no header Authorization
 * e o e-mail precisa estar na tabela `equipe`. Devolve o e-mail ou uma resposta de erro.
 */
export async function exigirEquipe(req: Request): Promise<{ email: string; admin?: boolean } | { resposta: NextResponse }> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { resposta: NextResponse.json({ erro: "Faça login." }, { status: 401 }) };

  let db: ReturnType<typeof supabaseAdmin>;
  try {
    db = supabaseAdmin();
  } catch (e) {
    // Normalmente: variável de ambiente faltando na Vercel. Mostra o nome dela no painel.
    return { resposta: NextResponse.json({ erro: `Configuração do servidor: ${(e as Error).message}` }, { status: 500 }) };
  }
  const { data, error } = await db.auth.getUser(token);
  const email = data.user?.email?.toLowerCase();
  if (error || !email) return { resposta: NextResponse.json({ erro: "Sessão inválida. Faça login de novo." }, { status: 401 }) };

  const { data: membro } = await db.from("equipe").select("email, admin").eq("email", email).maybeSingle();
  if (!membro) return { resposta: NextResponse.json({ erro: `O e-mail ${email} não está na equipe.` }, { status: 403 }) };
  return { email, admin: !!membro.admin };
}

/** Igual ao exigirEquipe, mas só para administradores (ex.: criar projeto). */
export async function exigirAdmin(req: Request): Promise<{ email: string } | { resposta: NextResponse }> {
  const auth = await exigirEquipe(req);
  if ("resposta" in auth) return auth;
  if (!("admin" in auth) || !auth.admin) {
    return { resposta: NextResponse.json({ erro: "Só administradores podem fazer isso." }, { status: 403 }) };
  }
  return { email: auth.email };
}

export function erroJson(e: unknown, status = 500) {
  return NextResponse.json({ erro: explicarErro(e) || "Erro inesperado." }, { status });
}
