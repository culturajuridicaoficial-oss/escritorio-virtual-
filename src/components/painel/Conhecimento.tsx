"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { supabaseNavegador } from "@/lib/supabase";
import { CAMPOS_DO_CONHECIMENTO, type Campos } from "@/lib/conhecimentoCampos";
import { Marca } from "../escritorio/Marca";
import { CampoComAudio } from "./Audio";
import { Login } from "./Painel";

// Base de conhecimento: uma aba por produto. O que a equipe escreve aqui vai para todos os
// agentes de IA do escritório (copy, design, analistas e atendimento no WhatsApp).

type Aba = {
  id: string;
  slug: string;
  nome: string;
  ordem: number;
  usar_na_ia: boolean;
  campos: Campos;
  atualizado_por: string | null;
  updated_at: string;
};

const preenchidos = (campos: Campos) => CAMPOS_DO_CONHECIMENTO.filter((c) => campos[c.id]?.trim()).length;
const linhasPara = (texto = "") => Math.min(16, Math.max(3, texto.split("\n").length + Math.ceil(texto.length / 90)));
/** O primeiro endereço escrito no campo Links (sugestão para "Ler página de vendas"). */
const primeiroLink = (campos?: Campos) => campos?.links?.match(/https?:\/\/\S+/)?.[0] ?? "";
const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export function Conhecimento({ slug }: { slug: string }) {
  const db = supabaseNavegador();
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregandoSessao, setCarregandoSessao] = useState(true);
  const [acesso, setAcesso] = useState<{ email?: string; admin?: boolean; erro?: string } | null>(null);
  const [nomeProjeto, setNomeProjeto] = useState("");
  const [abas, setAbas] = useState<Aba[] | null>(null);
  const [ativa, setAtiva] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Campos>({});
  // O texto mais recente (a leitura da página demora e a pessoa pode seguir digitando).
  const rascunhoAtual = useRef(rascunho);
  rascunhoAtual.current = rascunho;
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [urlPagina, setUrlPagina] = useState("");
  const [substituir, setSubstituir] = useState(false);
  const [lendo, setLendo] = useState(false);

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

  useEffect(() => {
    if (!acesso?.email) return;
    api(`/api/painel/conhecimento?projeto=${encodeURIComponent(slug)}`)
      .then((r: { projeto: { nome: string }; abas: Aba[] }) => {
        setNomeProjeto(r.projeto.nome);
        setAbas(r.abas);
        const primeira = r.abas[0];
        if (primeira) {
          setAtiva(primeira.id);
          setRascunho(primeira.campos ?? {});
          setUrlPagina(primeiroLink(primeira.campos));
        }
      })
      .catch((e) => setAviso({ tipo: "erro", texto: e.message }));
  }, [acesso, api, slug]);

  const aba = abas?.find((a) => a.id === ativa) ?? null;
  const alterado = !!aba && CAMPOS_DO_CONHECIMENTO.some((c) => (rascunho[c.id] ?? "").trim() !== (aba.campos[c.id] ?? "").trim());

  // Fechar a página com texto não salvo pede confirmação do navegador.
  useEffect(() => {
    if (!alterado) return;
    const segurar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", segurar);
    return () => window.removeEventListener("beforeunload", segurar);
  }, [alterado]);

  const trocarAba = (id: string) => {
    if (id === ativa) return;
    if (lendo) return alert("Espere a leitura da página terminar: o resultado vai para esta aba.");
    if (alterado && !confirm("Há alterações não salvas nesta aba. Trocar mesmo assim e perder o que não foi salvo?")) return;
    const destino = abas?.find((a) => a.id === id);
    setAtiva(id);
    setRascunho(destino?.campos ?? {});
    setUrlPagina(primeiroLink(destino?.campos));
    setAviso(null);
  };

  const atualizarAba = (nova: Aba) => setAbas((lista) => lista?.map((a) => (a.id === nova.id ? nova : a)) ?? null);

  async function salvar(extra?: Partial<Pick<Aba, "nome" | "usar_na_ia">>) {
    if (!aba) return;
    setSalvando(true);
    setAviso(null);
    try {
      const salva: Aba = await api("/api/painel/conhecimento", {
        method: "PATCH",
        body: JSON.stringify({ projeto: slug, id: aba.id, campos: rascunho, ...extra }),
      });
      atualizarAba(salva);
      setRascunho(salva.campos ?? {});
      setAviso({ tipo: "ok", texto: extra?.nome ? "Nome atualizado." : "Salvo. Os agentes já usam este conteúdo." });
    } catch (e) {
      setAviso({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  /** Lê a página de vendas e coloca o que achou nos campos (sem salvar: a equipe revisa antes). */
  async function lerPagina() {
    if (!aba) return;
    setLendo(true);
    setAviso(null);
    try {
      const { sugestoes }: { sugestoes: Campos } = await api("/api/painel/conhecimento/ler", {
        method: "POST",
        body: JSON.stringify({ projeto: slug, id: aba.id, url: urlPagina }),
      });
      let novos = 0;
      let mantidos = 0;
      const proximo = { ...rascunhoAtual.current };
      for (const c of CAMPOS_DO_CONHECIMENTO) {
        const sugestao = sugestoes[c.id]?.trim();
        if (!sugestao) continue;
        if (proximo[c.id]?.trim() && !substituir) {
          mantidos++;
          continue;
        }
        if (proximo[c.id]?.trim() !== sugestao) novos++;
        proximo[c.id] = sugestao;
      }
      setRascunho(proximo);
      setAviso({
        tipo: "ok",
        texto: novos
          ? `A página preencheu ${novos} campo${novos > 1 ? "s" : ""}${mantidos ? ` (${mantidos > 1 ? `${mantidos} que já tinham texto não mudaram` : "1 que já tinha texto não mudou"})` : ""}. Revise e clique em Salvar: nada vai para a IA antes disso.`
          : mantidos
            ? "A página não trouxe nada para os campos vazios. Marque “Substituir o que já está escrito” para trocar pelo texto da página."
            : "Não encontrei informações nessa página. Confira o endereço.",
      });
    } catch (e) {
      setAviso({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setLendo(false);
    }
  }

  async function novaAba() {
    if (alterado && !confirm("Há alterações não salvas nesta aba. Criar outra aba mesmo assim e perder o que não foi salvo?")) return;
    const nome = prompt("Nome do produto (ex.: Clube Trabalhista)")?.trim();
    if (!nome) return;
    try {
      const criada: Aba = await api("/api/painel/conhecimento", { method: "POST", body: JSON.stringify({ projeto: slug, nome }) });
      setAbas((lista) => [...(lista ?? []), criada]);
      setAtiva(criada.id);
      setRascunho({});
      setUrlPagina("");
      setAviso(null);
    } catch (e) {
      setAviso({ tipo: "erro", texto: (e as Error).message });
    }
  }

  async function renomear() {
    if (!aba) return;
    const nome = prompt("Novo nome da aba", aba.nome)?.trim();
    if (nome && nome !== aba.nome) await salvar({ nome });
  }

  async function apagar() {
    if (!aba || !confirm(`Apagar a aba "${aba.nome}" e tudo que está escrito nela? Os agentes deixam de usar esse conteúdo.`)) return;
    try {
      await api("/api/painel/conhecimento", { method: "DELETE", body: JSON.stringify({ projeto: slug, id: aba.id }) });
      const resto = (abas ?? []).filter((a) => a.id !== aba.id);
      setAbas(resto);
      setAtiva(resto[0]?.id ?? null);
      setRascunho(resto[0]?.campos ?? {});
      setUrlPagina(primeiroLink(resto[0]?.campos));
      setAviso({ tipo: "ok", texto: `Aba "${aba.nome}" apagada.` });
    } catch (e) {
      setAviso({ tipo: "erro", texto: (e as Error).message });
    }
  }

  // ------------------------------------------------------------------ telas

  const moldura = (conteudo: React.ReactNode, direita?: React.ReactNode) => (
    <main className="painel">
      <header className="topo">
        <div className="topo-esq">
          <Marca subtitulo={`Conhecimento · ${nomeProjeto || "Projeto"}`} />
          <Link href={`/escritorio/${slug}`} className="voltar">← Escritório</Link>
          <Link href={`/escritorio/${slug}/painel`} className="voltar">Painel</Link>
          <Link href="/" className="voltar">Recepção</Link>
        </div>
        <span />
        {direita ?? <span />}
      </header>
      {conteudo}
    </main>
  );

  if (!db) return moldura(<p className="painel-aviso">A página de conhecimento precisa do Supabase configurado.</p>);
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
      <section className="conhecimento-intro">
        <h2>📚 Base de conhecimento</h2>
        <p className="painel-suave">
          Uma aba por produto. Tudo que estiver escrito aqui vai para os agentes de IA do escritório (copy, design, analistas e
          atendimento no WhatsApp) como fonte oficial. Quanto mais completo, menos a IA precisa adivinhar e menos chama a equipe.
        </p>
      </section>

      <nav className="painel-barra" aria-label="Produtos">
        <div className="painel-abas" role="tablist">
          {(abas ?? []).map((a) => (
            <button key={a.id} role="tab" aria-selected={a.id === ativa} className={a.id === ativa ? "ativa" : ""} onClick={() => trocarAba(a.id)}>
              {a.nome} <small className="conhecimento-contagem">{preenchidos(a.id === ativa ? rascunho : a.campos)}/{CAMPOS_DO_CONHECIMENTO.length}</small>
            </button>
          ))}
        </div>
        <button className="painel-botao secundario" onClick={novaAba} disabled={lendo}>+ Nova aba</button>
      </nav>

      {aviso && (
        <p className={aviso.tipo === "erro" ? "painel-erro" : "conhecimento-ok"} role={aviso.tipo === "erro" ? "alert" : "status"}>
          {aviso.texto}
        </p>
      )}

      {!abas ? (
        <p className="painel-aviso">Carregando…</p>
      ) : !aba ? (
        <p className="painel-aviso">Nenhuma aba ainda. Clique em “+ Nova aba” para cadastrar o primeiro produto.</p>
      ) : (
        <form
          className="briefing"
          onSubmit={(e) => {
            e.preventDefault();
            void salvar();
          }}
        >
          <div className="painel-cabecalho">
            <div>
              <p className="painel-rotulo">PRODUTO</p>
              <h3>{aba.nome}</h3>
              <p className="painel-suave">
                Atualizado {quando(aba.updated_at)}
                {aba.atualizado_por ? ` por ${aba.atualizado_por}` : ""}
              </p>
            </div>
            <div className="painel-acoes">
              <label className="conhecimento-ia">
                <input type="checkbox" checked={aba.usar_na_ia} disabled={salvando}
                  onChange={(e) => void salvar({ usar_na_ia: e.target.checked })} />
                Usar na IA
              </label>
              <button type="button" className="painel-link" onClick={renomear}>Renomear</button>
              <button type="button" className="painel-link perigo-texto" onClick={apagar}>Apagar aba</button>
            </div>
          </div>
          {!aba.usar_na_ia && (
            <p className="painel-aviso">Esta aba está fora da IA: os agentes não leem este produto até você marcar “Usar na IA”.</p>
          )}

          <fieldset className="briefing-bloco conhecimento-pagina">
            <legend>📄 Preencher pela página de vendas</legend>
            <p className="painel-suave">
              Cole o link da página de vendas do {aba.nome}. Um agente lê a página e coloca o que encontrar nos campos abaixo. Leva até 2 minutos.
              Você revisa e só depois salva.
            </p>
            <div className="painel-url">
              <input type="url" inputMode="url" placeholder="https://www.culturajuridica.com.br/…" value={urlPagina}
                onChange={(e) => setUrlPagina(e.target.value)} disabled={lendo} aria-label="Link da página de vendas" />
              <button type="button" className="painel-botao" onClick={lerPagina} disabled={lendo || !/^https?:\/\/\S+\.\S+/.test(urlPagina.trim())}>
                {lendo ? "⏳ Lendo a página…" : "Ler página de vendas"}
              </button>
            </div>
            <label className="conhecimento-ia conhecimento-substituir">
              <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} disabled={lendo} />
              Substituir o que já está escrito (sem marcar, só os campos vazios são preenchidos)
            </label>
          </fieldset>

          <fieldset className="briefing-bloco">
            <legend>O que a IA precisa saber</legend>
            {CAMPOS_DO_CONHECIMENTO.map((c) => (
              <CampoComAudio
                key={`${aba.id}-${c.id}`}
                rotulo={c.rotulo}
                ajuda={c.dica}
                linhas={linhasPara(rascunho[c.id])}
                valor={rascunho[c.id] ?? ""}
                aoMudar={(v) => setRascunho((r) => ({ ...r, [c.id]: v }))}
                separador={"\n"}
              />
            ))}
          </fieldset>

          <div className="briefing-salvar painel-acoes">
            <button className="painel-botao" type="submit" disabled={salvando || !alterado}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
            <span className="painel-suave">
              {alterado ? "Há alterações não salvas." : `${preenchidos(rascunho)} de ${CAMPOS_DO_CONHECIMENTO.length} campos preenchidos.`}
            </span>
          </div>
        </form>
      )}
    </>,
    <span className="painel-usuario">
      {acesso.admin && <Link href="/admin" className="painel-link">⚙ Admin</Link>}
      {acesso.email}
      <button className="painel-link" onClick={() => db.auth.signOut()}>Sair</button>
    </span>,
  );
}
