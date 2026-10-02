"use client";

import { useState } from "react";
import { CampoComAudio } from "./Audio";
import { Codigo, proximoCodigo, sugerirSigla, type Funil, type Projeto, type Questionario } from "./tipos";

// Briefing de produto sem página de vendas: 21 perguntas em 6 blocos. O agente monta o
// briefing a partir das respostas, e as respostas vão junto para o time.

const FORMATOS = [
  "Área de membros",
  "Mentoria em grupo",
  "Consultoria individual",
  "Serviço recorrente",
  "Evento ou imersão presencial",
  "Produto físico",
];
const GARANTIAS = ["7 dias incondicional", "15 dias", "30 dias", "Garantia de resultado com contrato", "Sem garantia"];
const NENHUMA = "Nenhuma das opções acima";
const CONSCIENCIA = [
  "Não faz ideia",
  "Sabe do problema, não conhece a solução",
  "Conhece a solução, está escolhendo",
  "Já conhece você e está decidindo",
];

export const QUESTIONARIO_VAZIO: Questionario = {
  nome: "",
  preco: "",
  formato: "",
  acesso: "",
  garantia: "",
  garantia_condicao: "",
  para_quem: "",
  incluido: [],
  metodo: [],
  primeiro_resultado: "",
  bonus: [],
  de_onde: "",
  aonde: "",
  custo_de_ficar: "",
  prova: "",
  frase_do_cliente: "",
  ja_tentou: "",
  consciencia: "",
  culpado: "",
  diferenciais: [],
  nao_e_para: "",
  proposito: "",
  problemas: [],
};

type ChaveTexto = { [K in keyof Questionario]: Questionario[K] extends string ? K : never }[keyof Questionario];
type ChaveLista = { [K in keyof Questionario]: Questionario[K] extends string[] ? K : never }[keyof Questionario];

const OBRIGATORIAS: Array<[keyof Questionario, string]> = [
  ["nome", "nome do produto"],
  ["preco", "valor"],
  ["para_quem", "para quem é"],
  ["de_onde", "de onde o cliente sai"],
  ["aonde", "aonde ele chega"],
];

const linhas = (t: string) => Math.min(14, Math.max(2, t.split("\n").length + 1));

export type EnvioDoQuestionario = { nome: string; sigla: string; questionario: Questionario };

export function FormularioDoQuestionario({
  projeto,
  funis,
  inicial,
  codigoFixo,
  ocupado,
  aoEnviar,
  aoCancelar,
}: {
  projeto: Projeto;
  funis: Funil[];
  inicial?: Questionario | null;
  /** Funil que já existe: o código não muda e a sigla não aparece. */
  codigoFixo?: string;
  ocupado: string | null;
  aoEnviar: (e: EnvioDoQuestionario) => void;
  aoCancelar: () => void;
}) {
  const [q, setQ] = useState<Questionario>(() => ({ ...QUESTIONARIO_VAZIO, ...(inicial ?? {}) }));
  const [sigla, setSigla] = useState("");
  const [siglaManual, setSiglaManual] = useState(false);
  const [formatoOutro, setFormatoOutro] = useState(!!q.formato && !FORMATOS.includes(q.formato));
  const [tentou, setTentou] = useState(false);
  const siglaFinal = siglaManual ? sigla : sugerirSigla(q.nome);
  const faltando = OBRIGATORIAS.filter(([k]) => !String(q[k]).trim()).map(([, nome]) => nome);
  const siglaValida = !!codigoFixo || /^[A-Z0-9]{2,5}$/.test(siglaFinal);

  const muda = <K extends keyof Questionario>(k: K, v: Questionario[K]) => setQ((atual) => ({ ...atual, [k]: v }));
  const texto = (k: ChaveTexto, numero: number, rotulo: string, exemplo: string, ajuda?: string, obrigatoria?: boolean) => (
    <CampoComAudio
      rotulo={<><span className="q-numero">{numero}.</span> {rotulo}{obrigatoria && <em className="q-obrigatoria"> *</em>}</>}
      ajuda={ajuda}
      placeholder={`Ex.: ${exemplo}`}
      linhas={linhas(q[k])}
      valor={q[k]}
      aoMudar={(v) => muda(k, v)}
    />
  );
  const lista = (k: ChaveLista, numero: number, rotulo: string, exemplo: string[], ajuda?: string) => (
    <CampoComAudio
      rotulo={<><span className="q-numero">{numero}.</span> {rotulo}</>}
      dica="(um por linha)"
      ajuda={ajuda}
      placeholder={`Ex.:\n${exemplo.join("\n")}`}
      linhas={Math.max(exemplo.length + 1, linhas(q[k].join("\n")))}
      separador={"\n"}
      valor={q[k].join("\n")}
      aoMudar={(v) => muda(k, v.split("\n"))}
    />
  );
  const opcoes = (nome: string, lista: string[], valor: string, aoEscolher: (v: string) => void) => (
    <div className="q-opcoes" role="radiogroup">
      {lista.map((o) => (
        <label key={o} className={`q-opcao ${valor === o ? "ativa" : ""}`}>
          <input type="radio" name={nome} checked={valor === o} onChange={() => aoEscolher(o)} />
          {o}
        </label>
      ))}
    </div>
  );

  const enviar = () => {
    setTentou(true);
    if (faltando.length || !siglaValida) return;
    const limpa = (l: string[]) => l.map((x) => x.trim()).filter(Boolean);
    aoEnviar({
      nome: q.nome.trim(),
      sigla: siglaFinal,
      questionario: {
        ...q,
        incluido: limpa(q.incluido),
        metodo: limpa(q.metodo),
        bonus: limpa(q.bonus),
        diferenciais: limpa(q.diferenciais),
        problemas: q.problemas.filter((p) => p.problema.trim() || p.solucao.trim()),
      },
    });
  };

  const codigo = codigoFixo ?? proximoCodigo(projeto, funis, siglaFinal);

  return (
    <form className="painel-bloco briefing editando questionario" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
      <div>
        <h2>{codigoFixo ? "Respostas do questionário" : "Briefing do produto (sem página de vendas)"}</h2>
        <p className="painel-suave">
          Responda com as palavras do dia a dia; dá para falar em vez de digitar (🎙️). Só as perguntas com * são obrigatórias,
          mas quanto mais você responder, melhor a copy. Ao enviar, o agente monta o briefing e você revisa.
        </p>
      </div>

      <fieldset className="briefing-bloco">
        <legend>1 · Identificação e oferta</legend>
        {texto("nome", 1, "Qual é o nome do produto?", "Mentoria Escala, Tráfego com Método, Clube dos Civilistas", undefined, true)}
        {codigoFixo ? null : (
          <label className="painel-campo">
            <span>Sigla do produto <small>(2 a 5 letras ou números; sugerimos pelo nome)</small></span>
            <input value={siglaFinal} maxLength={5} className="funil-sigla"
              onChange={(e) => { setSiglaManual(true); setSigla(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); }} />
          </label>
        )}
        <div className="funil-previa">
          <span>Código do funil</span>
          <Codigo codigo={codigo} />
          <small>Peças: {codigo}-EST-001, -VID-001, -PV-001, -OF-001…</small>
        </div>
        {texto("preco", 2, "Qual o valor e as condições de pagamento?", "R$ 12.000 à vista ou 12x de R$ 1.200", undefined, true)}

        <div className="painel-campo">
          <span><span className="q-numero">3.</span> Qual é o formato do produto?</span>
          {opcoes("formato", [...FORMATOS, NENHUMA], formatoOutro ? NENHUMA : q.formato, (v) => {
            setFormatoOutro(v === NENHUMA);
            muda("formato", v === NENHUMA ? "" : v);
          })}
          {formatoOutro && (
            <input placeholder="Qual é o formato?" value={q.formato} onChange={(e) => muda("formato", e.target.value)} />
          )}
        </div>
        <CampoComAudio rotulo="Como o cliente acessa na prática?" placeholder="Ex.: pela agenda do consultório, com hora marcada"
          linhas={linhas(q.acesso)} valor={q.acesso} aoMudar={(v) => muda("acesso", v)} />

        <div className="painel-campo">
          <span><span className="q-numero">4.</span> Qual é a sua garantia, e sob qual condição?</span>
          {opcoes("garantia", [...GARANTIAS, NENHUMA], q.garantia, (v) => muda("garantia", v))}
        </div>
        <CampoComAudio rotulo={q.garantia === NENHUMA ? "Qual é a garantia e a condição?" : "Condição da garantia"}
          placeholder="Ex.: 60 dias, para quem entregar as tarefas das 4 primeiras semanas"
          linhas={linhas(q.garantia_condicao)} valor={q.garantia_condicao} aoMudar={(v) => muda("garantia_condicao", v)} />
      </fieldset>

      <fieldset className="briefing-bloco">
        <legend>2 · O que o cliente recebe</legend>
        {texto("para_quem", 5, "Para quem é este produto?", "empresários que já vendem e querem escalar no digital", undefined, true)}
        {lista("incluido", 6, "O que está incluído?", [
          "Encontros quinzenais ao vivo, por 12 meses",
          "Área de membros com a metodologia completa",
          "Grupo no WhatsApp com suporte",
          "Reunião individual de diagnóstico",
        ], "Inclua a duração e o ritmo.")}
        {lista("metodo", 7, "Como o seu método funciona, em 3 passos?", [
          "1. Diagnóstico: a gente mede quanto cada cliente está custando hoje",
          "2. Correção: arrumamos o rastreio e cortamos o que não paga",
          "3. Escala: só depois o orçamento sobe, com o número na mão",
        ], "É daqui que sai o mecanismo da página de vendas, o bloco do meio do webinar e o ângulo da VSL.")}
        {texto("primeiro_resultado", 8, "Em quanto tempo o cliente vê o primeiro resultado?",
          "na primeira semana ele já sabe o custo por cliente, coisa que não sabia antes",
          "O resultado pequeno, não o final. É o que sustenta a garantia e tira o medo da decisão.")}
        {lista("bonus", 9, "Tem bônus? Quanto valeriam se fossem vendidos separados?", [
          "Planilha de nomenclatura e UTM — R$ 497",
          "Modelo de script de atendimento — R$ 297",
        ], "Um por linha, com o valor.")}
      </fieldset>

      <fieldset className="briefing-bloco">
        <legend>3 · A transformação</legend>
        {texto("de_onde", 10, "De onde o cliente sai? (a situação de hoje)", "gastando com anúncio sem saber quanto cada cliente custou", undefined, true)}
        {texto("aonde", 11, "Aonde ele chega?", "sabendo o custo por cliente e quanto investir para crescer", undefined, true)}
        {texto("custo_de_ficar", 12, "Quanto custa para ele continuar como está?",
          "queima R$ 8 mil por mês em campanha que não dá retorno, e não sabe qual parte é",
          "Em dinheiro, tempo ou oportunidade perdida. É o que transforma preço em comparação; sem isso, todo produto parece caro.")}
        {texto("prova", 13, "Qual é a sua prova ou resultado concreto?",
          "37 contas ativas, com queda média de 41% no custo por lead nos primeiros 90 dias")}
      </fieldset>

      <fieldset className="briefing-bloco">
        <legend>4 · A cabeça do cliente</legend>
        {texto("frase_do_cliente", 14, "Que frase o cliente usa para descrever o problema dele?",
          "\"eu coloco dinheiro no Instagram e não sei se volta\"",
          "A fala literal, do jeito que ele diz, não a versão traduzida para marketing.")}
        {texto("ja_tentou", 15, "O que ele já tentou e não funcionou?",
          "contratou duas agências, recebeu relatório bonito e nunca soube de onde veio a venda",
          "A pergunta mais valiosa do briefing. Gera o \"não é culpa sua\", o vilão e a sua diferenciação de uma vez só.")}
        <div className="painel-campo">
          <span><span className="q-numero">16.</span> Ele já sabe que tem esse problema?</span>
          <small className="painel-ajuda">Decide se o anúncio abre pelo problema ou direto pela oferta.</small>
          {opcoes("consciencia", CONSCIENCIA, q.consciencia, (v) => muda("consciencia", v))}
        </div>
        {texto("culpado", 17, "Quem ou o que é o culpado?", "o modelo de agência que entrega relatório em vez de número",
          "O inimigo externo da história. Copy sem antagonista vira catálogo.")}
      </fieldset>

      <fieldset className="briefing-bloco">
        <legend>5 · Posicionamento</legend>
        {lista("diferenciais", 18, "O que você faz que o concorrente não faz, ou não quer fazer?", [
          "Entrego o custo por cliente todo dia, não um relatório no fim do mês",
          "O rastreio é montado antes da primeira campanha subir",
          "Quem opera a conta é quem senta com você na reunião",
        ], "Um motivo por linha.")}
        {texto("nao_e_para", 19, "Para quem este produto NÃO é?", "não é para quem quer terceirizar tudo e não olhar número",
          "Filtra lead ruim e aumenta o desejo de quem fica.")}
        {texto("proposito", 20, "Existe um propósito maior por trás do produto?",
          "tirar o dono do negócio do escuro: quem enxerga o número decide sem medo")}
      </fieldset>

      <fieldset className="briefing-bloco">
        <legend>6 · Problema e solução</legend>
        <div className="painel-campo">
          <span><span className="q-numero">21.</span> Liste os problemas do cliente e o que você faz com cada um</span>
          <small className="painel-ajuda">Pares, quantos quiser.</small>
          <div className="q-pares">
            <div className="q-par q-par-topo" aria-hidden><span>Problema</span><span>O que você faz</span><span /></div>
            {(q.problemas.length ? q.problemas : [{ problema: "", solucao: "" }]).map((p, i) => {
              const atualiza = (campo: "problema" | "solucao", v: string) => {
                const novos = q.problemas.length ? [...q.problemas] : [{ problema: "", solucao: "" }];
                novos[i] = { ...novos[i], [campo]: v };
                muda("problemas", novos);
              };
              return (
                <div key={i} className="q-par">
                  <textarea rows={2} aria-label={`Problema ${i + 1}`} value={p.problema}
                    placeholder={i === 0 ? "Ex.: Não sabe qual anúncio gerou venda" : ""} onChange={(e) => atualiza("problema", e.target.value)} />
                  <textarea rows={2} aria-label={`O que você faz ${i + 1}`} value={p.solucao}
                    placeholder={i === 0 ? "Ex.: Padronizamos o rastreio e o painel mostra por anúncio" : ""} onChange={(e) => atualiza("solucao", e.target.value)} />
                  <button type="button" className="painel-link" aria-label="Remover par"
                    onClick={() => muda("problemas", q.problemas.filter((_, j) => j !== i))}>✕</button>
                </div>
              );
            })}
            <button type="button" className="painel-botao secundario q-adicionar"
              onClick={() => muda("problemas", [...(q.problemas.length ? q.problemas : [{ problema: "", solucao: "" }]), { problema: "", solucao: "" }])}>
              + Adicionar problema
            </button>
          </div>
        </div>
      </fieldset>

      <div className="painel-acoes briefing-salvar">
        <button className="painel-botao" disabled={!!ocupado}>
          {ocupado === "funil" || ocupado === "briefing" ? "Montando o briefing…" : codigoFixo ? "Salvar e refazer o briefing" : "Criar briefing"}
        </button>
        <button type="button" className="painel-botao secundario" disabled={!!ocupado} onClick={aoCancelar}>Cancelar</button>
        {tentou && (faltando.length > 0 || !siglaValida) && (
          <span className="painel-erro">
            {faltando.length ? `Falta responder: ${faltando.join(", ")}.` : "A sigla precisa ter de 2 a 5 letras ou números."}
          </span>
        )}
      </div>
    </form>
  );
}

/** Leitura das respostas dentro do briefing do funil. */
export function RespostasDoQuestionario({ q }: { q: Questionario }) {
  const linhasDeTexto: Array<[string, string]> = [
    ["Valor e condições", q.preco],
    ["Formato", [q.formato, q.acesso].filter(Boolean).join(" · ")],
    ["Garantia", [q.garantia, q.garantia_condicao].filter(Boolean).join(" · ")],
    ["Para quem é", q.para_quem],
    ["Primeiro resultado", q.primeiro_resultado],
    ["De onde sai", q.de_onde],
    ["Aonde chega", q.aonde],
    ["Custo de continuar como está", q.custo_de_ficar],
    ["Prova", q.prova],
    ["Frase do cliente", q.frase_do_cliente],
    ["O que já tentou", q.ja_tentou],
    ["Consciência do problema", q.consciencia],
    ["Culpado", q.culpado],
    ["Para quem NÃO é", q.nao_e_para],
    ["Propósito", q.proposito],
  ];
  const listas: Array<[string, string[]]> = [
    ["O que está incluído", q.incluido],
    ["Método em 3 passos", q.metodo],
    ["Bônus", q.bonus],
    ["Diferenciais", q.diferenciais],
  ];
  return (
    <dl>
      {linhasDeTexto.filter(([, v]) => v?.trim()).map(([r, v]) => (
        <div key={r} className="briefing-item"><dt>{r}</dt><dd>{v}</dd></div>
      ))}
      {listas.filter(([, v]) => v?.length).map(([r, v]) => (
        <div key={r} className="briefing-item"><dt>{r}</dt><dd><ul>{v.map((x, i) => <li key={i}>{x}</li>)}</ul></dd></div>
      ))}
      {q.problemas?.length > 0 && (
        <div className="briefing-item">
          <dt>Problemas e o que você faz</dt>
          <dd><ul>{q.problemas.map((p, i) => <li key={i}><strong>{p.problema}</strong> → {p.solucao}</li>)}</ul></dd>
        </div>
      )}
    </dl>
  );
}
