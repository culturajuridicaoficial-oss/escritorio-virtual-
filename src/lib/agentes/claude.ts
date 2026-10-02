import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { supabaseAdmin } from "../supabase";
import { agenteAtual } from "../tarefas";

// Chamada padrão dos agentes: resposta estruturada (validada pelo schema), modelo de
// reserva automático se um classificador recusar e retomada de pausas de ferramentas
// do servidor (como a leitura de páginas).

const MODELO = "claude-opus-5-5";

// Preço em dólares por milhão de tokens (API da Anthropic). Escrita no cache = 1,25x a entrada.
const PRECOS: Record<string, { entrada: number; saida: number; cacheLeitura: number }> = {
  "claude-opus-5-5": { entrada: 4, saida: 20, cacheLeitura: 0.2 },
  "claude-opus-5": { entrada: 5, saida: 25, cacheLeitura: 0.5 },
  "claude-opus-4-8": { entrada: 5, saida: 25, cacheLeitura: 0.5 },
  "claude-sonnet-5-5": { entrada: 2, saida: 10, cacheLeitura: 0.2 },
  "claude-fable-5-1": { entrada: 10, saida: 50, cacheLeitura: 0.25 },
};

/**
 * Registra os tokens e o custo de uma resposta no escritório do agente que está trabalhando
 * (consumo por escritório no /admin). Falha ao registrar nunca derruba o trabalho.
 */
export async function registrarConsumo(resposta: { model: string; usage: Anthropic.Beta.BetaUsage }, fator = 1) {
  try {
    const u = resposta.usage;
    const preco = PRECOS[resposta.model] ?? PRECOS[MODELO];
    const entrada = u.input_tokens ?? 0;
    const saida = u.output_tokens ?? 0;
    const escrita = u.cache_creation_input_tokens ?? 0;
    const leitura = u.cache_read_input_tokens ?? 0;
    // fator 0,5 nas respostas que vieram de lote (Batch API cobra metade)
    const custo = (fator * (entrada * preco.entrada + escrita * preco.entrada * 1.25 + leitura * preco.cacheLeitura + saida * preco.saida)) / 1_000_000;
    const quem = agenteAtual.getStore();
    await supabaseAdmin().from("consumo_ia").insert({
      projeto_id: quem?.projetoId ?? null,
      agente_id: quem?.agenteId ?? null,
      tarefa: quem?.titulo ?? null,
      modelo: resposta.model,
      input_tokens: entrada,
      output_tokens: saida,
      cache_escrita_tokens: escrita,
      cache_leitura_tokens: leitura,
      leituras_web: u.server_tool_use?.web_fetch_requests ?? 0,
      custo_usd: Math.round(custo * 1_000_000) / 1_000_000,
    });
  } catch {
    // sem registro de consumo, segue o trabalho
  }
}

let cliente: Anthropic | null = null;
export const claude = () => (cliente ??= new Anthropic());

type Esforco = "low" | "medium" | "high" | "xhigh";

/** O pedido de um agente, igual para a chamada na hora e para o lote (Batch API). */
export type Chamada<S extends z.ZodType> = {
  sistema: string;
  /**
   * Parte da mensagem que se repete entre chamadas (briefing, oferta, referências): vai
   * primeiro e fica no cache, então as peças seguintes do mesmo funil pagam ~5% por ela.
   */
  contexto?: string;
  mensagem: string;
  schema: S;
  /** Padrão "medium". "high" só onde a qualidade da copy depende de raciocinar mais. */
  esforco?: Esforco;
  lerPaginas?: string[]; // domínios que o agente pode abrir com web_fetch
  anexos?: Anthropic.Beta.BetaContentBlockParam[]; // imagens e PDFs de referência
  maxTokens?: number;
  /** Padrão Opus 5.5. A conversa com leads usa o Sonnet 5.5 (metade do preço). */
  modelo?: "claude-opus-5-5" | "claude-sonnet-5-5";
};

const CACHE = { type: "ephemeral" } as const;

/**
 * Monta sistema, mensagem e ferramentas com os pontos de cache: o sistema (a persona do
 * agente) e o contexto compartilhado. O que muda a cada chamada fica depois deles.
 */
function montar(opcoes: Omit<Chamada<z.ZodType>, "schema">, sistema = opcoes.sistema) {
  const fixos: Anthropic.Beta.BetaContentBlockParam[] = [
    ...(opcoes.contexto ? [{ type: "text" as const, text: opcoes.contexto }] : []),
    ...(opcoes.anexos ?? []),
  ];
  if (opcoes.contexto && fixos.length) {
    const ultimo = fixos[fixos.length - 1];
    fixos[fixos.length - 1] = { ...ultimo, cache_control: CACHE } as Anthropic.Beta.BetaContentBlockParam;
  }
  const ferramentas: Anthropic.Beta.BetaToolUnion[] = opcoes.lerPaginas
    ? [{ type: "web_fetch_20260209", name: "web_fetch", max_uses: 5, allowed_domains: opcoes.lerPaginas }]
    : [];
  return {
    system: [{ type: "text" as const, text: sistema, cache_control: CACHE }],
    mensagens: [{ role: "user", content: [...fixos, { type: "text", text: opcoes.mensagem }] }] as Anthropic.Beta.BetaMessageParam[],
    // Com leitura de páginas a conversa volta várias vezes (pause_turn): o cache automático
    // guarda o que já foi lido para a volta seguinte não pagar de novo.
    extras: ferramentas.length ? { tools: ferramentas, cache_control: CACHE } : {},
  };
}

export async function gerarEstruturado<S extends z.ZodType>(opcoes: Chamada<S>): Promise<z.infer<S>> {
  const { system, mensagens, extras } = montar(opcoes);

  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const resposta = await claude().beta.messages.parse({
      model: opcoes.modelo ?? MODELO,
      max_tokens: opcoes.maxTokens ?? 16000, // acima de ~21 mil sem streaming o SDK recusa a chamada
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: opcoes.esforco ?? "medium", format: betaZodOutputFormat(opcoes.schema) },
      system,
      messages: mensagens,
      ...extras,
    });
    await registrarConsumo(resposta);

    if (resposta.stop_reason === "pause_turn") {
      // A ferramenta do servidor ainda está trabalhando: reenvia o turno para ela continuar.
      mensagens.push({ role: "assistant", content: resposta.content });
      continue;
    }
    if (resposta.stop_reason === "refusal") throw new Error("O modelo recusou a tarefa.");
    if (resposta.stop_reason === "max_tokens") throw new Error("A resposta passou do limite de tamanho.");
    if (!resposta.parsed_output) throw new Error(`Resposta sem o formato esperado (${resposta.stop_reason}).`);
    return resposta.parsed_output;
  }
  throw new Error("A leitura de páginas não terminou a tempo.");
}

/**
 * A mesma chamada no formato de um pedido do lote (Batch API, metade do preço, resposta em
 * até 24 h). Sem leitura de páginas (ela pede várias voltas) e sem modelo de reserva, que o
 * lote não aceita: uma recusa volta como erro e a peça pode ser refeita pelo painel.
 */
export function paramsDoLote(opcoes: Chamada<z.ZodType>): Anthropic.Beta.Messages.BatchCreateParams.Request["params"] {
  if (opcoes.lerPaginas) throw new Error("Chamadas com leitura de páginas não vão para o lote.");
  const { system, mensagens } = montar(opcoes);
  const { parse: _parse, ...formato } = betaZodOutputFormat(opcoes.schema);
  return {
    model: MODELO,
    max_tokens: opcoes.maxTokens ?? 16000,
    output_config: { effort: opcoes.esforco ?? "medium", format: formato },
    system,
    messages: mensagens,
  };
}

/** Lê e valida a resposta de um pedido do lote, registrando o consumo pela metade do preço. */
export async function lerRespostaDoLote<S extends z.ZodType>(resposta: Anthropic.Beta.BetaMessage, schema: S): Promise<z.infer<S>> {
  await registrarConsumo(resposta, 0.5);
  if (resposta.stop_reason === "refusal") throw new Error("O modelo recusou a tarefa.");
  if (resposta.stop_reason === "max_tokens") throw new Error("A resposta passou do limite de tamanho.");
  const texto = resposta.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const valido = schema.safeParse(JSON.parse(texto));
  if (!valido.success) throw new Error(`Resposta sem o formato esperado: ${z.prettifyError(valido.error).slice(0, 300)}`);
  return valido.data;
}

/**
 * Para respostas grandes (relatórios dos analistas): o formato vai por escrito (JSON Schema)
 * em vez de virar gramática obrigatória, que tem limite de tamanho na API. A resposta é
 * validada aqui e, se vier fora do formato, volta para o modelo corrigir com os erros.
 */
export async function gerarJson<S extends z.ZodType>(opcoes: Chamada<S>): Promise<z.infer<S>> {
  const formato = JSON.stringify(z.toJSONSchema(opcoes.schema));
  const { system, mensagens, extras } = montar(
    opcoes,
    `${opcoes.sistema}

# FORMATO DA RESPOSTA
Responda SOMENTE com um objeto JSON válido que siga exatamente este JSON Schema (todos os campos obrigatórios, sem texto antes ou depois, sem bloco de código):
${formato}`,
  );

  let correcoes = 0;
  for (let rodada = 0; rodada < 8; rodada++) {
    // Streaming: sem ele o SDK não aceita respostas grandes (o relatório + o raciocínio do modelo).
    const resposta = await claude().beta.messages.stream({
      model: MODELO,
      max_tokens: opcoes.maxTokens ?? 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: opcoes.esforco ?? "medium" },
      system,
      messages: mensagens,
      ...extras,
    }).finalMessage();
    await registrarConsumo(resposta);

    if (resposta.stop_reason === "pause_turn") {
      mensagens.push({ role: "assistant", content: resposta.content });
      continue;
    }
    if (resposta.stop_reason === "refusal") throw new Error("O modelo recusou a tarefa.");
    if (resposta.stop_reason === "max_tokens") throw new Error("A resposta passou do limite de tamanho. Tente com menos peças ou arquivos.");

    const texto = resposta.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const inicio = texto.indexOf("{");
    const fim = texto.lastIndexOf("}");
    let erro: string;
    try {
      const valido = opcoes.schema.safeParse(JSON.parse(texto.slice(inicio, fim + 1)));
      if (valido.success) return valido.data;
      erro = z.prettifyError(valido.error);
    } catch (e) {
      erro = `JSON inválido: ${(e as Error).message}`;
    }
    if (++correcoes > 2) throw new Error(`Resposta fora do formato esperado: ${erro.slice(0, 300)}`);
    mensagens.push({ role: "assistant", content: resposta.content });
    mensagens.push({
      role: "user",
      content: `A resposta não seguiu o formato. Corrija e devolva o objeto JSON completo, só ele:\n${erro.slice(0, 4000)}`,
    });
  }
  throw new Error("A análise não terminou a tempo.");
}

/** Erros conhecidos da API em português, para o painel mostrar o que fazer. */
export function explicarErro(e: unknown): string {
  const msg = (e as Error)?.message ?? String(e);
  if (/credit balance is too low/i.test(msg)) {
    return "Acabaram os créditos da API da Anthropic. Compre créditos em console.anthropic.com (Settings → Billing) e clique em Tentar de novo.";
  }
  if (/rate[_ ]limit|429/i.test(msg)) return "A API está no limite de uso por minuto. Espere um pouco e tente de novo.";
  if (/overloaded|529/i.test(msg)) return "A API da Anthropic está sobrecarregada agora. Tente de novo em alguns minutos.";
  if (/invalid x-api-key|authentication_error|401/i.test(msg)) return "A chave da API da Anthropic (ANTHROPIC_API_KEY na Vercel) é inválida ou foi revogada.";
  return msg;
}
