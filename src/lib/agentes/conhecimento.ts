import { z } from "zod";
import { gerarEstruturado } from "./claude";
import { CAMPOS_DO_CONHECIMENTO, type CampoId } from "../conhecimentoCampos";

// Lê a página de vendas de um produto e preenche os campos da base de conhecimento.
// A equipe revisa antes de salvar: nada vai para a IA sem passar pelo botão Salvar.

const ProdutoDaPagina = z.object(
  Object.fromEntries(
    CAMPOS_DO_CONHECIMENTO.map((c) => [c.id, z.string().describe(`${c.rotulo}. ${c.dica} Texto vazio se a página não disser.`)]),
  ) as Record<CampoId, z.ZodString>,
);

export async function lerProdutoDaPagina(nomeProduto: string, url: string): Promise<Record<CampoId, string>> {
  const dominio = new URL(url).hostname;
  return gerarEstruturado({
    sistema: `Você monta a base de conhecimento de um produto educacional da Cultura Jurídica (cursos de Direito). Leia a página de vendas indicada com a ferramenta web_fetch e preencha cada campo com o que a página diz, para outros agentes de IA usarem ao vender e atender alunos.
Regras:
- Use somente o que está na página. Campo sem informação fica com texto vazio (""). Nunca invente preço, prazo, professor, número de alunos, depoimento ou garantia.
- Escreva em português do Brasil, em texto corrido ou tópicos curtos (uma linha por item), sem markdown pesado.
- Preço: valores, parcelamento e formas de pagamento exatamente como aparecem.
- Objeções e perguntas frequentes: traga as que a página responde, com a resposta dela.
- Links: inclua o endereço da página de vendas e os de checkout que aparecerem.
- Tom de voz: descreva como a página fala com o leitor e o que ela evita prometer.`,
    mensagem: `Produto: ${nomeProduto}\nPágina de vendas: ${url}`,
    schema: ProdutoDaPagina,
    esforco: "medium",
    lerPaginas: [dominio],
    // Só a página conta aqui: a base atual não entra para não misturar produtos.
    conhecimento: null,
  });
}
