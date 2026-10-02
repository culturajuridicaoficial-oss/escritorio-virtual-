import { NextResponse, after } from "next/server";
import { erroJson, exigirEquipe } from "@/lib/equipe";
import { supabaseAdmin } from "@/lib/supabase";
import { coletarLotes } from "@/lib/lotes";

// Tudo que o painel do projeto mostra: funis (briefings), pedidos e as últimas rodadas com os criativos.
export async function GET(req: Request) {
  const auth = await exigirEquipe(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const db = supabaseAdmin();
    const slug = new URL(req.url).searchParams.get("projeto");
    const { data: projeto, error } = await db
      .from("projetos")
      .select("id, slug, nome, sigla")
      .eq("slug", slug ?? "")
      .eq("ativo", true)
      .maybeSingle();
    if (error) throw error;
    if (!projeto) return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404 });

    // Quem abre o painel traz os lotes da rodada diária que já terminaram (no máximo 1x por minuto).
    after(() => coletarLotes({ semPressa: true }).catch(() => {}));

    // Análise que passou do tempo máximo de execução sem terminar vira erro (dá para pedir de novo).
    await db
      .from("analises")
      .update({ status: "erro", erro: "A análise passou do tempo limite. Peça de novo (com menos peças ou arquivos)." })
      .eq("projeto_id", projeto.id)
      .eq("status", "analisando")
      .lt("created_at", new Date(Date.now() - 8 * 60000).toISOString());

    const [{ data: ofertas, error: e2 }, { data: pedidos, error: e3 }, { data: funis, error: e4 }, { data: analises, error: e5 }] = await Promise.all([
      db
        .from("ofertas")
        .select(
          "id, codigo, funil_id, titulo, promessa, preco, bonus, garantia, racional, checkout_url, status, motivo_reprovacao, feedback, pedido_id, created_at, " +
            "criativos(id, codigo, funil_id, tipo, copy, html, formato, status, erro, motivo_reprovacao, feedback, refaz_de, lote_id, created_at)",
        )
        .eq("projeto_id", projeto.id)
        .order("created_at", { ascending: false })
        .limit(40),
      db
        .from("pedidos")
        .select("id, funil_id, autor, texto, entregas, referencias, links, status, erro, created_at")
        .eq("projeto_id", projeto.id)
        .order("created_at", { ascending: false })
        .limit(30),
      db
        .from("funis")
        .select("id, codigo, nome, sigla_produto, pagina_vendas_url, briefing, questionario, briefing_atualizado_em, created_at")
        .eq("projeto_id", projeto.id)
        .order("created_at", { ascending: false }),
      db
        .from("analises")
        .select("id, codigo, agente, funil_id, autor, alvo, contexto, arquivos, instrucoes, status, relatorio, nota_geral, anterior_id, erro, created_at")
        .eq("projeto_id", projeto.id)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    if (e2) throw e2;
    if (e3) throw e3;
    if (e4) throw e4;
    if (e5) throw e5;

    return NextResponse.json({ projeto, funis, ofertas, pedidos, analises });
  } catch (e) {
    return erroJson(e);
  }
}
