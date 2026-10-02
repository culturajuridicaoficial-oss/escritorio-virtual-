"use client";

import { useState } from "react";
import { CampoComAudio } from "./Audio";
import { Janela } from "./Janela";
import {
  AGENTES_ANALISTAS,
  Codigo,
  Status,
  dataHora,
  type AcaoDoPlano,
  type Analise,
  type Dados,
  type OrdemDeMudanca,
  type RelatorioMeta,
  type RelatorioOferta,
} from "./tipos";

// Aba Análises: Veredito (oferta e copy) e Lupa (métricas do Meta Ads). Cada relatório
// vira trabalho para o time: ordem de mudança -> refação da peça ou pedido novo.

type Agente = Analise["agente"];

export type PedidoDeAnalise = {
  agente: Agente;
  funilId: string | null;
  alvo: { pagina_url?: string | null; ofertas: string[]; criativos: string[]; links: string[]; texto: string };
  contexto: Record<string, string>;
  arquivos: File[];
  instrucoes: string;
};

/** Pré-seleção ao abrir o formulário (ex.: "Analisar com o Veredito" num cartão do quadro). */
export type InicioDaAnalise = { agente: Agente; funilId: string | null; ofertas?: string[]; criativos?: string[] };

export type AcoesDasAnalises = {
  aoAbrirFormulario: (inicio: InicioDaAnalise) => void;
  aoRefazer: (tipo: "oferta" | "criativo", id: string, motivo: string) => Promise<void>;
  aoVirarPedido: (funilId: string | null, texto: string) => void;
  aoRepetir: (id: string) => Promise<void>;
};

const TIPO_PECA: Record<string, string> = { pagina: "Página", estatico: "Estático", video: "Vídeo", oferta: "Oferta" };
const PRONTO: Record<string, string> = { sim: "Sim", com_ajustes: "Sim, com ajustes", nao: "Não" };
const TIPO_ACAO: Record<string, string> = { fazer_agora: "Fazer agora", testar: "Testar", monitorar: "Monitorar" };
const RESPONSAVEL: Record<string, string> = {
  agente_copywriter: "Agente Copywriter",
  agente_designer: "Agente Designer",
  agente_trafego: "Agente de Tráfego",
  agente_produto: "Agente de Produto",
  agente_atendimento: "Agente de Atendimento",
  humano_douglas: "Humano (Douglas)",
};

// ------------------------------------------------------------------ lista

export function AbaAnalises({ dados, acoes }: { dados: Dados; acoes: AcoesDasAnalises }) {
  const [aberta, setAberta] = useState<string | null>(null);
  const analise = dados.analises.find((a) => a.id === aberta) ?? null;
  const funilDe = (a: Analise) => dados.funis.find((f) => f.id === a.funil_id);
  const funilPadrao = dados.funis[0]?.id ?? null;

  return (
    <section className="analises">
      <div className="analises-agentes">
        {(Object.keys(AGENTES_ANALISTAS) as Agente[]).map((agente) => {
          const info = AGENTES_ANALISTAS[agente];
          return (
            <button key={agente} className="analises-agente" onClick={() => acoes.aoAbrirFormulario({ agente, funilId: agente === "analista-meta" ? null : funilPadrao })}>
              <span className="analises-icone" aria-hidden>{info.icone}</span>
              <span>
                <strong>Pedir análise {info.ao}</strong>
                <small>
                  {agente === "analista-ofertas"
                    ? "Audita produto, oferta e copy (página, anúncios, roteiros) e entrega ordens de mudança."
                    : "Lê as métricas do Meta Ads (prints, planilha ou números) e diz o que escalar, pausar ou testar."}
                </small>
              </span>
            </button>
          );
        })}
      </div>

      {dados.analises.length === 0 ? (
        <p className="painel-suave">Nenhuma análise ainda.</p>
      ) : (
        <ol className="analises-lista">
          {dados.analises.map((a) => {
            const info = AGENTES_ANALISTAS[a.agente];
            const funil = funilDe(a);
            const rel = a.relatorio;
            return (
              <li key={a.id} className="analises-linha">
                <button className="analises-item" onClick={() => setAberta(a.id)} disabled={a.status !== "pronta"}>
                  <span className="analises-item-topo">
                    <span>{info.icone} {info.nome}</span>
                    {a.codigo ? <Codigo codigo={a.codigo} /> : <small className="painel-suave">{funil?.codigo ?? "Conta toda"}</small>}
                    <Status status={a.status} />
                  </span>
                  <strong>
                    {a.status === "analisando"
                      ? `${info.nome} está analisando…`
                      : a.status === "erro"
                        ? `⚠ ${a.erro}`
                        : rel && "veredito" in rel
                          ? rel.veredito.diagnostico
                          : (rel as RelatorioMeta | null)?.resumo_executivo}
                  </strong>
                  <span className="analises-item-rodape">
                    {a.nota_geral !== null && <span className="analises-nota">{Number(a.nota_geral).toFixed(1)}/10</span>}
                    {rel && "veredito" in rel && <span>Pronto para tráfego: {PRONTO[rel.veredito.pronto_para_trafego]}</span>}
                    {rel && "status_da_meta" in rel && <span>Meta: {rel.status_da_meta === "dentro" ? "dentro ✅" : rel.status_da_meta === "fora" ? "fora ⚠" : "sem meta definida"}</span>}
                    <span>{resumoDoAlvo(a, dados)}</span>
                    <time>{dataHora(a.created_at)} · {a.autor}</time>
                  </span>
                </button>
                {a.status === "erro" && <BotaoRepetir aoRepetir={() => acoes.aoRepetir(a.id)} />}
              </li>
            );
          })}
        </ol>
      )}

      {analise && analise.relatorio && (
        <JanelaDoRelatorio analise={analise} dados={dados} acoes={acoes} aoFechar={() => setAberta(null)} />
      )}
    </section>
  );
}

function BotaoRepetir({ aoRepetir }: { aoRepetir: () => Promise<void> }) {
  const [enviando, setEnviando] = useState(false);
  return (
    <button className="painel-botao secundario analises-repetir" disabled={enviando} onClick={async () => {
      setEnviando(true);
      try {
        await aoRepetir();
      } finally {
        setEnviando(false);
      }
    }}>
      {enviando ? "Enviando…" : "↻ Tentar de novo"}
    </button>
  );
}

function resumoDoAlvo(a: Analise, dados: Dados) {
  const pecas = (a.alvo.ofertas?.length ?? 0) + (a.alvo.criativos?.length ?? 0);
  const partes = [
    a.alvo.pagina_url && "página de vendas",
    pecas > 0 && `${pecas} peça${pecas > 1 ? "s" : ""}`,
    (a.alvo.links?.length ?? 0) > 0 && `${a.alvo.links!.length} link(s)`,
    a.arquivos.length > 0 && `${a.arquivos.length} arquivo(s)`,
    a.alvo.texto?.trim() && "texto colado",
  ].filter(Boolean);
  if (a.agente === "analista-ofertas" && partes.length === 0) partes.push("produto e oferta do briefing");
  const funil = dados.funis.find((f) => f.id === a.funil_id);
  return [funil?.nome, partes.join(", ")].filter(Boolean).join(" · ");
}

// ------------------------------------------------------------------ relatórios


function JanelaDoRelatorio({ analise, dados, acoes, aoFechar }: { analise: Analise; dados: Dados; acoes: AcoesDasAnalises; aoFechar: () => void }) {
  const info = AGENTES_ANALISTAS[analise.agente];
  const rel = analise.relatorio!;
  const anterior = dados.analises.find((a) => a.id === analise.anterior_id);
  return (
    <Janela
      aoFechar={aoFechar}
      subtitulo={<>{analise.codigo && <Codigo codigo={analise.codigo} copiavel />} {info.icone} {info.nome} · {dataHora(analise.created_at)}{anterior?.codigo ? ` · compara com ${anterior.codigo}` : ""}</>}
      titulo={rel.titulo}
    >
      <div className="relatorio">
        {"veredito" in rel ? (
          <RelatorioDoVeredito analise={analise} rel={rel} dados={dados} acoes={acoes} />
        ) : (
          <RelatorioDaLupa analise={analise} rel={rel as RelatorioMeta} acoes={acoes} />
        )}
      </div>
    </Janela>
  );
}

function Lista({ itens }: { itens: string[] }) {
  if (!itens?.length) return <p className="painel-suave">—</p>;
  return <ul>{itens.map((x, i) => <li key={i}>{x}</li>)}</ul>;
}

/** Ordem de mudança em texto, do jeito que o time recebe na refação ou no pedido. */
function textoDaOrdem(om: OrdemDeMudanca, codigo: string | null) {
  return [
    `${codigo ? `[${codigo} · ${om.id}]` : `[${om.id}]`} ${om.titulo}`,
    `Onde: ${om.peca} → ${om.secao} → ${om.local_exato}`,
    om.trecho_atual && `Trecho atual: "${om.trecho_atual}"`,
    `Problema: ${om.problema}`,
    `O que fazer: ${om.acao}`,
    om.exemplo && `Direção/exemplo: ${om.exemplo}`,
    `Critério de aceite: ${om.criterio_de_aceite}`,
  ].filter(Boolean).join("\n");
}

/** Bloco de handoff no formato combinado (para automação / ClickUp). */
function jsonDeHandoff(analise: Analise, rel: RelatorioOferta) {
  return JSON.stringify(
    {
      analise: rel.titulo,
      codigo: analise.codigo,
      data: analise.created_at.slice(0, 10),
      nota_geral: rel.veredito.nota_geral,
      notas: { produto: rel.veredito.nota_produto, oferta: rel.veredito.nota_oferta, copy: rel.veredito.nota_copy },
      pronto_para_trafego: rel.veredito.pronto_para_trafego,
      ordens_de_mudanca: rel.ordens.map((om) => ({
        id: om.id,
        titulo: om.titulo,
        prioridade: om.prioridade,
        esforco: om.esforco,
        peca: om.peca,
        secao: om.secao,
        local_exato: om.local_exato,
        trecho_atual: om.trecho_atual,
        problema: om.problema,
        acao: om.acao,
        criterio_de_aceite: om.criterio_de_aceite,
        responsavel: om.responsavel,
        depende_de: om.depende_de,
      })),
    },
    null,
    2,
  );
}

function RelatorioDoVeredito({ analise, rel, dados, acoes }: { analise: Analise; rel: RelatorioOferta; dados: Dados; acoes: AcoesDasAnalises }) {
  const v = rel.veredito;
  const camadas: Array<[string, string]> = [["produto", "Mercado e produto"], ["oferta", "Oferta"], ["copy", "Copy"], ["risco", "Risco e conformidade"]];
  return (
    <>
      <section className="relatorio-bloco">
        <h3>0 · Lacunas e premissas</h3>
        <Lista itens={rel.lacunas} />
        {rel.secoes_puladas?.length > 0 && <p className="painel-suave">Seções puladas: {rel.secoes_puladas.join(", ")}</p>}
      </section>

      <section className="relatorio-bloco relatorio-veredito">
        <h3>1 · Veredito executivo</h3>
        <div className="relatorio-notas">
          <span className="relatorio-nota-geral">{v.nota_geral.toFixed(1)}<small>/10</small></span>
          <span>Produto <strong>{v.nota_produto.toFixed(1)}</strong></span>
          <span>Oferta <strong>{v.nota_oferta.toFixed(1)}</strong></span>
          <span>Copy <strong>{v.nota_copy.toFixed(1)}</strong></span>
          <span className={`relatorio-pronto p-${v.pronto_para_trafego}`}>Pronto para tráfego? {PRONTO[v.pronto_para_trafego]}</span>
        </div>
        <p className="relatorio-diagnostico">{v.diagnostico}</p>
        <h4>As 3 mudanças que mais vão mexer no resultado</h4>
        <ol>{v.tres_mudancas.map((m, i) => <li key={i}>{m}</li>)}</ol>
      </section>

      {rel.comparacao && (
        <section className="relatorio-bloco">
          <h3>Comparação com a análise anterior</h3>
          <div className="relatorio-colunas">
            <div><h4>✅ Corrigido</h4><Lista itens={rel.comparacao.corrigido} /></div>
            <div><h4>⚠ Piorou</h4><Lista itens={rel.comparacao.piorou} /></div>
            <div><h4>⏳ Pendente</h4><Lista itens={rel.comparacao.pendente} /></div>
          </div>
        </section>
      )}

      <section className="relatorio-bloco">
        <h3>2 · Scorecard</h3>
        <div className="relatorio-tabela-rolagem">
          <table className="relatorio-tabela">
            <thead><tr><th>Camada</th><th>Critério</th><th>Nota</th><th>Justificativa</th></tr></thead>
            <tbody>
              {camadas.flatMap(([id, nome]) =>
                rel.scorecard.filter((s) => s.camada === id).map((s, i) => (
                  <tr key={`${id}-${i}`}>
                    <td>{i === 0 ? nome : ""}</td>
                    <td>{s.criterio}</td>
                    <td className={`relatorio-n ${s.nota === null ? "" : s.nota >= 7 ? "bom" : s.nota >= 5 ? "medio" : "ruim"}`}>{s.nota === null ? "—" : s.nota.toFixed(1)}</td>
                    <td>{s.justificativa}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="relatorio-bloco">
        <h3>3 · ✅ Pontos fortes (proteger nas próximas versões)</h3>
        <ul>{rel.pontos_fortes.map((p, i) => <li key={i}><strong>{p.o_que}</strong> <span className="painel-suave">({p.onde})</span> · {p.por_que}</li>)}</ul>
      </section>

      <section className="relatorio-bloco">
        <h3>4 · ❌ Pontos negativos</h3>
        <ul>{rel.pontos_negativos.map((p, i) => <li key={i}><strong>{p.o_que}</strong> <span className="painel-suave">({p.onde})</span> · {p.impacto}</li>)}</ul>
      </section>

      <section className="relatorio-bloco">
        <h3>5 · 🛠️ Ordens de mudança</h3>
        <div className="relatorio-ordens">
          {rel.ordens.map((om) => <CartaoDaOrdem key={om.id} om={om} analise={analise} dados={dados} acoes={acoes} />)}
        </div>
      </section>

      <section className="relatorio-bloco">
        <h3>6 · 🧪 Hipóteses de teste A/B</h3>
        {rel.testes_ab.length ? (
          <ol>
            {rel.testes_ab.map((t, i) => (
              <li key={i}><strong>{t.hipotese}</strong><br />A: {t.variante_a}<br />B: {t.variante_b}<br /><small className="painel-suave">Métrica de sucesso: {t.metrica}</small></li>
            ))}
          </ol>
        ) : <p className="painel-suave">—</p>}
      </section>

      <details className="relatorio-bloco">
        <summary><h3>7 · 📦 Bloco de handoff (JSON)</h3></summary>
        <BotaoCopiar texto={jsonDeHandoff(analise, rel)} rotulo="Copiar JSON" />
        <pre className="relatorio-json">{jsonDeHandoff(analise, rel)}</pre>
      </details>
    </>
  );
}

function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button type="button" className="painel-botao secundario" onClick={() => {
      void navigator.clipboard?.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    }}>
      {copiado ? "✓ Copiado" : rotulo}
    </button>
  );
}

function CartaoDaOrdem({ om, analise, dados, acoes }: { om: OrdemDeMudanca; analise: Analise; dados: Dados; acoes: AcoesDasAnalises }) {
  const [estado, setEstado] = useState<"livre" | "enviando" | "enviado">("livre");
  const [erro, setErro] = useState<string | null>(null);
  // A ordem aponta para uma peça do quadro pelo código: dá para mandar refazer direto.
  const oferta = dados.ofertas.find((o) => o.codigo === om.peca);
  const criativo = dados.ofertas.flatMap((o) => o.criativos).find((c) => c.codigo === om.peca);
  const peca = criativo ? { tipo: "criativo" as const, id: criativo.id, status: criativo.status } : oferta ? { tipo: "oferta" as const, id: oferta.id, status: oferta.status } : null;
  const podeRefazer = peca?.status === "aguardando_aprovacao";
  const texto = textoDaOrdem(om, analise.codigo);

  return (
    <article className={`relatorio-ordem prioridade-${om.prioridade}`}>
      <header>
        <span className="relatorio-om-id">{om.id}</span>
        <strong>{om.titulo}</strong>
        <span className={`relatorio-prioridade ${om.prioridade}`}>{om.prioridade}</span>
        <small className="painel-suave">Esforço {om.esforco === "medio" ? "médio" : om.esforco}</small>
      </header>
      <dl>
        <div><dt>Onde</dt><dd>{om.peca} → {om.secao} → {om.local_exato}</dd></div>
        {om.trecho_atual && <div><dt>Trecho atual</dt><dd>“{om.trecho_atual}”</dd></div>}
        <div><dt>Problema</dt><dd>{om.problema}</dd></div>
        <div><dt>Por que importa</dt><dd>{om.por_que_importa}</dd></div>
        <div><dt>O que fazer</dt><dd>{om.acao}</dd></div>
        {om.exemplo && <div><dt>Direção/exemplo</dt><dd>{om.exemplo}</dd></div>}
        <div><dt>Critério de aceite</dt><dd>{om.criterio_de_aceite}</dd></div>
        <div><dt>Responsável</dt><dd>{RESPONSAVEL[om.responsavel] ?? om.responsavel}</dd></div>
        {om.depende_de?.length > 0 && <div><dt>Depende de</dt><dd>{om.depende_de.join(", ")}</dd></div>}
      </dl>
      <footer className="painel-acoes">
        {estado === "enviado" ? (
          <span className="painel-suave">✓ Enviado ao time</span>
        ) : podeRefazer ? (
          <button className="painel-botao" disabled={estado === "enviando"} onClick={async () => {
            setEstado("enviando");
            setErro(null);
            try {
              await acoes.aoRefazer(peca!.tipo, peca!.id, texto);
              setEstado("enviado");
            } catch (e) {
              setErro((e as Error).message);
              setEstado("livre");
            }
          }}>
            {estado === "enviando" ? "Enviando…" : `↻ Mandar refazer ${om.peca}`}
          </button>
        ) : (
          <button className="painel-botao secundario" onClick={() => acoes.aoVirarPedido(analise.funil_id, texto)}>+ Virar pedido ao time</button>
        )}
        <BotaoCopiar texto={texto} rotulo="Copiar ordem" />
        {erro && <span className="painel-erro">{erro}</span>}
      </footer>
    </article>
  );
}

function RelatorioDaLupa({ analise, rel, acoes }: { analise: Analise; rel: RelatorioMeta; acoes: AcoesDasAnalises }) {
  const STATUS: Record<string, string> = { dentro: "✅ dentro", fora: "⚠ fora", atencao: "👀 atenção", sem_meta: "—" };
  const textoDaAcao = (p: AcaoDoPlano) =>
    `${analise.codigo ? `[${analise.codigo}] ` : ""}${p.acao}\nOnde: ${p.onde}\nPor quê: ${p.por_que}\nResultado esperado: ${p.resultado_esperado}`;
  return (
    <>
      <section className="relatorio-bloco relatorio-veredito">
        <h3>1 · Resumo executivo</h3>
        <p className="painel-suave">{rel.periodo}</p>
        <p className="relatorio-diagnostico">{rel.resumo_executivo}</p>
        {rel.premissas.length > 0 && (<><h4>Premissas assumidas</h4><Lista itens={rel.premissas} /></>)}
      </section>

      <section className="relatorio-bloco">
        <h3>2 · Números-chave</h3>
        <div className="relatorio-tabela-rolagem">
          <table className="relatorio-tabela">
            <thead><tr><th>Métrica</th><th>Atual</th><th>Anterior</th><th>Variação</th><th>Meta</th></tr></thead>
            <tbody>
              {rel.numeros_chave.map((n, i) => (
                <tr key={i}>
                  <td>{n.metrica}</td><td><strong>{n.atual}</strong></td><td>{n.anterior || "—"}</td><td>{n.variacao || "—"}</td>
                  <td className={`relatorio-status ${n.status}`}>{STATUS[n.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="relatorio-bloco">
        <h3>3 · Diagnóstico</h3>
        <ul>{rel.diagnostico.map((d, i) => <li key={i}>{d.afirmacao} <span className="relatorio-numero">{d.numero}</span></li>)}</ul>
      </section>

      <section className="relatorio-bloco">
        <h3>4 · Destaques por nível</h3>
        <div className="relatorio-colunas">
          <div>
            <h4>Melhores</h4>
            <ul>{rel.destaques.melhores.map((d, i) => <li key={i}><strong>{d.nome}</strong> <small className="painel-suave">({d.nivel})</small> · {d.motivo}</li>)}</ul>
          </div>
          <div>
            <h4>Piores</h4>
            <ul>{rel.destaques.piores.map((d, i) => <li key={i}><strong>{d.nome}</strong> <small className="painel-suave">({d.nivel})</small> · {d.motivo}</li>)}</ul>
          </div>
        </div>
        <div className="relatorio-colunas">
          <div><h4>Com dados suficientes</h4><Lista itens={rel.destaques.com_dados_suficientes} /></div>
          <div>
            <h4>Ainda sem dados suficientes</h4>
            {rel.destaques.sem_dados_suficientes.length
              ? <ul>{rel.destaques.sem_dados_suficientes.map((d, i) => <li key={i}><strong>{d.nome}</strong> · falta {d.falta}</li>)}</ul>
              : <p className="painel-suave">—</p>}
          </div>
        </div>
      </section>

      <section className="relatorio-bloco">
        <h3>5 · Plano de ação priorizado</h3>
        <ol className="relatorio-plano">
          {rel.plano.map((p, i) => (
            <li key={i}>
              <span className={`relatorio-tipo ${p.tipo}`}>{TIPO_ACAO[p.tipo]}</span>
              <strong>{p.acao}</strong>
              <span><em>Onde:</em> {p.onde}</span>
              <span><em>Por quê:</em> {p.por_que}</span>
              <span><em>Resultado esperado:</em> {p.resultado_esperado}</span>
              {p.pede_criativo && (
                <button className="painel-botao secundario" onClick={() => acoes.aoVirarPedido(analise.funil_id, textoDaAcao(p))}>
                  + Pedir criativos ao time
                </button>
              )}
            </li>
          ))}
        </ol>
        <p className="painel-suave">A Lupa só recomenda: nenhuma alteração é feita na conta do Meta.</p>
      </section>

      <section className="relatorio-bloco">
        <h3>6 · Alertas e dados faltantes</h3>
        <Lista itens={rel.alertas} />
        {rel.dados_faltantes.length > 0 && (
          <ul>{rel.dados_faltantes.map((d, i) => <li key={i}><strong>{d.metrica}</strong> · {d.o_que_mudaria}</li>)}</ul>
        )}
      </section>
    </>
  );
}

// ------------------------------------------------------------------ formulários

const LIMITE_IMAGEM = 5 * 1024 * 1024;
const LIMITE_ARQUIVO = 10 * 1024 * 1024;

export function FormularioDeAnalise({
  dados,
  inicio,
  enviando,
  aoEnviar,
}: {
  dados: Dados;
  inicio: InicioDaAnalise;
  enviando: boolean;
  aoEnviar: (p: PedidoDeAnalise) => void;
}) {
  const meta = inicio.agente === "analista-meta";
  const [funilId, setFunilId] = useState<string>(inicio.funilId ?? (meta ? "" : dados.funis[0]?.id ?? ""));
  const funil = dados.funis.find((f) => f.id === funilId) ?? null;
  const [usarPagina, setUsarPagina] = useState(!inicio.criativos?.length && !inicio.ofertas?.length);
  const [url, setUrl] = useState(funil?.pagina_vendas_url ?? "");
  const pecasDoFunil = dados.ofertas
    .filter((o) => o.funil_id === funilId)
    .flatMap((o) => [
      ...(o.codigo && o.status !== "rascunho" ? [{ id: o.id, tipo: "oferta" as const, codigo: o.codigo, titulo: o.titulo, status: o.status }] : []),
      ...o.criativos
        .filter((c) => c.codigo && c.status !== "em_producao" && c.status !== "erro")
        .map((c) => ({
          id: c.id,
          tipo: c.tipo,
          codigo: c.codigo!,
          titulo: String((c.copy as Record<string, unknown>).headline ?? (c.copy as Record<string, unknown>).angulo ?? ""),
          status: c.status,
        })),
    ]);
  const [marcadas, setMarcadas] = useState<Set<string>>(
    () => new Set([...(inicio.ofertas ?? []), ...(inicio.criativos ?? [])]),
  );
  const [links, setLinks] = useState("");
  const [texto, setTexto] = useState("");
  const [instrucoes, setInstrucoes] = useState("");
  const [contexto, setContexto] = useState({ objetivo: "", meta: "", ticket_margem: "", periodo_contexto: "" });
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const trocarFunil = (id: string) => {
    setFunilId(id);
    setMarcadas(new Set());
    setUrl(dados.funis.find((f) => f.id === id)?.pagina_vendas_url ?? "");
  };
  const alternar = (id: string) => setMarcadas((m) => {
    const n = new Set(m);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const adicionarArquivos = (lista: FileList | null) => {
    setErro(null);
    for (const f of [...(lista ?? [])]) {
      const imagem = f.type.startsWith("image/");
      const aceito = imagem || f.type === "application/pdf" || /\.(csv|xlsx)$/i.test(f.name);
      if (!aceito) return setErro(`${f.name}: envie prints (imagem), PDF, CSV ou XLSX.`);
      if (f.size > (imagem ? LIMITE_IMAGEM : LIMITE_ARQUIVO)) return setErro(`${f.name} passa de ${imagem ? "5" : "10"} MB.`);
    }
    setArquivos((a) => [...a, ...(lista ? [...lista] : [])].slice(0, 8));
  };

  const enviar = () => {
    setErro(null);
    const listaLinks = links.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!meta && !funilId) return setErro("Escolha o funil.");
    if (meta && !arquivos.length && !texto.trim()) {
      return setErro("Envie prints, a planilha exportada do Gerenciador ou cole os números.");
    }
    const ids = [...marcadas];
    aoEnviar({
      agente: inicio.agente,
      funilId: funilId || null,
      alvo: {
        pagina_url: !meta && usarPagina && url.trim() ? url.trim() : null,
        ofertas: ids.filter((id) => dados.ofertas.some((o) => o.id === id)),
        criativos: ids.filter((id) => !dados.ofertas.some((o) => o.id === id)),
        links: listaLinks,
        texto,
      },
      contexto: meta ? contexto : {},
      arquivos,
      instrucoes,
    });
  };

  return (
    <form className="painel-pedido analise-form" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
      <label className="painel-campo">
        <span>{meta ? "Funil (opcional)" : "Qual funil?"}</span>
        <select value={funilId} onChange={(e) => trocarFunil(e.target.value)}>
          {meta && <option value="">Conta toda (todos os funis)</option>}
          {dados.funis.map((f) => <option key={f.id} value={f.id}>{f.codigo} · {f.nome}</option>)}
        </select>
        {meta && <small className="painel-ajuda">Dica: com o código do funil no nome das campanhas (ex.: {funil?.codigo ?? "DPL-WKS-01"} | Conversão | Frio), a Lupa separa os números de cada funil.</small>}
      </label>

      {!meta ? (
        <>
          <fieldset className="briefing-bloco">
            <legend>O que o Veredito vai analisar</legend>
            <p className="painel-ajuda">O produto e a oferta do briefing entram sempre. Marque o que mais quer auditar.</p>
            <label className="painel-opcao">
              <input type="checkbox" checked={usarPagina} onChange={(e) => setUsarPagina(e.target.checked)} />
              <span><strong>Página de vendas publicada</strong><small>O Veredito abre e lê a página.</small></span>
            </label>
            {usarPagina && <input type="url" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />}
            <div className="painel-campo">
              <span>Peças do quadro deste funil</span>
              {pecasDoFunil.length === 0 ? (
                <small className="painel-suave">Nenhuma peça pronta neste funil ainda.</small>
              ) : (
                <div className="analise-pecas">
                  {pecasDoFunil.map((p) => (
                    <label key={p.id} className={`analise-peca ${marcadas.has(p.id) ? "ativa" : ""}`}>
                      <input type="checkbox" checked={marcadas.has(p.id)} onChange={() => alternar(p.id)} />
                      <Codigo codigo={p.codigo} />
                      <span>{TIPO_PECA[p.tipo]} · {p.titulo}</span>
                      <Status status={p.status} />
                    </label>
                  ))}
                </div>
              )}
            </div>
            <label className="painel-campo">
              <span>Outros links <small>(checkout, VSL, página de obrigado; um por linha)</small></span>
              <textarea rows={2} value={links} placeholder="https://..." onChange={(e) => setLinks(e.target.value)} />
            </label>
            <CampoComAudio rotulo="Texto colado" dica="(e-mail, roteiro, mensagem de WhatsApp, copy de anúncio)" linhas={4} valor={texto} aoMudar={setTexto} separador={"\n"} />
          </fieldset>
        </>
      ) : (
        <>
          <fieldset className="briefing-bloco">
            <legend>Contexto (muda a análise)</legend>
            <CampoComAudio rotulo="Objetivo e evento otimizado" placeholder="Ex.: Vendas, otimizando para Compra" linhas={2}
              valor={contexto.objetivo} aoMudar={(v) => setContexto({ ...contexto, objetivo: v })} />
            <CampoComAudio rotulo="Meta de negócio" placeholder="Ex.: CPA máximo de R$ 60, ou ROAS mínimo de 2" linhas={2}
              valor={contexto.meta} aoMudar={(v) => setContexto({ ...contexto, meta: v })} />
            <CampoComAudio rotulo="Ticket e margem" dica="(se não houver meta, a Lupa calcula o teto)" placeholder="Ex.: ticket de R$ 197, margem de 70%" linhas={2}
              valor={contexto.ticket_margem} aoMudar={(v) => setContexto({ ...contexto, ticket_margem: v })} />
            <CampoComAudio rotulo="Período e contexto" placeholder="Ex.: últimos 7 dias vs 7 anteriores; perpétuo; trocamos a página no dia 20" linhas={2}
              valor={contexto.periodo_contexto} aoMudar={(v) => setContexto({ ...contexto, periodo_contexto: v })} />
          </fieldset>
          <fieldset className="briefing-bloco">
            <legend>Dados</legend>
            <p className="painel-ajuda">
              Melhor: exporte do Gerenciador em CSV ou XLSX, no nível de anúncio, com a coluna Dia. Colunas ideais: valor gasto, impressões, alcance,
              frequência, cliques no link, visualizações da página de destino, reproduções de 3s, ThruPlays, resultados e valor de conversão.
              A Lupa calcula as métricas por código.
            </p>
            <label className="painel-anexar">
              <input type="file" multiple accept="image/*,application/pdf,.csv,.xlsx" onChange={(e) => { adicionarArquivos(e.target.files); e.target.value = ""; }} />
              <span>📎 Anexar prints, CSV, XLSX ou PDF</span>
            </label>
            {arquivos.length > 0 && (
              <ul className="painel-anexos">
                {arquivos.map((f, i) => (
                  <li key={i}>{f.name} <button type="button" className="painel-link" onClick={() => setArquivos(arquivos.filter((_, j) => j !== i))}>remover</button></li>
                ))}
              </ul>
            )}
            <CampoComAudio rotulo="Ou cole os números" linhas={4} valor={texto} aoMudar={setTexto} separador={"\n"}
              placeholder="Ex.: Campanha X: gasto R$ 1.200, 40 compras, CTR 1,1%, CPM R$ 32..." />
          </fieldset>
        </>
      )}

      <CampoComAudio rotulo="Algo específico?" dica="(opcional)" linhas={2} valor={instrucoes} aoMudar={setInstrucoes}
        placeholder={meta ? "Ex.: o CPA subiu desde terça, quero saber por quê" : "Ex.: foque na headline e na oferta; vamos subir tráfego frio"} />

      <div className="painel-acoes">
        <button className="painel-botao" disabled={enviando}>
          {enviando ? "Enviando…" : `Pedir análise ${AGENTES_ANALISTAS[inicio.agente].ao}`}
        </button>
        {erro && <span className="painel-erro">{erro}</span>}
      </div>
    </form>
  );
}
