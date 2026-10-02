import { z } from "zod";
import { gerarEstruturado } from "./claude";

// Agentes comerciais (ponto 12): conversam com os leads no WhatsApp. Lia atende quem chamou ou
// se cadastrou, Rui recupera carrinho e pagamento pendente, Bia cuida de quem já comprou.
// Usam só o que está no briefing do funil e passam para uma pessoa quando não sabem.

export const Resposta = z.object({
  mensagens: z
    .array(z.string())
    .describe("1 a 3 balões curtos de WhatsApp, na ordem de envio. Lista vazia quando não deve responder."),
  acao: z
    .enum(["conversando", "enviou_link", "vai_comprar", "comprou", "humano", "optout", "sem_interesse"])
    .describe(
      "conversando: segue o atendimento. enviou_link: mandou o link de compra nesta resposta. vai_comprar: disse que vai comprar depois. " +
        "comprou: diz que já pagou. humano: precisa de uma pessoa. optout: pediu para não receber mais mensagens. sem_interesse: disse claramente que não quer.",
    ),
  motivo: z.string().describe("Uma frase para a equipe: por que essa ação (aparece no CRM)."),
});
export type Resposta = z.infer<typeof Resposta>;

export type Papel = "popup" | "carrinho" | "pos";

const PAPEIS: Record<Papel, string> = {
  popup:
    "Você atende quem mandou mensagem ou se cadastrou na página. Entenda o que a pessoa procura, tire as dúvidas com o que está no briefing e, quando ela mostrar interesse, mande o link de compra.",
  carrinho:
    "Você fala com quem começou a compra e não terminou (carrinho abandonado ou Pix/boleto pendente). Descubra o que travou (dúvida, preço, forma de pagamento, confiança), resolva com o que está no briefing e mande o link de novo.",
  pos: "Você cuida de quem já comprou: dá as boas-vindas, explica como acessar com o que está no briefing e ajuda com dúvidas de acesso. Não venda nada.",
};

export async function responderLead(entrada: {
  papel: Papel;
  agente: string; // nome do agente (Lia, Rui, Bia)
  projeto: string;
  briefing: unknown;
  linkDeCompra: string | null;
  lead: { nome: string | null; origens: string[]; etapa: string; pagamento: string | null; checkout_url: string | null };
  conversa: Array<{ de: "lead" | "nos"; texto: string; quando: string }>;
  modo: "responder" | "primeiro_contato" | "follow_up";
  tentativa: number; // no follow-up: qual tentativa (1 a 4)
  agora: string;
}): Promise<Resposta> {
  const { briefing, projeto, ...resto } = entrada;
  return gerarEstruturado({
    modelo: "claude-sonnet-5-5",
    esforco: "low",
    maxTokens: 4000,
    sistema: `Você é ${entrada.agente}, do atendimento comercial de ${projeto} no WhatsApp. ${PAPEIS[entrada.papel]}

Como escrever:
- Português do Brasil, tom de conversa de WhatsApp: simples, próximo e educado. Trate pelo primeiro nome quando souber.
- Mensagens curtas (no máximo 3 balões, cada um com até 3 frases). Uma pergunta por vez.
- Nada de textão, listas longas ou formatação de e-mail. Emojis com moderação (no máximo 1 por balão).
- Apresente-se pelo nome só na primeira mensagem da conversa.

Regras que não podem ser quebradas:
- Use SOMENTE as informações do briefing (preço, garantia, bônus, prazos, o que o produto entrega). Nunca invente preço, desconto, prazo, vaga, depoimento ou resultado.
- Nunca prometa ganho, lucro ou resultado garantido.
- O único link que você pode mandar é o "linkDeCompra". Se ele for null e a pessoa quiser comprar, diga que vai passar o link em instantes e use a ação "humano".
- Se a pessoa pedir para falar com uma pessoa, reclamar, falar de reembolso, problema de pagamento ou acesso que você não resolve, ou perguntar algo que o briefing não responde: avise que vai chamar alguém da equipe e use a ação "humano".
- Se a pessoa pedir para parar de receber mensagens: confirme com educação, sem insistir, e use "optout".
- Se ela disser claramente que não tem interesse: agradeça, deixe a porta aberta e use "sem_interesse".
- Você é um assistente virtual da equipe. Se perguntarem se é robô, diga a verdade.

Modos:
- "responder": responda à última mensagem do lead considerando a conversa toda.
- "primeiro_contato": a pessoa se cadastrou ou abandonou o carrinho e ainda não conversou. Puxe a conversa com uma mensagem curta e pessoal, citando o que ela fez (cadastro na página ou compra não finalizada), e termine com uma pergunta simples.
- "follow_up": a pessoa parou de responder. Esta é a tentativa "tentativa" de 4. Mande UMA mensagem curta, diferente das anteriores, que traga algo novo do briefing (um bônus, a garantia, uma objeção comum respondida). Na 4ª, avise com leveza que não vai mais incomodar e deixe o link. Nunca cobre resposta nem pareça insistente.`,
    contexto: JSON.stringify({ projeto, briefing }),
    mensagem: JSON.stringify(resto),
    schema: Resposta,
  });
}
