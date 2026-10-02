import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { registrarConsumo } from "./claude";
import { z } from "zod";

// Ponto 10: o analista lê as métricas e escreve o relatório que alimenta o time de copy (ponto 11).

const Relatorio = z.object({
  resumo: z.string().describe("3 a 5 frases para o dono do projeto ler no WhatsApp"),
  vencedores: z.array(z.object({ ad_id: z.string(), ad_name: z.string(), por_que: z.string() })),
  perdedores: z.array(z.object({ ad_id: z.string(), ad_name: z.string(), por_que: z.string() })),
  padroes: z.array(z.string()).describe("O que os anúncios vencedores têm em comum (ângulo, gancho, formato, oferta)"),
  briefings: z.array(
    z.object({
      para: z.enum(["ofertas", "copy-pagina", "copy-estatico", "copy-video"]),
      pedido: z.string().describe("Pedido concreto e acionável para esse agente"),
    }),
  ),
  alertas: z.array(z.string()).describe("Problemas que pedem atenção humana: gasto sem venda, CPA subindo, conta em risco"),
});
export type Relatorio = z.infer<typeof Relatorio>;

const SISTEMA = `Você é o analista de performance de um squad de marketing de infoprodutos no Brasil.
Recebe as métricas dos anúncios do Meta Ads e as vendas registradas na Kiwify de um projeto.

Seu trabalho:
- Apontar quais anúncios estão ganhando e perdendo, com base em CPA, ROAS, CTR e volume de gasto. Não tire conclusão de anúncio com gasto pequeno demais para ser significativo; diga isso.
- Encontrar padrões nos vencedores que o time de copy consiga replicar.
- Escrever briefings concretos para os agentes de oferta e de copy. Um bom briefing diz o que testar e por quê, citando o anúncio de referência.
- Levantar alertas que precisam de um humano.

Regras: escreva em português do Brasil. Use apenas os números recebidos; não invente dados. Os briefings não podem pedir promessas de resultado garantido, depoimentos inventados ou escassez falsa, porque isso reprova anúncios no Meta.`;

export type EntradaAnalista = {
  projeto: string;
  periodo: { inicio: string; fim: string };
  anuncios: Array<{
    ad_id: string;
    ad_name: string | null;
    campanha: string | null;
    gasto: number;
    impressoes: number;
    cliques: number;
    compras: number;
    receita: number;
  }>;
  vendasKiwify: { quantidade: number; faturamento: number; reembolsos: number; carrinhosAbandonados: number };
};

export async function gerarRelatorio(entrada: EntradaAnalista): Promise<Relatorio> {
  const client = new Anthropic();
  const resposta = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    // Se um classificador de segurança recusar, a API refaz no modelo de reserva recomendado.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(Relatorio) },
    system: [{ type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: JSON.stringify(entrada) }],
  });
  await registrarConsumo(resposta);

  if (resposta.stop_reason === "refusal") throw new Error("O modelo recusou gerar o relatório.");
  if (!resposta.parsed_output) throw new Error(`Relatório sem formato válido (stop_reason: ${resposta.stop_reason}).`);
  return resposta.parsed_output;
}
