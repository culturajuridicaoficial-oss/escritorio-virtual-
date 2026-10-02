import { supabaseAdmin } from "./supabase";
import { registrarEvento } from "./eventos";

// Criação de projeto pelo administrador: o banco monta o squad inteiro (função criar_projeto)
// e o escritório virtual, a recepção e o painel passam a mostrar o projeto na hora.

/** "Clínica Bem-Estar" -> "clinica-bem-estar" */
export function slugDe(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function listarProjetos() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("projetos")
    .select("id, slug, nome, sigla, meta_diaria, ativo, oculto, created_at, agentes(count), funis(count)")
    .order("created_at");
  if (error) throw error;
  return data;
}

export async function criarProjeto(entrada: { nome: string; sigla: string; meta?: number | null; autor: string }) {
  const nome = entrada.nome.trim().slice(0, 60);
  const sigla = entrada.sigla.trim().toUpperCase();
  if (nome.length < 2) throw new Error("Dê um nome ao projeto.");
  if (!/^[A-Z0-9]{2,5}$/.test(sigla)) throw new Error("A sigla precisa ter de 2 a 5 letras ou números.");
  const base = slugDe(nome);
  if (!base) throw new Error("O nome precisa ter letras ou números.");

  const db = supabaseAdmin();
  const { data: existentes } = await db.from("projetos").select("slug, sigla");
  if (existentes?.some((p) => p.sigla === sigla)) throw new Error(`A sigla ${sigla} já é de outro projeto.`);
  // Endereço do escritório único: /escritorio/<slug>
  let slug = base;
  for (let n = 2; existentes?.some((p) => p.slug === slug); n++) slug = `${base}-${n}`;

  const meta = entrada.meta && entrada.meta > 0 ? Math.round(entrada.meta * 100) / 100 : null;
  const { data, error } = await db.rpc("criar_projeto", { p_nome: nome, p_slug: slug, p_sigla: sigla, p_meta: meta });
  if (error) throw error;
  const projeto = data as { id: string; slug: string; nome: string; sigla: string };
  await registrarEvento({ projetoId: projeto.id, slug: projeto.slug, funcao: "ofertas", tipo: "briefing", mensagem: `Squad do ${projeto.nome} chegou! 👋` });
  return projeto;
}

/** Oculta (ou mostra de novo) o escritório na recepção e nas páginas públicas. */
export async function ocultarProjeto(id: string, oculto: boolean) {
  const { data, error } = await supabaseAdmin().from("projetos").update({ oculto }).eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Projeto não encontrado.");
}
