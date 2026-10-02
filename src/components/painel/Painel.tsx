"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { supabaseNavegador } from "@/lib/supabase";
import { Marca } from "../escritorio/Marca";
import { AbaBriefing, type NovoFunil } from "./Briefing";
import { FormularioDePedido, HistoricoDePedidos, type NovoPedido } from "./Pedido";
import { Quadro } from "./Quadro";
import { Janela } from "./Janela";
import { AbaAnalises, FormularioDeAnalise, type InicioDaAnalise, type PedidoDeAnalise } from "./Analises";
import type { Dados } from "./tipos";

// Painel do projeto: quadro Kanban com tudo que o time está fazendo, pedidos ao time
// (com áudio e referências) e o briefing do produto.

const DESTINO_DO_LOGIN = "cj-painel-destino";
type Aba = "quadro" | "pedidos" | "briefing" | "analises";

export function Painel({ slug }: { slug: string }) {
  const db = supabaseNavegador();
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregandoSessao, setCarregandoSessao] = useState(true);
  const [acesso, setAcesso] = useState<{ email?: string; admin?: boolean; erro?: string } | null>(null);
  const [dados, setDados] = useState<Dados | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [produzindo, setProduzindo] = useState<Set<string>>(new Set());
  const [aba, setAba] = useState<Aba>("quadro");
  const [novoPedido, setNovoPedido] = useState<{ funilId: string | null; texto: string } | null>(null);
  const [formAnalise, setFormAnalise] = useState<InicioDaAnalise | null>(null);
  const [funilId, setFunilId] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return setCarregandoSessao(false);
    db.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      setCarregandoSessao(false);
    });
    const { data } = db.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, [db]);

  const api = useCallback(
    async (caminho: string, init?: RequestInit) => {
      const resposta = await fetch(caminho, {
        ...init,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessao?.access_token}` },
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(corpo.erro ?? `Erro ${resposta.status}`);
      return corpo;
    },
    [sessao],
  );

  useEffect(() => {
    if (!sessao) return;
    api("/api/painel/eu")
      .then((r) => setAcesso({ email: r.email, admin: r.admin }))
      .catch((e) => setAcesso({ erro: e.message }));
  }, [sessao, api]);

  const recarregar = useCallback(async () => {
    const novos: Dados = await api(`/api/painel/dados?projeto=${encodeURIComponent(slug)}`);
    setDados(novos);
    // Sem funil escolhido, fica o mais recente.
    setFunilId((atual) => (atual && novos.funis.some((f) => f.id === atual) ? atual : novos.funis[0]?.id ?? null));
  }, [api, slug]);
  const temBriefing = !!dados?.funis.some((f) => f.briefing);

  useEffect(() => {
    if (acesso?.email) recarregar().catch((e) => setAviso(e.message));
  }, [acesso, recarregar]);

  // Enquanto houver coisa sendo escrita ou produzida, o quadro se atualiza sozinho.
  const temAndamento =
    !!dados &&
    (dados.pedidos.some((p) => p.status === "escrevendo") ||
      dados.ofertas.some((o) => o.criativos.some((c) => c.status === "em_producao")) ||
      dados.analises.some((a) => a.status === "analisando"));
  useEffect(() => {
    if (!temAndamento) return;
    const id = setInterval(() => recarregar().catch(() => {}), 15000);
    return () => clearInterval(id);
  }, [temAndamento, recarregar]);

  async function executar(rotulo: string, tarefa: () => Promise<void>) {
    setOcupado(rotulo);
    setAviso(null);
    try {
      await tarefa();
      return true;
    } catch (e) {
      setAviso((e as Error).message);
      return false;
    } finally {
      setOcupado(null);
    }
  }

  async function produzir(ids: string[]) {
    setProduzindo((s) => new Set([...s, ...ids]));
    await Promise.all(
      ids.map(async (id) => {
        try {
          await api("/api/painel/produzir", { method: "POST", body: JSON.stringify({ id }) });
        } catch (e) {
          setAviso((e as Error).message);
        } finally {
          setProduzindo((s) => {
            const n = new Set(s);
            n.delete(id);
            return n;
          });
          await recarregar();
        }
      }),
    );
  }

  async function revisar(tipo: "oferta" | "criativo", id: string, decisao: "aprovar" | "reprovar", motivo?: string) {
    await api("/api/painel/revisar", { method: "POST", body: JSON.stringify({ tipo, id, decisao, motivo }) });
    await recarregar();
  }

  async function refazer(tipo: "oferta" | "criativo", id: string, motivo: string) {
    const r = await api("/api/painel/refazer", { method: "POST", body: JSON.stringify({ tipo, id, motivo }) });
    await recarregar();
    if (r.pendentes?.length) void produzir(r.pendentes);
  }

  /** Envia os anexos direto ao armazenamento (URL assinada), sem passar pelo servidor. */
  async function enviarArquivos(arquivos: File[]) {
    const referencias = [];
    for (const arquivo of arquivos) {
      const { caminho, token } = await api("/api/painel/referencias", {
        method: "POST",
        body: JSON.stringify({ projeto: slug, nome: arquivo.name }),
      });
      // Alguns sistemas não informam o tipo do CSV/XLSX: deduz pela extensão.
      const tipo =
        arquivo.type ||
        (/\.csv$/i.test(arquivo.name) ? "text/csv" : /\.xlsx$/i.test(arquivo.name) ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "");
      const { error } = await db!.storage.from("referencias").uploadToSignedUrl(caminho, token, arquivo, { contentType: tipo });
      if (error) throw new Error(`Não foi possível enviar ${arquivo.name}: ${error.message}`);
      referencias.push({ nome: arquivo.name, tipo, caminho });
    }
    return referencias;
  }

  async function pedirAnalise(p: PedidoDeAnalise) {
    const arquivos = await enviarArquivos(p.arquivos);
    await api("/api/painel/analise", {
      method: "POST",
      body: JSON.stringify({ projeto: slug, agente: p.agente, funil: p.funilId, alvo: p.alvo, contexto: p.contexto, arquivos, instrucoes: p.instrucoes }),
    });
    setFormAnalise(null);
    setAba("analises");
    await recarregar();
  }

  /** Registra o pedido (com os anexos já enviados). */
  async function enviarPedido(pedido: NovoPedido) {
    const referencias = await enviarArquivos(pedido.arquivos);
    // O pedido aparece na coluna "Na fila" enquanto o time de copy escreve.
    const envio = api("/api/painel/pedido", {
      method: "POST",
      body: JSON.stringify({ projeto: slug, funil: pedido.funilId, texto: pedido.texto, entregas: pedido.entregas, links: pedido.links, referencias }),
    });
    setNovoPedido(null);
    setAba("quadro");
    setTimeout(() => recarregar().catch(() => {}), 1500);
    const r = await envio;
    await recarregar();
    await produzir(r.pendentes);
  }

  /**
   * Cria o funil e, em seguida, pede o briefing (lendo a página ou pelo questionário).
   * O formulário fecha assim que o funil existe: se o briefing falhar, tenta-se de novo
   * dentro do próprio funil, sem criar um código duplicado.
   */
  async function criarFunil(funil: { nome: string; sigla: string; url?: string }, briefing: Record<string, unknown> | null) {
    let id: string | null = null;
    const criou = await executar("funil", async () => {
      const novo = await api("/api/painel/funil", { method: "POST", body: JSON.stringify({ projeto: slug, ...funil }) });
      id = novo.id;
      setFunilId(novo.id);
      await recarregar();
    });
    if (criou && id && briefing) {
      void executar("briefing", async () => {
        await api("/api/painel/briefing", { method: "POST", body: JSON.stringify({ projeto: slug, funil: id, ...briefing }) });
        await recarregar();
      });
    }
    return criou;
  }

  // ------------------------------------------------------------------ telas

  const nome = dados?.projeto.nome ?? "";
  const moldura = (conteudo: React.ReactNode, direita?: React.ReactNode) => (
    <Moldura slug={slug} nome={nome} direita={direita}>{conteudo}</Moldura>
  );

  if (!db) return moldura(<p className="painel-aviso">O painel precisa do Supabase configurado.</p>);
  if (carregandoSessao) return moldura(<p className="painel-aviso">Carregando…</p>);
  if (!sessao) return moldura(<Login />);
  if (!acesso) return moldura(<p className="painel-aviso">Conferindo seu acesso…</p>);
  if (acesso.erro)
    return moldura(
      <>
        <p className="painel-aviso">{acesso.erro}</p>
        <button className="painel-botao secundario" onClick={() => db.auth.signOut()}>Sair</button>
      </>,
    );

  return moldura(
    <>
      <nav className="painel-barra" aria-label="Seções do painel">
        <div className="painel-abas" role="tablist">
          {([["quadro", "Quadro"], ["pedidos", "Pedidos"], ["analises", "Análises"], ["briefing", "Briefing"]] as Array<[Aba, string]>).map(([id, rotulo]) => (
            <button key={id} role="tab" aria-selected={aba === id} className={aba === id ? "ativa" : ""} onClick={() => setAba(id)}>
              {rotulo}
            </button>
          ))}
        </div>
        <button className="painel-botao" disabled={!temBriefing} onClick={() => setNovoPedido({ funilId, texto: "" })}
          title={temBriefing ? undefined : "Gere o briefing primeiro"}>
          + Novo pedido
        </button>
      </nav>

      {aviso && <p className="painel-erro" role="alert">{aviso}</p>}
      {ocupado === "pedido" && <p className="painel-aviso">⏳ O time está trabalhando no seu pedido. Acompanhe pelo quadro.</p>}

      {!dados ? (
        <p className="painel-aviso">Carregando projeto…</p>
      ) : aba === "quadro" ? (
        <>
          {!temBriefing && (
            <p className="painel-aviso">
              Comece pela aba <button className="painel-link" onClick={() => setAba("briefing")}>Briefing</button>: o time precisa dele para trabalhar.
            </p>
          )}
          <Quadro dados={dados} acoes={{
            produzindo,
            aoProduzir: produzir,
            aoRevisar: revisar,
            aoRefazer: refazer,
            aoAnalisar: (funilId, tipo, id) =>
              setFormAnalise({ agente: "analista-ofertas", funilId, [tipo === "oferta" ? "ofertas" : "criativos"]: [id] }),
          }} />
        </>
      ) : aba === "analises" ? (
        <AbaAnalises
          dados={dados}
          acoes={{
            aoAbrirFormulario: setFormAnalise,
            aoRefazer: refazer,
            aoVirarPedido: (id, texto) => setNovoPedido({ funilId: id ?? funilId, texto }),
            aoRepetir: async (id) => {
              try {
                await api("/api/painel/analise", { method: "POST", body: JSON.stringify({ projeto: slug, repetir: id }) });
              } catch (e) {
                setAviso((e as Error).message);
              }
              await recarregar();
            },
          }}
        />
      ) : aba === "pedidos" ? (
        <section className="painel-bloco">
          <h2>Seus pedidos</h2>
          <HistoricoDePedidos pedidos={dados.pedidos} funis={dados.funis} />
        </section>
      ) : (
        <AbaBriefing
          key={dados.projeto.slug}
          projeto={dados.projeto}
          funis={dados.funis}
          funilId={funilId}
          aoEscolher={setFunilId}
          ocupado={ocupado}
          aoCriar={(f: NovoFunil) =>
            criarFunil({ nome: f.nome, sigla: f.sigla, url: f.url }, f.url ? { url: f.url, gerar: true } : null)
          }
          aoCriarPeloQuestionario={(e) => criarFunil({ nome: e.nome, sigla: e.sigla }, { questionario: e.questionario })}
          aoResponder={(id, questionario) =>
            executar("briefing", async () => {
              await api("/api/painel/briefing", { method: "POST", body: JSON.stringify({ projeto: slug, funil: id, questionario }) });
              await recarregar();
            })
          }
          aoRenomear={(id, nome) =>
            executar("renomear", async () => {
              await api("/api/painel/funil", { method: "PATCH", body: JSON.stringify({ projeto: slug, funil: id, nome }) });
              await recarregar();
            })
          }
          aoGerar={(id, url) =>
            executar("briefing", async () => {
              await api("/api/painel/briefing", { method: "POST", body: JSON.stringify({ projeto: slug, funil: id, url, gerar: true }) });
              await recarregar();
            })
          }
          aoSalvar={(id, briefing) =>
            executar("salvar", async () => {
              await api("/api/painel/briefing", { method: "POST", body: JSON.stringify({ projeto: slug, funil: id, briefing }) });
              await recarregar();
            })
          }
        />
      )}

      {formAnalise && dados && (
        <Janela estreita aoFechar={() => setFormAnalise(null)}
          titulo={formAnalise.agente === "analista-meta" ? "📈 Análise de Meta Ads (Lupa)" : "⚖️ Análise de oferta e copy (Veredito)"}>
          <FormularioDeAnalise
            dados={dados}
            inicio={formAnalise}
            enviando={ocupado === "analise"}
            aoEnviar={(p) => executar("analise", () => pedirAnalise(p))}
          />
        </Janela>
      )}

      {novoPedido && dados && (
        <Janela estreita titulo="Novo pedido ao time" aoFechar={() => setNovoPedido(null)}>
          <FormularioDePedido
            funis={dados.funis}
            funilInicial={novoPedido.funilId}
            textoInicial={novoPedido.texto}
            liberado={temBriefing}
            enviando={ocupado === "pedido"}
            aoEnviar={(p) => executar("pedido", () => enviarPedido(p))}
          />
        </Janela>
      )}
    </>,
    <span className="painel-usuario">
      {acesso.admin && <Link href="/admin" className="painel-link">⚙ Admin</Link>}
      {acesso.email}
      <button className="painel-link" onClick={() => db.auth.signOut()}>Sair</button>
    </span>,
  );
}

// ------------------------------------------------------------------ peças

function Moldura({ children, direita, slug, nome }: { children: React.ReactNode; direita?: React.ReactNode; slug: string; nome: string }) {
  return (
    <main className="painel">
      <header className="topo">
        <div className="topo-esq">
          <Marca subtitulo={`Painel · ${nome || "Projeto"}`} />
          <Link href={`/escritorio/${slug}`} className="voltar">← Escritório</Link>
          <Link href="/" className="voltar">Recepção</Link>
        </div>
        <span />
        {direita ?? <span />}
      </header>
      {children}
    </main>
  );
}

export function Login() {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"livre" | "enviando" | "enviado">("livre");
  const [erro, setErro] = useState<string | null>(null);
  return (
    <form
      className="painel-login"
      onSubmit={async (e) => {
        e.preventDefault();
        setEstado("enviando");
        setErro(null);
        // O link do e-mail volta para /painel, que manda de volta para este painel de projeto.
        try {
          localStorage.setItem(DESTINO_DO_LOGIN, window.location.pathname);
        } catch {}
        const { error } = await supabaseNavegador()!.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/painel` },
        });
        if (error) {
          setErro(error.message);
          setEstado("livre");
        } else setEstado("enviado");
      }}
    >
      <h1>Entrar no painel</h1>
      {estado === "enviado" ? (
        <p>Enviamos um link de acesso para <strong>{email}</strong>. Abra o e-mail neste aparelho.</p>
      ) : (
        <>
          <label htmlFor="email">E-mail</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="painel-botao" disabled={estado === "enviando"}>
            {estado === "enviando" ? "Enviando…" : "Receber link de acesso"}
          </button>
          {erro && <p className="painel-erro">{erro}</p>}
        </>
      )}
    </form>
  );
}

/** Depois do link do e-mail: espera a sessão e volta para o painel do projeto. */
export function EntradaDoPainel() {
  const [mensagem, setMensagem] = useState("Entrando…");
  useEffect(() => {
    const db = supabaseNavegador();
    if (!db) return setMensagem("O painel precisa do Supabase configurado.");
    const irParaDestino = () => {
      let destino = "/";
      try {
        destino = localStorage.getItem(DESTINO_DO_LOGIN) || "/";
        localStorage.removeItem(DESTINO_DO_LOGIN);
      } catch {}
      window.location.replace(destino.startsWith("/") ? destino : "/");
    };
    db.auth.getSession().then(({ data }) => {
      if (data.session) irParaDestino();
      else setMensagem("Abra o painel pelo escritório do projeto (botão 📋 Painel do projeto).");
    });
    const { data } = db.auth.onAuthStateChange((_e, s) => s && irParaDestino());
    return () => data.subscription.unsubscribe();
  }, []);
  return (
    <main className="painel">
      <p className="painel-aviso">{mensagem}</p>
      <Link href="/" className="voltar">← Recepção</Link>
    </main>
  );
}
