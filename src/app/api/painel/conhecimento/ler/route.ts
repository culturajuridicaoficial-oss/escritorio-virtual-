import { NextResponse } from "next/server";
import { erroJson, exigirEquipe } from "@/lib/equipe";
import { supabaseAdmin } from "@/lib/supabase";
import { comTarefa } from "@/lib/tarefas";
import { registrarEvento } from "@/lib/eventos";
import { limparCampos } from "@/lib/conhecimentoCampos";
import { lerProdutoDaPagina } from "@/lib/agentes/conhecimento";

export const maxDuration = 300;

// Lê a página de vendas e devolve os campos sugeridos: { projeto, id, url } -> { sugestoes }.
// Não salva nada; o painel coloca as sugestões nos campos vazios para a equipe revisar.
export async function POST(req: Request) {
  const auth = await exigirEquipe(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const corpo = await req.json();
    let url: URL;
    try {
      url = new URL(String(corpo.url ?? "").trim());
      if (!/^https?:$/.test(url.protocol)) throw new Error();
    } catch {
      return NextResponse.json({ erro: "Cole o endereço completo da página (começando com https://)." }, { status: 400 });
    }
    const db = supabaseAdmin();
    const { data: projeto } = await db.from("projetos").select("id, slug, nome").eq("slug", String(corpo.projeto ?? "")).eq("ativo", true).maybeSingle();
    if (!projeto) return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });
    const { data: aba } = await db.from("conhecimento").select("nome").eq("id", String(corpo.id ?? "")).eq("projeto_id", projeto.id).maybeSingle();
    if (!aba) return NextResponse.json({ erro: "Aba não encontrada." }, { status: 404 });

    await registrarEvento({ projetoId: projeto.id, slug: projeto.slug, funcao: "ofertas", tipo: "briefing", mensagem: `Lendo a página do ${aba.nome} 📄` });
    const lido = await comTarefa(
      { projetoId: projeto.id, slug: projeto.slug, funcao: "ofertas", titulo: `Lendo a página de vendas do ${aba.nome} para a base de conhecimento` },
      () => lerProdutoDaPagina(aba.nome, url.toString()),
    );
    return NextResponse.json({ sugestoes: limparCampos(lido) });
  } catch (e) {
    return erroJson(e);
  }
}
