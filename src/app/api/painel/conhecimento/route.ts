import { NextResponse } from "next/server";
import { erroJson, exigirEquipe } from "@/lib/equipe";
import { supabaseAdmin } from "@/lib/supabase";
import { limparCampos } from "@/lib/conhecimentoCampos";
import { esquecerConhecimento } from "@/lib/conhecimento";

// Base de conhecimento do projeto: uma aba por produto, com o que a IA precisa saber.

const COLUNAS = "id, slug, nome, ordem, usar_na_ia, campos, atualizado_por, updated_at";

async function projetoPeloSlug(slug: string) {
  const { data, error } = await supabaseAdmin().from("projetos").select("id, slug, nome").eq("slug", slug).eq("ativo", true).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Projeto não encontrado."), { status: 404 });
  return data;
}

function slugDe(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const status = (e: unknown) => ((e as { status?: number }).status ?? 500);

// ?projeto=<slug> -> { projeto, abas }
export async function GET(req: Request) {
  const auth = await exigirEquipe(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const projeto = await projetoPeloSlug(new URL(req.url).searchParams.get("projeto") ?? "");
    const { data, error } = await supabaseAdmin().from("conhecimento").select(COLUNAS).eq("projeto_id", projeto.id).order("ordem").order("created_at");
    if (error) throw error;
    return NextResponse.json({ projeto, abas: data });
  } catch (e) {
    return erroJson(e, status(e));
  }
}

// Nova aba: { projeto, nome } -> a aba criada
export async function POST(req: Request) {
  const auth = await exigirEquipe(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const corpo = await req.json();
    const nome = String(corpo.nome ?? "").trim().slice(0, 80);
    const slug = slugDe(nome);
    if (!slug) return NextResponse.json({ erro: "Dê um nome para a aba." }, { status: 400 });
    const projeto = await projetoPeloSlug(String(corpo.projeto ?? ""));
    const db = supabaseAdmin();
    const { data: ultima } = await db.from("conhecimento").select("ordem").eq("projeto_id", projeto.id).order("ordem", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await db
      .from("conhecimento")
      .insert({ projeto_id: projeto.id, slug, nome, ordem: (ultima?.ordem ?? 0) + 1, atualizado_por: auth.email })
      .select(COLUNAS)
      .single();
    if (error?.code === "23505") return NextResponse.json({ erro: `Já existe uma aba "${nome}".` }, { status: 409 });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    return erroJson(e, status(e));
  }
}

// Salvar: { projeto, id, nome?, campos?, usar_na_ia? } -> a aba salva
export async function PATCH(req: Request) {
  const auth = await exigirEquipe(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const corpo = await req.json();
    const projeto = await projetoPeloSlug(String(corpo.projeto ?? ""));
    const mudancas: Record<string, unknown> = { atualizado_por: auth.email, updated_at: new Date().toISOString() };
    if (typeof corpo.nome === "string" && corpo.nome.trim()) mudancas.nome = corpo.nome.trim().slice(0, 80);
    if (corpo.campos !== undefined) mudancas.campos = limparCampos(corpo.campos);
    if (typeof corpo.usar_na_ia === "boolean") mudancas.usar_na_ia = corpo.usar_na_ia;
    const { data, error } = await supabaseAdmin()
      .from("conhecimento")
      .update(mudancas)
      .eq("id", String(corpo.id ?? ""))
      .eq("projeto_id", projeto.id)
      .select(COLUNAS)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ erro: "Aba não encontrada." }, { status: 404 });
    esquecerConhecimento(projeto.id);
    return NextResponse.json(data);
  } catch (e) {
    return erroJson(e, status(e));
  }
}

// Apagar uma aba: { projeto, id }
export async function DELETE(req: Request) {
  const auth = await exigirEquipe(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const corpo = await req.json();
    const projeto = await projetoPeloSlug(String(corpo.projeto ?? ""));
    const { error } = await supabaseAdmin().from("conhecimento").delete().eq("id", String(corpo.id ?? "")).eq("projeto_id", projeto.id);
    if (error) throw error;
    esquecerConhecimento(projeto.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroJson(e, status(e));
  }
}
