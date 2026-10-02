import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let admin: SupabaseClient | null = null;

/** Cliente com service role — somente em rotas de servidor. */
export function supabaseAdmin(): SupabaseClient {
  admin ??= createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  return admin;
}

let navegador: SupabaseClient | null = null;

/**
 * Cliente público do navegador: o escritório lê agentes e eventos, e o painel usa
 * o login. Um só cliente por página, para a sessão de login ficar guardada.
 * Null em modo demonstração (sem Supabase configurado).
 */
export function supabaseNavegador(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) return null;
  navegador ??= createClient(url, chave);
  return navegador;
}
