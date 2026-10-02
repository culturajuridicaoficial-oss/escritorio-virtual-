"use client";

import { useEffect, useRef, useState } from "react";
import { CampoComAudio } from "./Audio";
import { PaginaDeVendas, type CopyDaPagina } from "../pagina/PaginaDeVendas";
import { Codigo, Peca, Status, dataHora, reais, resumoDasEntregas, type Criativo, type Dados, type Oferta, type Pedido } from "./tipos";

// Quadro Kanban do painel do projeto (como no ClickUp): cada pedido, oferta, página,
// estático e vídeo é um cartão que anda pelas colunas até ser aprovado.

type Coluna = "fila" | "producao" | "aprovar" | "reprovado" | "aprovado";

const COLUNAS: Array<{ id: Coluna; nome: string; dica: string }> = [
  { id: "fila", nome: "Na fila", dica: "Pedidos que o time de copy está escrevendo" },
  { id: "producao", nome: "Em produção", dica: "Design e vídeo sendo feitos" },
  { id: "aprovar", nome: "Para aprovar", dica: "Clique para analisar" },
  { id: "reprovado", nome: "Reprovado", dica: "Com o motivo" },
  { id: "aprovado", nome: "Aprovado", dica: "Pronto para usar" },
];

export type Cartao =
  | { chave: string; coluna: Coluna; tipo: "pedido"; data: string; pedido: Pedido }
  | { chave: string; coluna: Coluna; tipo: "oferta"; data: string; oferta: Oferta; pedido: Pedido | null }
  | { chave: string; coluna: Coluna; tipo: "criativo"; data: string; criativo: Criativo; oferta: Oferta; pedido: Pedido | null };

const ROTULO_TIPO: Record<string, string> = {
  pedido: "📝 Pedido",
  oferta: "💡 Oferta",
  pagina: "📄 Página de vendas",
  estatico: "🎨 Anúncio estático",
  video: "🎬 Vídeo",
};
const FORMATO_CURTO: Record<string, string> = { "1080x1080": "Feed 1:1", "1080x1350": "Feed 4:5", "1080x1920": "Stories 9:16" };

function colunaDe(status: string): Coluna | null {
  if (status === "em_producao" || status === "erro") return "producao";
  if (status === "aguardando_aprovacao") return "aprovar";
  if (status === "reprovado" || status === "reprovada") return "reprovado";
  if (["aprovado", "aprovada", "publicado", "publicada"].includes(status)) return "aprovado";
  return null;
}

export function montarCartoes(dados: Dados, funilId: string | null = null): Cartao[] {
  const cartoes: Cartao[] = [];
  const doFunil = (id: string | null) => !funilId || id === funilId;
  for (const p of dados.pedidos.filter((p) => doFunil(p.funil_id))) {
    if (p.status === "escrevendo" || (p.status === "erro" && !dados.ofertas.some((o) => o.pedido_id === p.id))) {
      cartoes.push({ chave: `p-${p.id}`, coluna: "fila", tipo: "pedido", data: p.created_at, pedido: p });
    }
  }
  for (const o of dados.ofertas.filter((o) => doFunil(o.funil_id))) {
    const pedido = dados.pedidos.find((p) => p.id === o.pedido_id) ?? null;
    const coluna = colunaDe(o.status);
    if (coluna) cartoes.push({ chave: `o-${o.id}`, coluna, tipo: "oferta", data: o.created_at, oferta: o, pedido });
    for (const c of o.criativos) {
      const col = colunaDe(c.status);
      if (col) cartoes.push({ chave: `c-${c.id}`, coluna: col, tipo: "criativo", data: c.created_at, criativo: c, oferta: o, pedido });
    }
  }
  return cartoes.sort((a, b) => b.data.localeCompare(a.data));
}

/** Código da peça; no pedido (que ainda não virou peça), o código do funil. */
function codigoDoCartao(c: Cartao, dados: Dados): string | null {
  if (c.tipo === "criativo") return c.criativo.codigo;
  if (c.tipo === "oferta") return c.oferta.codigo ?? dados.funis.find((f) => f.id === c.oferta.funil_id)?.codigo ?? null;
  return dados.funis.find((f) => f.id === c.pedido.funil_id)?.codigo ?? null;
}

function tituloDoCartao(c: Cartao): string {
  if (c.tipo === "pedido") return c.pedido.texto;
  if (c.tipo === "oferta") return c.oferta.titulo;
  const copy = c.criativo.copy as Record<string, string>;
  if (c.criativo.tipo === "pagina") return copy.headline ?? "Página de vendas";
  return copy.angulo ?? copy.headline ?? "";
}

export type Acoes = {
  produzindo: Set<string>;
  aoProduzir: (ids: string[]) => Promise<void>;
  aoRevisar: (tipo: "oferta" | "criativo", id: string, decisao: "aprovar" | "reprovar", motivo?: string) => Promise<void>;
  aoRefazer: (tipo: "oferta" | "criativo", id: string, motivo: string) => Promise<void>;
  aoAnalisar?: (funilId: string | null, tipo: "oferta" | "criativo", id: string) => void;
};

export function Quadro({ dados, acoes }: { dados: Dados; acoes: Acoes }) {
  const [filtro, setFiltro] = useState<string>("");
  const cartoes = montarCartoes(dados, filtro || null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [limites, setLimites] = useState<Record<string, number>>({ reprovado: 8, aprovado: 8 });
  const cartaoAberto = cartoes.find((c) => c.chave === aberto) ?? null;

  return (
    <>
      {dados.funis.length > 1 && (
        <label className="quadro-filtro">
          <span>Funil</span>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="">Todos os funis</option>
            {dados.funis.map((f) => <option key={f.id} value={f.id}>{f.codigo} · {f.nome}</option>)}
          </select>
        </label>
      )}
      <div className="quadro" role="list" aria-label="Quadro de tarefas do projeto">
        {COLUNAS.map((col) => {
          const daColuna = cartoes.filter((c) => c.coluna === col.id);
          const limite = limites[col.id] ?? Infinity;
          return (
            <section key={col.id} className={`quadro-coluna q-${col.id}`} role="listitem" aria-label={col.nome}>
              <header>
                <span className="quadro-nome">{col.nome}</span>
                <span className="quadro-contagem">{daColuna.length}</span>
              </header>
              <p className="quadro-dica">{col.dica}</p>
              <div className="quadro-cartoes">
                {daColuna.length === 0 && <p className="quadro-vazio">Nada aqui</p>}
                {daColuna.slice(0, limite).map((c) => (
                  <CartaoDoQuadro key={c.chave} cartao={c} codigo={codigoDoCartao(c, dados)} produzindo={acoes.produzindo} aoAbrir={() => setAberto(c.chave)} />
                ))}
                {daColuna.length > limite && (
                  <button className="quadro-mais" onClick={() => setLimites({ ...limites, [col.id]: limite + 8 })}>
                    Ver mais {daColuna.length - limite}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {cartaoAberto && <JanelaDoCartao cartao={cartaoAberto} codigo={codigoDoCartao(cartaoAberto, dados)} acoes={acoes} aoFechar={() => setAberto(null)} />}
    </>
  );
}

function CartaoDoQuadro({ cartao, codigo, produzindo, aoAbrir }: { cartao: Cartao; codigo: string | null; produzindo: Set<string>; aoAbrir: () => void }) {
  const tipo = cartao.tipo === "criativo" ? cartao.criativo.tipo : cartao.tipo;
  const criativo = cartao.tipo === "criativo" ? cartao.criativo : null;
  const erro = (criativo?.status === "erro" && criativo.erro) || (cartao.tipo === "pedido" && cartao.pedido.erro);
  const origem = cartao.tipo === "pedido" ? null : cartao.pedido ? `Pedido: ${cartao.pedido.texto}` : "Rodada automática";
  return (
    <button className={`quadro-cartao ${erro ? "com-erro" : ""}`} onClick={aoAbrir}>
      {codigo && <span className="quadro-codigo"><Codigo codigo={codigo} /></span>}
      <span className="quadro-tipo">
        {ROTULO_TIPO[tipo]}
        {criativo?.formato && FORMATO_CURTO[criativo.formato] && <small> · {FORMATO_CURTO[criativo.formato]}</small>}
        {criativo?.refaz_de && <small className="quadro-refacao"> · refação</small>}
      </span>
      {criativo?.html && (criativo.tipo === "estatico" || criativo.tipo === "video") && (
        <span className="quadro-miniatura" aria-hidden>
          <Peca criativo={criativo} altura={110} />
        </span>
      )}
      <strong className="quadro-titulo">{tituloDoCartao(cartao)}</strong>
      {cartao.tipo === "pedido" && <span className="quadro-sub">{resumoDasEntregas(cartao.pedido.entregas)}</span>}
      {criativo && (criativo.status === "em_producao" || criativo.status === "erro") && (
        <span className="quadro-sub">
          {produzindo.has(criativo.id)
            ? criativo.tipo === "video" ? "🎬 Editando…" : "🎨 Desenhando…"
            : criativo.status === "erro" ? "⚠ Erro na produção" : criativo.lote_id ? "🌙 No lote do dia (metade do preço)" : "Na fila de produção"}
        </span>
      )}
      {cartao.tipo === "pedido" && cartao.pedido.status === "escrevendo" && <span className="quadro-sub">✍️ Time de copy escrevendo…</span>}
      {erro && cartao.tipo === "pedido" && <span className="quadro-sub erro">⚠ {cartao.pedido.erro}</span>}
      <span className="quadro-rodape">
        {origem && <span className="quadro-origem">{origem}</span>}
        <time>{dataHora(cartao.data)}</time>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- janela do cartão

function JanelaDoCartao({ cartao, codigo, acoes, aoFechar }: { cartao: Cartao; codigo: string | null; acoes: Acoes; aoFechar: () => void }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogo.current?.showModal();
  }, []);

  const tipo = cartao.tipo === "criativo" ? cartao.criativo.tipo : cartao.tipo;
  const status =
    cartao.tipo === "pedido" ? cartao.pedido.status : cartao.tipo === "oferta" ? cartao.oferta.status : cartao.criativo.status;

  return (
    <dialog ref={dialogo} className="janela" onClose={aoFechar} onClick={(e) => e.target === dialogo.current && dialogo.current?.close()}>
      <div className="janela-conteudo">
        <header className="janela-topo">
          <div>
            <span className="painel-rotulo">
              <Codigo codigo={codigo} copiavel /> {ROTULO_TIPO[tipo]} · {dataHora(cartao.data)}
            </span>
            <h2>{tituloDoCartao(cartao)}</h2>
          </div>
          <div className="janela-topo-dir">
            <Status status={status} />
            <button className="janela-fechar" onClick={() => dialogo.current?.close()} aria-label="Fechar">✕</button>
          </div>
        </header>

        <div className={`janela-corpo ${tipo === "pagina" ? "janela-pagina" : ""}`}>
          <Visualizacao cartao={cartao} />
          <Detalhes cartao={cartao} />
        </div>

        <AcoesDoCartao cartao={cartao} acoes={acoes} aoConcluir={() => dialogo.current?.close()} />
      </div>
    </dialog>
  );
}

function Visualizacao({ cartao }: { cartao: Cartao }) {
  if (cartao.tipo !== "criativo") return null;
  const c = cartao.criativo;
  if (c.tipo === "pagina") {
    return (
      <div className="janela-previa-pagina">
        <PaginaDeVendas pagina={c.copy as unknown as CopyDaPagina} oferta={cartao.oferta} />
      </div>
    );
  }
  if (!c.html) {
    return <div className="janela-sem-peca">{c.status === "erro" ? `⚠ ${c.erro}` : "A peça ainda está em produção."}</div>;
  }
  const [w, h] = (c.formato ?? "1080x1080").split("x").map(Number);
  const altura = Math.min(620, h > w ? 620 : 520);
  return (
    <div className="janela-previa">
      <Peca criativo={c} altura={altura} />
    </div>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="janela-linha">
      <dt>{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Detalhes({ cartao }: { cartao: Cartao }) {
  const pedido = cartao.tipo === "pedido" ? cartao.pedido : cartao.pedido;
  const blocoPedido = pedido && (
    <Linha rotulo={cartao.tipo === "pedido" ? "Pedido" : "Pedido de origem"}>
      <span className="janela-pedido">{pedido.texto}</span>
      <small className="painel-suave">
        {resumoDasEntregas(pedido.entregas)}
        {pedido.referencias.length > 0 && ` · ${pedido.referencias.length} anexo(s)`} · por {pedido.autor}
      </small>
    </Linha>
  );

  if (cartao.tipo === "pedido") {
    return <dl className="janela-detalhes">{blocoPedido}{cartao.pedido.erro && <Linha rotulo="Erro">{cartao.pedido.erro}</Linha>}</dl>;
  }

  const o = cartao.oferta;
  if (cartao.tipo === "oferta") {
    return (
      <dl className="janela-detalhes janela-detalhes-larga">
        <Linha rotulo="Promessa">{o.promessa}</Linha>
        <Linha rotulo="Preço">{o.preco !== null ? reais(Number(o.preco)) : null}</Linha>
        <Linha rotulo="Bônus">
          {o.bonus?.length ? <ul>{o.bonus.map((b, i) => <li key={i}><strong>{b.nome}</strong>: {b.descricao}</li>)}</ul> : null}
        </Linha>
        <Linha rotulo="Garantia">{o.garantia}</Linha>
        <Linha rotulo="Por que deve vender">{o.racional}</Linha>
        {o.feedback && <Linha rotulo="Refeita a partir de">{o.feedback}</Linha>}
        {o.motivo_reprovacao && <Linha rotulo="Motivo da reprovação">{o.motivo_reprovacao}</Linha>}
        {blocoPedido}
      </dl>
    );
  }

  const c = cartao.criativo;
  const copy = c.copy as Record<string, unknown>;
  return (
    <dl className="janela-detalhes">
      {c.tipo !== "pagina" && <Linha rotulo="Ângulo">{copy.angulo as string}</Linha>}
      {c.tipo === "estatico" && (
        <>
          <Linha rotulo="Textos da arte">
            <strong>{copy.headline as string}</strong>
            <br />{copy.apoio as string}
            <br /><em>{copy.cta as string}</em>
          </Linha>
          <Linha rotulo="Texto do anúncio (acima da imagem)"><span className="janela-pre">{copy.texto_principal as string}</span></Linha>
          <Linha rotulo="Título (abaixo da imagem)">{copy.titulo_anuncio as string}</Linha>
        </>
      )}
      {c.tipo === "video" && (
        <>
          <Linha rotulo="Gancho">{copy.gancho as string}</Linha>
          <Linha rotulo="Roteiro">
            <ol className="painel-roteiro">
              {(copy.cenas as Array<{ segundos: number; texto_na_tela: string; narracao: string; visual: string }>).map((cena, i) => (
                <li key={i}>
                  <strong>{cena.segundos}s · {cena.texto_na_tela}</strong>
                  <br />🎙 {cena.narracao}
                  <br /><small className="painel-suave">🎞 {cena.visual}</small>
                </li>
              ))}
            </ol>
          </Linha>
          <Linha rotulo="Texto do anúncio"><span className="janela-pre">{copy.texto_principal as string}</span></Linha>
        </>
      )}
      <Linha rotulo="Oferta">{o.titulo}</Linha>
      {c.feedback && <Linha rotulo="Refeita a partir de">{c.feedback}</Linha>}
      {c.motivo_reprovacao && <Linha rotulo="Motivo">{c.motivo_reprovacao}</Linha>}
      {c.status === "erro" && <Linha rotulo="Erro">{c.erro}</Linha>}
      {blocoPedido}
    </dl>
  );
}

function AcoesDoCartao({ cartao, acoes, aoConcluir }: { cartao: Cartao; acoes: Acoes; aoConcluir: () => void }) {
  const [modo, setModo] = useState<"refazer" | "reprovar" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (cartao.tipo === "pedido") return null;
  const alvo = cartao.tipo === "oferta" ? { tipo: "oferta" as const, id: cartao.oferta.id, status: cartao.oferta.status } : { tipo: "criativo" as const, id: cartao.criativo.id, status: cartao.criativo.status };

  // O Veredito audita a peça antes (ou depois) da aprovação.
  const funilDoAlvo = cartao.tipo === "oferta" ? cartao.oferta.funil_id : cartao.criativo.funil_id;
  const analisar = acoes.aoAnalisar && (
    <button className="painel-botao secundario" onClick={() => { acoes.aoAnalisar!(funilDoAlvo, alvo.tipo, alvo.id); aoConcluir(); }}>
      ⚖️ Analisar com o Veredito
    </button>
  );

  const executar = async (acao: () => Promise<void>) => {
    setEnviando(true);
    setErro(null);
    try {
      await acao();
      aoConcluir();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  if (alvo.status === "em_producao" || alvo.status === "erro") {
    const emAndamento = acoes.produzindo.has(alvo.id);
    return (
      <footer className="janela-acoes">
        <button className="painel-botao" disabled={emAndamento} onClick={() => { void acoes.aoProduzir([alvo.id]); aoConcluir(); }}>
          {emAndamento ? "Em produção…" : alvo.status === "erro" ? "Tentar de novo" : "Produzir agora"}
        </button>
        {cartao.tipo === "criativo" && cartao.criativo.lote_id && !emAndamento && (
          <small className="janela-dica">Está no lote do dia, que custa metade e fica pronto em até 24 h (quase sempre em menos de 1 h). &quot;Produzir agora&quot; faz na hora, pelo preço cheio.</small>
        )}
      </footer>
    );
  }
  if (alvo.status !== "aguardando_aprovacao") {
    return (
      <footer className="janela-acoes">
        {cartao.tipo === "criativo" && cartao.criativo.tipo === "pagina" && ["aprovado", "publicado"].includes(alvo.status) && (
          <a className="painel-botao secundario" href={`/p/${alvo.id}`} target="_blank" rel="noreferrer">Abrir página publicada ↗</a>
        )}
        {analisar}
      </footer>
    );
  }

  return (
    <footer className="janela-acoes">
      {modo ? (
        <div className="janela-motivo">
          <CampoComAudio
            rotulo={modo === "refazer" ? "O que precisa mudar? (o time refaz com base nisso)" : "Por que reprovar? (o time aprende com isso)"}
            valor={motivo}
            aoMudar={setMotivo}
            linhas={3}
            autoFocus
            placeholder={modo === "refazer" ? "Ex.: troque o fundo para preto, a headline está longa e o botão precisa ser verde" : "Ex.: ângulo não combina com o público"}
          />
          <div className="painel-acoes">
            <button
              className={`painel-botao ${modo === "reprovar" ? "perigo" : ""}`}
              disabled={!motivo.trim() || enviando}
              onClick={() =>
                executar(() =>
                  modo === "refazer"
                    ? acoes.aoRefazer(alvo.tipo, alvo.id, motivo.trim())
                    : acoes.aoRevisar(alvo.tipo, alvo.id, "reprovar", motivo.trim()),
                )
              }
            >
              {enviando ? "Enviando…" : modo === "refazer" ? "↻ Pedir para refazer" : "✕ Reprovar"}
            </button>
            <button className="painel-botao secundario" disabled={enviando} onClick={() => { setModo(null); setMotivo(""); }}>Voltar</button>
          </div>
        </div>
      ) : (
        <div className="painel-acoes">
          <button className="painel-botao" disabled={enviando} onClick={() => executar(() => acoes.aoRevisar(alvo.tipo, alvo.id, "aprovar"))}>
            ✓ Aprovar
          </button>
          <button className="painel-botao secundario" disabled={enviando} onClick={() => setModo("refazer")}>↻ Refazer</button>
          <button className="painel-botao secundario perigo-texto" disabled={enviando} onClick={() => setModo("reprovar")}>✕ Reprovar</button>
          {analisar}
        </div>
      )}
      {erro && <p className="painel-erro">{erro}</p>}
    </footer>
  );
}
