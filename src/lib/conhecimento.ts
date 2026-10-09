import { supabaseAdmin } from "./supabase";
import { CAMPOS_DO_CONHECIMENTO, limparCampos } from "./conhecimentoCampos";

// Leitura da base de conhecimento pelos agentes (servidor).
// Os agentes consultam a base a cada chamada; um minuto de memória evita ir ao banco toda hora.
const memoria = new Map<string, { ate: number; texto: string | null }>();

/**
 * Texto da base de conhecimento do projeto para os agentes (só abas marcadas para a IA e
 * campos preenchidos). Null quando não há nada escrito. Falha ao ler nunca derruba o agente.
 */
export async function conhecimentoParaIA(projetoId: string): Promise<string | null> {
  const guardado = memoria.get(projetoId);
  if (guardado && guardado.ate > Date.now()) return guardado.texto;
  let texto: string | null = null;
  try {
    const { data } = await supabaseAdmin()
      .from("conhecimento")
      .select("nome, campos")
      .eq("projeto_id", projetoId)
      .eq("usar_na_ia", true)
      .order("ordem");
    const produtos = (data ?? [])
      .map((p) => {
        const campos = limparCampos(p.campos);
        const linhas = CAMPOS_DO_CONHECIMENTO.filter((c) => campos[c.id]).map((c) => `### ${c.rotulo}\n${campos[c.id]}`);
        return linhas.length ? `## ${p.nome}\n\n${linhas.join("\n\n")}` : null;
      })
      .filter(Boolean);
    if (produtos.length) {
      texto =
        "# Base de conhecimento dos produtos\n" +
        "Escrita pela equipe. É fonte oficial, como o briefing: use para responder, argumentar e escrever. " +
        "Se a base e o briefing divergirem, vale a base. Não invente nada que não esteja aqui ou no briefing.\n\n" +
        produtos.join("\n\n");
    }
  } catch {
    texto = null;
  }
  memoria.set(projetoId, { ate: Date.now() + 60_000, texto });
  return texto;
}

/** Depois de salvar uma aba, os agentes passam a ver o texto novo na próxima chamada. */
export function esquecerConhecimento(projetoId: string) {
  memoria.delete(projetoId);
}
