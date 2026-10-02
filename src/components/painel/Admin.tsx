"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { supabaseNavegador } from "@/lib/supabase";
import { Marca } from "../escritorio/Marca";
import { Login } from "./Painel";
import { Codigo, reais, sugerirSigla } from "./tipos";

// Administração (só ADM): criar projeto novo. O banco monta o squad inteiro e o
// projeto aparece na recepção com escritório, salas e painel próprios.

type ProjetoAdmin = {
  id: string;
  slug: string;
  nome: string;
  sigla: string | null;
  meta_diaria: number | null;
  ativo: boolean;
  oculto: boolean;
  created_at: string;
  agentes: Array<{ count: number }>;
  funis: Array<{ count: number }>;
};

export function Admin() {
  const db = supabaseNavegador();
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [acesso, setAcesso] = useState<{ email?: string; admin?: boolean; erro?: string } | null>(null);
  const [projetos, setProjetos] = useState<ProjetoAdmin[] | null>(null);
  const [nome, setNome] = useState("");
  const [sigla, setSigla] = useState("");
  const [siglaManual, setSiglaManual] = useState(false);
  const [meta, setMeta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [criado, setCriado] = useState<{ slug: string; nome: string } | null>(null);
  const [consumo, setConsumo] = useState<Consumo | null>(null);
  const [alterando, setAlterando] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return setCarregando(false);
    db.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      setCarregando(false);
    });
    const { data } = db.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, [db]);

  const api = useCallback(
    async (caminho: string, init?: RequestInit) => {
      const r = await fetch(caminho, {
        ...init,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessao?.access_token}` },
      });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(corpo.erro ?? `Erro ${r.status}`);
      return corpo;
    },
    [sessao],
  );

  useEffect(() => {
    if (!sessao) return;
    api("/api/painel/eu").then(setAcesso).catch((e) => setAcesso({ erro: e.message }));
  }, [sessao, api]);

  const recarregar = useCallback(async () => {
    const [p, c] = await Promise.all([api("/api/admin/projetos"), api("/api/admin/consumo")]);
    setProjetos(p.projetos);
    setConsumo(c);
  }, [api]);
  useEffect(() => {
    if (acesso?.admin) recarregar().catch((e) => setErro(e.message));
  }, [acesso, recarregar]);

  const siglaFinal = siglaManual ? sigla : sugerirSigla(nome);
  const siglaEmUso = !!projetos?.some((p) => p.sigla === siglaFinal);

  const conteudo = (() => {
    if (!db) return <p className="painel-aviso">O painel precisa do Supabase configurado.</p>;
    if (carregando) return <p className="painel-aviso">Carregando…</p>;
    if (!sessao) return <Login />;
    if (!acesso) return <p className="painel-aviso">Conferindo seu acesso…</p>;
    if (acesso.erro) return <p className="painel-aviso">{acesso.erro}</p>;
    if (!acesso.admin) return <p className="painel-aviso">Esta área é só para administradores.</p>;
    return (
      <div className="admin">
        <form className="painel-bloco admin-novo" onSubmit={async (e) => {
          e.preventDefault();
          setEnviando(true);
          setErro(null);
          setCriado(null);
          try {
            const { projeto } = await api("/api/admin/projetos", {
              method: "POST",
              body: JSON.stringify({ nome, sigla: siglaFinal, meta: meta ? Number(meta.replace(/\./g, "").replace(",", ".")) : null }),
            });
            setCriado({ slug: projeto.slug, nome: projeto.nome });
            setNome("");
            setSigla("");
            setSiglaManual(false);
            setMeta("");
            await recarregar();
          } catch (e) {
            setErro((e as Error).message);
          } finally {
            setEnviando(false);
          }
        }}>
          <h2>Criar novo projeto</h2>
          <p className="painel-suave">
            Cria o escritório do projeto com o squad completo (copy, design, tráfego, BI, vídeo, programação, comercial, Veredito e Lupa),
            a porta na recepção, as salas de Marketing e Comercial e o painel de aprovação.
          </p>
          <label className="painel-campo">
            <span>Nome do projeto</span>
            <input required autoFocus value={nome} maxLength={60} placeholder="Ex.: Clínica Bem-Estar" onChange={(e) => setNome(e.target.value)} />
          </label>
          <label className="painel-campo">
            <span>Sigla do projeto <small>(2 a 5 letras; abre o código de todos os funis e peças)</small></span>
            <input className="funil-sigla" value={siglaFinal} maxLength={5}
              onChange={(e) => { setSiglaManual(true); setSigla(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); }} />
            {siglaEmUso && <small className="painel-erro">Essa sigla já é de outro projeto.</small>}
          </label>
          <label className="painel-campo">
            <span>Meta de vendas por dia <small>(opcional, em R$; o escritório comemora quando bate)</small></span>
            <input inputMode="decimal" value={meta} placeholder="Ex.: 2000" onChange={(e) => setMeta(e.target.value)} />
          </label>
          {siglaFinal && <div className="funil-previa"><span>Funis vão ficar assim</span><Codigo codigo={`${siglaFinal}-PRD-01`} /><small>Ex.: {siglaFinal}-PRD-01-EST-001</small></div>}
          <div className="painel-acoes">
            <button className="painel-botao" disabled={enviando || !nome.trim() || !/^[A-Z0-9]{2,5}$/.test(siglaFinal) || siglaEmUso}>
              {enviando ? "Montando o escritório…" : "Criar projeto"}
            </button>
            {erro && <span className="painel-erro">{erro}</span>}
          </div>
          {criado && (
            <p className="painel-aviso admin-criado">
              ✅ {criado.nome} está pronto. <Link href={`/escritorio/${criado.slug}`}>Entrar no escritório →</Link>{" "}
              <Link href={`/escritorio/${criado.slug}/painel`}>Abrir o painel →</Link>
            </p>
          )}
        </form>

        {projetos && consumo && <TabelaDeConsumo projetos={projetos} consumo={consumo} />}

        <section className="painel-bloco">
          <h2>Projetos</h2>
          <p className="painel-suave">
            Ocultar tira o escritório da recepção, do escritório geral e do endereço público. O painel, os agentes e as rotinas continuam funcionando.
          </p>
          {erro && <p className="painel-erro">{erro}</p>}
          {!projetos ? <p className="painel-suave">Carregando…</p> : (
            <ul className="admin-projetos">
              {projetos.map((p) => (
                <li key={p.id} className={p.oculto ? "admin-oculto" : ""}>
                  <Codigo codigo={p.sigla} />
                  <strong>{p.nome}</strong>
                  <span className="painel-suave">
                    {p.agentes[0]?.count ?? 0} agentes · {p.funis[0]?.count ?? 0} funis
                    {p.meta_diaria ? ` · meta ${reais(Number(p.meta_diaria))}/dia` : ""}
                    {!p.ativo && " · inativo"}
                  </span>
                  {p.oculto && <span className="admin-selo-oculto">oculto</span>}
                  <Link href={`/escritorio/${p.slug}`}>Escritório</Link>
                  <Link href={`/escritorio/${p.slug}/painel`}>Painel</Link>
                  <button className="painel-link" disabled={alterando === p.id}
                    title={p.oculto ? "Volta a aparecer na recepção e no escritório geral" : "Some da recepção, do escritório geral e do endereço público. Painel e agentes continuam funcionando."}
                    onClick={async () => {
                      setAlterando(p.id);
                      setErro(null);
                      try {
                        await api("/api/admin/projetos", { method: "PATCH", body: JSON.stringify({ id: p.id, oculto: !p.oculto }) });
                        await recarregar();
                      } catch (e) {
                        setErro((e as Error).message);
                      } finally {
                        setAlterando(null);
                      }
                    }}>
                    {alterando === p.id ? "…" : p.oculto ? "👁 Mostrar" : "🙈 Ocultar"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  })();

  return (
    <main className="painel">
      <header className="topo">
        <div className="topo-esq">
          <Marca subtitulo="Administração" />
          <Link href="/" className="voltar">← Recepção</Link>
        </div>
        <span />
        {sessao && acesso?.email ? (
          <span className="painel-usuario">
            {acesso.email}
            <button className="painel-link" onClick={() => db?.auth.signOut()}>Sair</button>
          </span>
        ) : <span />}
      </header>
      {conteudo}
    </main>
  );
}

// ------------------------------------------------------------------ consumo da IA

type Consumo = {
  projetos: Array<{ projeto_id: string | null; hoje: number; sete_dias: number; mes: number; total: number; chamadas: number }>;
  agentes: Array<{ projeto_id: string | null; agente_id: string | null; nome: string; custo: number; chamadas: number }>;
};

const dolares = (v: number) =>
  Number(v).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: Number(v) < 1 ? 4 : 2 });

export function TabelaDeConsumo({ projetos, consumo }: { projetos: ProjetoAdmin[]; consumo: Consumo }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const linhas = [
    ...projetos.map((p) => ({ id: p.id, nome: p.nome, c: consumo.projetos.find((x) => x.projeto_id === p.id) })),
    ...(consumo.projetos.some((x) => x.projeto_id === null)
      ? [{ id: "sem", nome: "Fora de escritório", c: consumo.projetos.find((x) => x.projeto_id === null) }]
      : []),
  ];
  const soma = (k: "hoje" | "sete_dias" | "mes" | "total") => consumo.projetos.reduce((t, x) => t + Number(x[k]), 0);
  return (
    <section className="painel-bloco">
      <h2>Consumo da IA por escritório (US$)</h2>
      <p className="painel-suave">
        Custo da API da Anthropic calculado pelos tokens de cada resposta dos agentes (Claude Opus 5.5: US$ 4 por milhão de tokens de entrada
        e US$ 20 por milhão de saída). Registrado a partir de hoje; o valor oficial da fatura fica no console.anthropic.com. Clique num
        escritório para ver o mês por agente.
      </p>
      <div className="relatorio-tabela-rolagem">
        <table className="relatorio-tabela consumo-tabela">
          <thead><tr><th>Escritório</th><th>Hoje</th><th>7 dias</th><th>Mês</th><th>Total</th></tr></thead>
          <tbody>
            {linhas.map(({ id, nome, c }) => (
              <Fragment key={id}>
                <tr className="consumo-linha" onClick={() => setAberto(aberto === id ? null : id)}>
                  <td>{aberto === id ? "▾" : "▸"} {nome}</td>
                  <td>{dolares(c?.hoje ?? 0)}</td>
                  <td>{dolares(c?.sete_dias ?? 0)}</td>
                  <td><strong>{dolares(c?.mes ?? 0)}</strong></td>
                  <td>{dolares(c?.total ?? 0)}</td>
                </tr>
                {aberto === id &&
                  consumo.agentes
                    .filter((a) => (a.projeto_id ?? "sem") === id)
                    .sort((a, b) => Number(b.custo) - Number(a.custo))
                    .map((a) => (
                      <tr key={`${id}-${a.agente_id}`} className="consumo-agente">
                        <td>{a.nome}</td>
                        <td colSpan={2} className="painel-suave">{a.chamadas} chamada{a.chamadas === 1 ? "" : "s"} no mês</td>
                        <td>{dolares(a.custo)}</td>
                        <td />
                      </tr>
                    ))}
              </Fragment>
            ))}
            <tr className="consumo-total">
              <td>Total</td><td>{dolares(soma("hoje"))}</td><td>{dolares(soma("sete_dias"))}</td><td>{dolares(soma("mes"))}</td><td>{dolares(soma("total"))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
