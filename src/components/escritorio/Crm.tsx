"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { supabaseNavegador } from "@/lib/supabase";
import { Janela } from "../painel/Janela";

// CRM da Sala Comercial: os leads do projeto em kanban. Os cards andam sozinhos (formulário,
// WhatsApp, Kiwify e as regras de follow-up) e dá para arrastar na mão.

type Etapa = "para_atender" | "em_atendimento" | "follow_up" | "aguardando_pagamento" | "compra_feita" | "perdido";

type Lead = {
  id: string;
  nome: string | null;
  telefone: string;
  email: string | null;
  projeto_id: string | null;
  origens: string[];
  funil_codigo: string | null;
  etapa: Etapa;
  etapa_desde: string;
  agente_id: string | null;
  valor: number | null;
  pagamento: string | null;
  checkout_url: string | null;
  ultima_mensagem: string | null;
  ultima_mensagem_em: string | null;
  followup_tentativas: number;
  perdido_motivo: string | null;
  humano: boolean;
  humano_motivo: string | null;
  optout: boolean;
  created_at: string;
  updated_at: string;
  agentes: { nome: string; cor: string } | null;
};

type Mensagem = { id: string; direcao: "entrada" | "saida"; texto: string | null; agente_id: string | null; created_at: string };

const COLUNAS: Array<{ id: Etapa; n: string; titulo: string; dica: string; cor: string }> = [
  { id: "para_atender", n: "01", titulo: "Para atender", dica: "Cadastrou ou mandou mensagem", cor: "#a0a0a2" },
  { id: "em_atendimento", n: "02", titulo: "Em atendimento", dica: "Um agente de IA está conversando", cor: "var(--verde)" },
  { id: "follow_up", n: "03", titulo: "Follow-ups", dica: "Sem resposta · a cada 2 h, até 4 vezes", cor: "#9db6ff" },
  { id: "aguardando_pagamento", n: "04", titulo: "Aguardando pagamento", dica: "Recebeu o link ou disse que vai comprar", cor: "#ffd37a" },
  { id: "compra_feita", n: "05", titulo: "Compra feita", dica: "Pagamento confirmado no gateway", cor: "var(--verde-claro)" },
  { id: "perdido", n: "06", titulo: "Perdido", dica: "4 follow-ups ou 3 dias sem resposta", cor: "#ff8a8a" },
];

const ORIGEM: Record<string, { rotulo: string; classe: string }> = {
  formulario: { rotulo: "📝 Formulário", classe: "f" },
  whatsapp: { rotulo: "💬 WhatsApp", classe: "w" },
  carrinho: { rotulo: "🛒 Carrinho", classe: "r" },
  compra: { rotulo: "💳 Kiwify", classe: "p" },
};

const PAGAMENTO: Record<string, string> = {
  link_enviado: "🔗 Link enviado",
  pix_gerado: "⏳ Pix gerado",
  boleto_gerado: "⏳ Boleto gerado",
  vai_comprar: "🗓️ Disse que vai comprar",
  pago: "✅ Pago",
  reembolsado: "↩️ Reembolsado",
};

const PERIODOS = { hoje: "Hoje", "7d": "Últimos 7 dias", "30d": "Últimos 30 dias", tudo: "Tudo" } as const;
type Periodo = keyof typeof PERIODOS;

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function telefoneBonito(t: string) {
  if (t.startsWith("email:")) return "sem telefone";
  const d = t.replace(/^55/, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : t;
}

function haQuanto(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? "dia" : "dias"}`;
}

function inicioDoPeriodo(p: Periodo) {
  const agora = new Date();
  if (p === "hoje") return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  if (p === "7d") return agora.getTime() - 7 * 864e5;
  if (p === "30d") return agora.getTime() - 30 * 864e5;
  return 0;
}

export function Crm({ slug }: { slug: string }) {
  const db = supabaseNavegador();
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [origem, setOrigem] = useState("");
  const [agente, setAgente] = useState("");
  const [busca, setBusca] = useState("");
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<Etapa | null>(null);
  const [aberto, setAberto] = useState<Lead | null>(null);

  useEffect(() => {
    if (!db) return setSessao(null);
    db.auth.getSession().then(({ data }) => setSessao(data.session));
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

  const carregar = useCallback(async () => {
    try {
      const r = await api(`/api/painel/crm?projeto=${encodeURIComponent(slug)}`);
      setLeads(r.leads);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [api, slug]);

  // Atualiza a cada 20 s: os cards andam sozinhos com mensagens, pedidos e follow-ups.
  useEffect(() => {
    if (!sessao) return;
    void carregar();
    const id = setInterval(() => void carregar(), 20000);
    return () => clearInterval(id);
  }, [sessao, carregar]);

  async function mover(id: string, etapa: Etapa) {
    setLeads((ls) => ls?.map((l) => (l.id === id ? { ...l, etapa, etapa_desde: new Date().toISOString() } : l)) ?? null);
    try {
      await api("/api/painel/crm", { method: "PATCH", body: JSON.stringify({ id, etapa }) });
    } catch (e) {
      setErro((e as Error).message);
    }
    await carregar();
  }

  const agentes = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of leads ?? []) if (l.agente_id && l.agentes) m.set(l.agente_id, l.agentes.nome);
    return [...m];
  }, [leads]);

  const visiveis = useMemo(() => {
    const desde = inicioDoPeriodo(periodo);
    const termo = busca.trim().toLowerCase();
    const digitos = termo.replace(/\D/g, "");
    return (leads ?? []).filter(
      (l) =>
        new Date(l.updated_at).getTime() >= desde &&
        (!origem || l.origens.includes(origem)) &&
        (!agente || l.agente_id === agente) &&
        (!termo ||
          (l.nome ?? "").toLowerCase().includes(termo) ||
          (l.email ?? "").includes(termo) ||
          (digitos.length >= 3 && l.telefone.includes(digitos))),
    );
  }, [leads, periodo, origem, agente, busca]);

  if (sessao === undefined) return null;
  if (!sessao) {
    return (
      <section className="crm crm-trancado">
        <h2>CRM · Leads</h2>
        <p>Os leads têm telefone e conversa, então só aparecem para a equipe logada.</p>
        <Link href={`/escritorio/${slug}/painel`} className="atalho-painel">Entrar pelo Painel do projeto</Link>
      </section>
    );
  }

  return (
    <section className="crm" aria-label="CRM de leads">
      <header className="crm-topo">
        <h2>
          CRM · Leads <small>WhatsApp + formulários + Kiwify</small>
        </h2>
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} aria-label="Período">
          {Object.entries(PERIODOS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </select>
        <select value={origem} onChange={(e) => setOrigem(e.target.value)} aria-label="Origem">
          <option value="">Todas as origens</option>
          {Object.entries(ORIGEM).map(([v, o]) => <option key={v} value={v}>{o.rotulo}</option>)}
        </select>
        <select value={agente} onChange={(e) => setAgente(e.target.value)} aria-label="Agente">
          <option value="">Todos os agentes</option>
          {agentes.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
        </select>
        <input className="crm-busca" type="search" placeholder="🔍 Buscar nome, e-mail ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </header>
      {erro && <p className="erro">{erro}</p>}

      <div className="crm-kanban">
        {COLUNAS.map((c) => {
          const daColuna = visiveis.filter((l) => l.etapa === c.id);
          const total = daColuna.reduce((s, l) => s + (l.valor ?? 0), 0);
          return (
            <div
              key={c.id}
              className={`crm-coluna ${sobre === c.id ? "sobre" : ""}`}
              style={{ "--c": c.cor } as React.CSSProperties}
              onDragOver={(e) => { e.preventDefault(); setSobre(c.id); }}
              onDragLeave={() => setSobre((s) => (s === c.id ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setSobre(null);
                const id = e.dataTransfer.getData("text/plain");
                const lead = leads?.find((l) => l.id === id);
                if (lead && lead.etapa !== c.id) void mover(id, c.id);
              }}
            >
              <header>
                <span className="n">{c.n}</span>
                <strong>{c.titulo}</strong>
                <em>{daColuna.length}</em>
                <span className="dica">{c.dica}{total > 0 && (c.id === "aguardando_pagamento" || c.id === "compra_feita") ? ` · ${reais(total)}` : ""}</span>
              </header>
              {leads === null ? (
                <p className="crm-vazio">Carregando…</p>
              ) : daColuna.length === 0 ? (
                <p className="crm-vazio">Nenhum lead</p>
              ) : (
                daColuna.map((l) => (
                  <Card key={l.id} lead={l} arrastando={arrastando === l.id}
                    aoArrastar={(v) => setArrastando(v ? l.id : null)} aoAbrir={() => setAberto(l)} />
                ))
              )}
            </div>
          );
        })}
      </div>
      <p className="crm-legenda">Arraste o card para mudar de etapa · clique para ver a conversa · atualiza sozinho a cada 20 s</p>

      {aberto && (
        <JanelaDoLead
          lead={leads?.find((l) => l.id === aberto.id) ?? aberto}
          slug={slug}
          api={api}
          aoMover={(etapa) => void mover(aberto.id, etapa)}
          aoMudar={carregar}
          aoFechar={() => setAberto(null)}
        />
      )}
    </section>
  );
}

function Card({ lead: l, arrastando, aoArrastar, aoAbrir }: { lead: Lead; arrastando: boolean; aoArrastar: (v: boolean) => void; aoAbrir: () => void }) {
  return (
    <button
      className={`crm-card ${arrastando ? "arrastando" : ""}`}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", l.id); aoArrastar(true); }}
      onDragEnd={() => aoArrastar(false)}
      onClick={aoAbrir}
    >
      <span className="l1">
        {l.agentes && <span className="av" style={{ background: l.agentes.cor }} title={l.agentes.nome}>{l.agentes.nome[0]}</span>}
        <b>{l.nome ?? telefoneBonito(l.telefone)}</b>
        <time>{haQuanto(l.ultima_mensagem_em ?? l.updated_at)}</time>
      </span>
      <span className="tel">
        {l.nome ? telefoneBonito(l.telefone) : "sem nome ainda"}
        {l.agentes ? ` · ${l.agentes.nome}` : ""}
      </span>
      {l.valor ? <span className="valor">{reais(l.valor)}</span> : null}
      {l.ultima_mensagem && <span className="msg">“{l.ultima_mensagem.slice(0, 110)}{l.ultima_mensagem.length > 110 ? "…" : ""}”</span>}
      {l.etapa === "follow_up" && (
        <span className="prog" title={`${l.followup_tentativas} de 4 follow-ups`}>
          {[0, 1, 2, 3].map((i) => <i key={i} className={i < l.followup_tentativas ? "on" : ""} />)}
        </span>
      )}
      {l.etapa === "perdido" && l.perdido_motivo && <span className="motivo">{l.perdido_motivo}</span>}
      <span className="chips">
        {l.origens.map((o) => ORIGEM[o] && <span key={o} className={`chip ${ORIGEM[o].classe}`}>{ORIGEM[o].rotulo}</span>)}
        {l.pagamento && PAGAMENTO[l.pagamento] && <span className="chip a">{PAGAMENTO[l.pagamento]}</span>}
        {l.funil_codigo && <span className="chip">{l.funil_codigo}</span>}
        {!l.projeto_id && <span className="chip r">sem projeto</span>}
        {l.humano && <span className="chip a" title={l.humano_motivo ?? ""}>🙋 humano</span>}
        {l.optout && <span className="chip r">🚫 não quer contato</span>}
      </span>
    </button>
  );
}

function JanelaDoLead({
  lead,
  slug,
  api,
  aoMover,
  aoMudar,
  aoFechar,
}: {
  lead: Lead;
  slug: string;
  api: (caminho: string, init?: RequestInit) => Promise<{ mensagens?: Mensagem[] }>;
  aoMover: (etapa: Etapa) => void;
  aoMudar: () => Promise<void>;
  aoFechar: () => void;
}) {
  const [mensagens, setMensagens] = useState<Mensagem[] | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const carregarConversa = useCallback(() => {
    api(`/api/painel/crm/conversa?id=${lead.id}`)
      .then((r) => setMensagens(r.mensagens ?? []))
      .catch(() => setMensagens([]));
  }, [api, lead.id]);
  useEffect(() => carregarConversa(), [carregarConversa]);

  async function alternarHumano() {
    await api("/api/painel/crm", { method: "PATCH", body: JSON.stringify({ id: lead.id, humano: !lead.humano }) });
    await aoMudar();
  }
  async function enviar() {
    if (!texto.trim()) return;
    setEnviando(true);
    setErro(null);
    try {
      await api("/api/painel/crm/enviar", { method: "POST", body: JSON.stringify({ id: lead.id, texto }) });
      setTexto("");
      carregarConversa();
      await aoMudar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Janela titulo={lead.nome ?? telefoneBonito(lead.telefone)} subtitulo="Lead" aoFechar={aoFechar}>
      <div className="crm-lead">
        <dl>
          <dt>Telefone</dt>
          <dd>
            {telefoneBonito(lead.telefone)}
            {!lead.telefone.startsWith("email:") && (
              <> · <a href={`https://wa.me/${lead.telefone}`} target="_blank" rel="noreferrer">abrir no WhatsApp ↗</a></>
            )}
          </dd>
          {lead.email && (<><dt>E-mail</dt><dd>{lead.email}</dd></>)}
          <dt>Origem</dt>
          <dd>{lead.origens.map((o) => ORIGEM[o]?.rotulo ?? o).join(" · ") || "—"}{lead.funil_codigo ? ` · ${lead.funil_codigo}` : ""}</dd>
          {lead.agentes && (<><dt>Agente</dt><dd>{lead.agentes.nome}</dd></>)}
          {(lead.valor || lead.pagamento) && (
            <><dt>Pagamento</dt><dd>{lead.valor ? reais(lead.valor) : ""} {lead.pagamento ? PAGAMENTO[lead.pagamento] ?? lead.pagamento : ""}</dd></>
          )}
          {lead.checkout_url && (<><dt>Checkout</dt><dd><a href={lead.checkout_url} target="_blank" rel="noreferrer">link do carrinho ↗</a></dd></>)}
          <dt>Na etapa desde</dt>
          <dd>{new Date(lead.etapa_desde).toLocaleString("pt-BR")}</dd>
        </dl>

        <label className="crm-etapa">
          Etapa
          <select value={lead.etapa} onChange={(e) => aoMover(e.target.value as Etapa)}>
            {COLUNAS.map((c) => <option key={c.id} value={c.id}>{c.n} · {c.titulo}</option>)}
          </select>
        </label>
        {!lead.projeto_id && (
          <button className="painel-botao secundario" onClick={async () => {
            await api("/api/painel/crm", { method: "PATCH", body: JSON.stringify({ id: lead.id, projeto: slug }) });
            await aoMudar();
          }}>
            Ligar este lead a este projeto
          </button>
        )}

        <div className="crm-ia">
          {lead.humano ? (
            <span>🙋 <b>Com a equipe</b>: a IA não responde este lead.{lead.humano_motivo ? ` (${lead.humano_motivo})` : ""}</span>
          ) : (
            <span>🤖 <b>Com a IA</b>: o agente responde e faz os follow-ups.</span>
          )}
          <button className="painel-botao secundario" onClick={() => void alternarHumano()}>
            {lead.humano ? "Devolver para a IA" : "Assumir (pausar a IA)"}
          </button>
        </div>
        {lead.optout && <p className="erro">Este lead pediu para não receber mensagens.</p>}

        <h3>Conversa no WhatsApp</h3>
        <ol className="crm-conversa">
          {mensagens === null ? (
            <li className="crm-vazio">Carregando…</li>
          ) : mensagens.length === 0 ? (
            <li className="crm-vazio">Nenhuma mensagem ainda.</li>
          ) : (
            mensagens.map((m) => (
              <li key={m.id} className={m.direcao}>
                <span>{m.texto ?? "(mídia)"}</span>
                <time>{new Date(m.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</time>
              </li>
            ))
          )}
        </ol>
        {!lead.telefone.startsWith("email:") && (
          <div className="crm-responder">
            <textarea rows={2} placeholder="Responder pelo WhatsApp do projeto (a IA pausa neste lead)" value={texto}
              onChange={(e) => setTexto(e.target.value)} />
            <button className="painel-botao" disabled={enviando || !texto.trim()} onClick={() => void enviar()}>
              {enviando ? "Enviando…" : "Enviar"}
            </button>
          </div>
        )}
        {erro && <p className="erro">{erro}</p>}
      </div>
    </Janela>
  );
}
