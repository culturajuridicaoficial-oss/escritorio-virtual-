import { supabaseAdmin } from "./supabase";

export type Projeto = {
  id: string;
  slug: string;
  nome: string;
  kiwify_produto_ids: string[];
  meta_ad_account_id: string | null;
  limite_gasto_diario: number;
};

export async function projetosAtivos(): Promise<Projeto[]> {
  const { data, error } = await supabaseAdmin()
    .from("projetos")
    .select("id, slug, nome, kiwify_produto_ids, meta_ad_account_id, limite_gasto_diario")
    .eq("ativo", true);
  if (error) throw error;
  return data ?? [];
}

export async function projetoDoProdutoKiwify(produtoId: string | null): Promise<Projeto | null> {
  if (!produtoId) return null;
  const projetos = await projetosAtivos();
  return projetos.find((p) => p.kiwify_produto_ids.includes(produtoId)) ?? null;
}
