"use client";

import { useState } from "react";
import { CampoComAudio } from "./Audio";
import { FormularioDoQuestionario, RespostasDoQuestionario, type EnvioDoQuestionario } from "./Questionario";
import { Codigo, proximoCodigo, sugerirSigla, type Briefing, type Funil, type Projeto, type Questionario } from "./tipos";

type Campo = { chave: keyof Briefing; rotulo: string; lista?: boolean };

// Campos agrupados em blocos, um embaixo do outro, para ler e editar com calma.
const BLOCOS: Array<{ titulo: string; campos: Campo[] }> = [
  {
    titulo: "Produto e público",
    campos: [
      { chave: "produto", rotulo: "Produto" },
      { chave: "para_quem", rotulo: "Para quem" },
    ],
  },
  {
    titulo: "Promessa e oferta",
    campos: [
      { chave: "promessa_principal", rotulo: "Promessa principal" },
      { chave: "mecanismo", rotulo: "Mecanismo / diferencial" },
      { chave: "preco_atual", rotulo: "Preço atual" },
      { chave: "oferta_atual", rotulo: "Oferta atual" },
    ],
  },
  {
    titulo: "Argumentos",
    campos: [
      { chave: "dores", rotulo: "Dores", lista: true },
      { chave: "desejos", rotulo: "Desejos", lista: true },
      { chave: "provas", rotulo: "Provas reais", lista: true },
      { chave: "objecoes", rotulo: "Objeções", lista: true },
    ],
  },
  {
    titulo: "Comunicação",
    campos: [
      { chave: "tom_de_voz", rotulo: "Tom de voz" },
      { chave: "restricoes", rotulo: "Nunca dizer ou prometer", lista: true },
    ],
  },
];

/** Altura inicial da caixa pelo tamanho do texto (o CSS ainda faz ela crescer onde o navegador permite). */
const linhasPara = (texto: string) =>
  Math.min(16, Math.max(3, texto.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 95)), 0) + 1));

const BRIEFING_VAZIO: Briefing = {
  produto: "",
  para_quem: "",
  dores: [],
  desejos: [],
  promessa_principal: "",
  mecanismo: "",
  preco_atual: "",
  oferta_atual: "",
  provas: [],
  objecoes: [],
  tom_de_voz: "",
  identidade_visual: { cores: [], estilo: "" },
  restricoes: [],
};

export type NovoFunil = { nome: string; sigla: string; url: string };

/** Aba Briefing: os funis do projeto (cada um com seu código) e o briefing do funil escolhido. */
export function AbaBriefing({
  projeto,
  funis,
  funilId,
  aoEscolher,
  ocupado,
  aoCriar,
  aoCriarPeloQuestionario,
  aoGerar,
  aoSalvar,
  aoResponder,
  aoRenomear,
}: {
  projeto: Projeto;
  funis: Funil[];
  funilId: string | null;
  aoEscolher: (id: string) => void;
  ocupado: string | null;
  aoCriar: (f: NovoFunil) => Promise<boolean>;
  aoCriarPeloQuestionario: (e: EnvioDoQuestionario) => Promise<boolean>;
  aoGerar: (funilId: string, url: string) => void;
  aoSalvar: (funilId: string, b: Briefing) => void;
  aoResponder: (funilId: string, q: Questionario) => Promise<boolean>;
  aoRenomear: (funilId: string, nome: string) => Promise<boolean>;
}) {
  // Novo briefing: primeiro pergunta se já existe página de vendas.
  const [criando, setCriando] = useState<null | "pergunta" | "pagina" | "questionario">(funis.length === 0 ? "pergunta" : null);
  const funil = funis.find((f) => f.id === funilId) ?? null;
  const cancelar = funis.length ? () => setCriando(null) : () => setCriando("pergunta");

  return (
    <div className="funis">
      <nav className="funis-lista" aria-label="Briefings do projeto">
        {funis.map((f) => (
          <button key={f.id} className={`funis-item ${!criando && f.id === funilId ? "ativo" : ""}`}
            onClick={() => { setCriando(null); aoEscolher(f.id); }}>
            <Codigo codigo={f.codigo} />
            <span>{f.nome}</span>
            {!f.briefing && <small>sem briefing</small>}
          </button>
        ))}
        <button className={`funis-item funis-novo ${criando ? "ativo" : ""}`} onClick={() => setCriando("pergunta")}>+ Novo briefing</button>
      </nav>

      {criando === "pergunta" ? (
        <section className="painel-bloco briefing-pergunta">
          <h2>Você já tem a página de vendas desse produto?</h2>
          <div className="briefing-pergunta-opcoes">
            <button onClick={() => setCriando("pagina")}>
              <strong>Sim, já tenho</strong>
              <small>Você cola o link e o agente lê a página para montar o briefing.</small>
            </button>
            <button onClick={() => setCriando("questionario")}>
              <strong>Não, ainda não</strong>
              <small>Você responde algumas perguntas sobre o produto e o agente monta o briefing a partir delas.</small>
            </button>
          </div>
          {funis.length > 0 && (
            <div><button className="painel-botao secundario" onClick={() => setCriando(null)}>Cancelar</button></div>
          )}
        </section>
      ) : criando === "pagina" ? (
        <FormularioDeFunil
          projeto={projeto}
          funis={funis}
          ocupado={ocupado}
          aoCancelar={cancelar}
          aoCriar={async (f) => {
            if (await aoCriar(f)) setCriando(null);
          }}
        />
      ) : criando === "questionario" ? (
        <FormularioDoQuestionario
          projeto={projeto}
          funis={funis}
          ocupado={ocupado}
          aoCancelar={cancelar}
          aoEnviar={async (e) => {
            if (await aoCriarPeloQuestionario(e)) setCriando(null);
          }}
        />
      ) : funil ? (
        <CartaoBriefing key={funil.id} projeto={projeto} funis={funis} funil={funil} ocupado={ocupado}
          aoGerar={(url) => aoGerar(funil.id, url)} aoSalvar={(b) => aoSalvar(funil.id, b)}
          aoResponder={(q) => aoResponder(funil.id, q)} aoRenomear={(nome) => aoRenomear(funil.id, nome)} />
      ) : null}
    </div>
  );
}

function FormularioDeFunil({
  projeto,
  funis,
  ocupado,
  aoCancelar,
  aoCriar,
}: {
  projeto: Projeto;
  funis: Funil[];
  ocupado: string | null;
  aoCancelar?: () => void;
  aoCriar: (f: NovoFunil) => Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [sigla, setSigla] = useState("");
  const [siglaManual, setSiglaManual] = useState(false);
  const [url, setUrl] = useState("");
  const siglaFinal = siglaManual ? sigla : sugerirSigla(nome);
  const valida = /^[A-Z0-9]{2,5}$/.test(siglaFinal);

  return (
    <form className="painel-bloco funil-novo" onSubmit={(e) => { e.preventDefault(); void aoCriar({ nome, sigla: siglaFinal, url }); }}>
      <h2>Novo briefing</h2>
      <p className="painel-suave">
        Cada briefing é um funil com código próprio. Tudo que o time criar para ele (ofertas, copies, páginas, anúncios e vídeos) leva esse código no nome.
      </p>
      <label className="painel-campo">
        <span>Nome do produto</span>
        <input required autoFocus value={nome} placeholder="Ex.: Workshop Lucrando com Leilão" onChange={(e) => setNome(e.target.value)} />
      </label>
      <label className="painel-campo">
        <span>Sigla do produto <small>(2 a 5 letras ou números; sugerimos pelo nome)</small></span>
        <input value={siglaFinal} maxLength={5} className="funil-sigla"
          onChange={(e) => { setSiglaManual(true); setSigla(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); }} />
      </label>
      <label className="painel-campo">
        <span>Página de vendas <small>(opcional: o agente lê e monta o briefing)</small></span>
        <input type="url" value={url} placeholder="https://..." onChange={(e) => setUrl(e.target.value)} />
      </label>
      <div className="funil-previa">
        <span>Código do funil</span>
        <Codigo codigo={proximoCodigo(projeto, funis, siglaFinal)} />
        <small>Peças: {proximoCodigo(projeto, funis, siglaFinal)}-EST-001, -VID-001, -PV-001, -OF-001…</small>
      </div>
      <div className="painel-acoes">
        <button className="painel-botao" disabled={!nome.trim() || !valida || !!ocupado}>
          {ocupado === "funil" ? "Criando…" : url ? "Criar e ler a página" : "Criar briefing"}
        </button>
        {aoCancelar && <button type="button" className="painel-botao secundario" onClick={aoCancelar}>Cancelar</button>}
      </div>
    </form>
  );
}

function CartaoBriefing({
  projeto,
  funis,
  funil,
  ocupado,
  aoGerar,
  aoSalvar,
  aoResponder,
  aoRenomear,
}: {
  projeto: Projeto;
  funis: Funil[];
  funil: Funil;
  ocupado: string | null;
  aoGerar: (url: string) => void;
  aoSalvar: (b: Briefing) => void;
  aoResponder: (q: Questionario) => Promise<boolean>;
  aoRenomear: (nome: string) => Promise<boolean>;
}) {
  const [url, setUrl] = useState(funil.pagina_vendas_url ?? "");
  const [editando, setEditando] = useState<Briefing | null>(null);
  const [respondendo, setRespondendo] = useState(false);
  const [nome, setNome] = useState<string | null>(null);
  const b = funil.briefing;
  // Funil que nasceu do questionário só mostra o link quando já tem página.
  const mostrarUrl = !funil.questionario || !!funil.pagina_vendas_url;

  if (respondendo) {
    return (
      <FormularioDoQuestionario
        projeto={projeto}
        funis={funis}
        inicial={funil.questionario ?? { nome: funil.nome } as Questionario}
        codigoFixo={funil.codigo}
        ocupado={ocupado}
        aoCancelar={() => setRespondendo(false)}
        aoEnviar={async (e) => {
          if (await aoResponder(e.questionario)) setRespondendo(false);
        }}
      />
    );
  }

  return (
    <section className="painel-bloco">
      <div className="painel-cabecalho">
        <div>
          {nome !== null ? (
            <form className="funil-renomear" onSubmit={async (e) => { e.preventDefault(); if (await aoRenomear(nome)) setNome(null); }}>
              <Codigo codigo={funil.codigo} />
              <input autoFocus required value={nome} aria-label="Nome do produto" onChange={(e) => setNome(e.target.value)} />
              <button className="painel-botao" disabled={!!ocupado}>Salvar</button>
              <button type="button" className="painel-botao secundario" onClick={() => setNome(null)}>Cancelar</button>
            </form>
          ) : (
            <h2 className="funil-titulo">
              <Codigo codigo={funil.codigo} copiavel /> {funil.nome}
              <button className="painel-link" title="O código do funil não muda" onClick={() => setNome(funil.nome)}>Renomear</button>
            </h2>
          )}
          <p className="painel-suave">
            {b && funil.briefing_atualizado_em
              ? `Atualizado em ${new Date(funil.briefing_atualizado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
              : "O agente lê a página de vendas e monta o briefing. Depois você revisa. Ou preencha à mão."}
          </p>
        </div>
        {!editando && (
          <div className="painel-acoes">
            {!mostrarUrl || funil.questionario ? (
              <button className="painel-botao secundario" onClick={() => setRespondendo(true)}>
                {funil.questionario ? "Editar respostas" : "Responder questionário"}
              </button>
            ) : null}
            <button className="painel-botao secundario" onClick={() => setEditando(structuredClone(b ?? BRIEFING_VAZIO))}>
              {b ? "Editar briefing" : "Preencher à mão"}
            </button>
          </div>
        )}
      </div>

      {ocupado === "briefing" && !b && <p className="painel-aviso">⏳ O agente está montando o briefing…</p>}

      {mostrarUrl && <form className="painel-url" onSubmit={(e) => { e.preventDefault(); aoGerar(url); }}>
        <label htmlFor="url">Página de vendas</label>
        <input id="url" type="url" required placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="painel-botao" disabled={!!ocupado}>
          {ocupado === "briefing" ? "Lendo a página…" : b ? "Ler de novo" : "Ler página e gerar briefing"}
        </button>
      </form>}

      {editando ? (
        <div className="briefing editando">
          {BLOCOS.map((bloco) => (
            <fieldset key={bloco.titulo} className="briefing-bloco">
              <legend>{bloco.titulo}</legend>
              {bloco.campos.map(({ chave, rotulo, lista }) => {
                const valor = lista ? (editando[chave] as string[]).join("\n") : (editando[chave] as string);
                return (
                  <CampoComAudio
                    key={chave}
                    rotulo={rotulo}
                    dica={lista ? "(um item por linha)" : undefined}
                    linhas={linhasPara(valor)}
                    separador={lista ? "\n" : " "}
                    valor={valor}
                    aoMudar={(v) => setEditando({ ...editando, [chave]: lista ? v.split("\n").filter(Boolean) : v })}
                  />
                );
              })}
            </fieldset>
          ))}
          <fieldset className="briefing-bloco">
            <legend>Identidade visual</legend>
            <label className="painel-campo">
              <span>Cores <small>(hexadecimal, separadas por vírgula)</small></span>
              <div className="briefing-cores-campo">
                <input value={editando.identidade_visual.cores.join(", ")}
                  onChange={(e) => setEditando({ ...editando, identidade_visual: { ...editando.identidade_visual, cores: e.target.value.split(",").map((c) => c.trim()).filter(Boolean) } })} />
                <span className="painel-cores">
                  {editando.identidade_visual.cores.map((c) => <span key={c} style={{ background: c }} title={c} />)}
                </span>
              </div>
            </label>
            <CampoComAudio rotulo="Estilo visual" linhas={linhasPara(editando.identidade_visual.estilo)} valor={editando.identidade_visual.estilo}
              aoMudar={(v) => setEditando({ ...editando, identidade_visual: { ...editando.identidade_visual, estilo: v } })} />
          </fieldset>
          <div className="painel-acoes briefing-salvar">
            <button className="painel-botao" disabled={!!ocupado} onClick={() => { aoSalvar(editando); setEditando(null); }}>Salvar briefing</button>
            <button className="painel-botao secundario" onClick={() => setEditando(null)}>Cancelar</button>
          </div>
        </div>
      ) : b ? (
        <div className="briefing">
          {BLOCOS.map((bloco) => (
            <section key={bloco.titulo} className="briefing-bloco">
              <h3>{bloco.titulo}</h3>
              <dl>
                {bloco.campos.map(({ chave, rotulo, lista }) => (
                  <div key={chave} className="briefing-item">
                    <dt>{rotulo}</dt>
                    <dd>
                      {lista ? (
                        (b[chave] as string[]).length ? (
                          <ul>{(b[chave] as string[]).map((item, i) => <li key={i}>{item}</li>)}</ul>
                        ) : "—"
                      ) : (
                        (b[chave] as string) || "—"
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <section className="briefing-bloco">
            <h3>Identidade visual</h3>
            <dl>
              <div className="briefing-item">
                <dt>Cores</dt>
                <dd className="painel-cores">
                  {b.identidade_visual.cores.map((c) => <span key={c} style={{ background: c }} title={c} />)}
                  {b.identidade_visual.cores.join(", ")}
                </dd>
              </div>
              <div className="briefing-item">
                <dt>Estilo visual</dt>
                <dd>{b.identidade_visual.estilo}</dd>
              </div>
            </dl>
          </section>
          {funil.questionario && (
            <details className="briefing-bloco briefing-respostas">
              <summary><h3>Respostas do questionário</h3></summary>
              <RespostasDoQuestionario q={funil.questionario} />
            </details>
          )}
        </div>
      ) : null}
    </section>
  );
}
