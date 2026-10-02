"use client";

import { useState } from "react";
import { CampoComAudio } from "./Audio";
import { Codigo, FORMATOS, Status, dataHora, resumoDasEntregas, type Entregas, type Funil, type Pedido } from "./tipos";

const SUGESTOES = [
  "Crie uma oferta nova com bônus exclusivo para quem comprar hoje",
  "Faça variações do anúncio que mais vendeu, mudando só o gancho",
  "Foque em quem nunca comprou um curso online e tem medo de cair em golpe",
  "Use prova social e números reais que estão no briefing",
  "Quebre a objeção de preço mostrando o custo de não agir",
  "Siga o estilo visual das referências anexadas",
];
const LIMITE_IMAGEM = 5 * 1024 * 1024; // limite do Claude por imagem
const LIMITE_PDF = 10 * 1024 * 1024;
const MAX_ARQUIVOS = 6;

export type NovoPedido = { funilId: string; texto: string; entregas: Entregas; links: string[]; arquivos: File[] };

export function FormularioDePedido({
  funis,
  funilInicial,
  textoInicial,
  liberado,
  enviando,
  aoEnviar,
}: {
  funis: Funil[];
  funilInicial: string | null;
  textoInicial?: string;
  liberado: boolean;
  enviando: boolean;
  aoEnviar: (p: NovoPedido) => void;
}) {
  const comBriefing = funis.filter((f) => f.briefing);
  const [funilId, setFunilId] = useState(
    comBriefing.find((f) => f.id === funilInicial)?.id ?? comBriefing[0]?.id ?? "",
  );
  const funil = comBriefing.find((f) => f.id === funilId);
  const [texto, setTexto] = useState(textoInicial ?? "");
  const [entregas, setEntregas] = useState<Entregas>({
    oferta: true,
    pagina: false,
    estaticos: 3,
    formato_estatico: "1080x1080",
    videos: 0,
    duracao_video: 30,
  });
  const [links, setLinks] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const nada = !entregas.oferta && !entregas.pagina && entregas.estaticos === 0 && entregas.videos === 0;

  const adicionarArquivos = (lista: FileList | null) => {
    setErro(null);
    const novos = [...(lista ?? [])];
    for (const f of novos) {
      const pdf = f.type === "application/pdf";
      if (!pdf && !f.type.startsWith("image/")) return setErro(`${f.name}: envie imagens (PNG, JPG, WEBP) ou PDF.`);
      if (f.size > (pdf ? LIMITE_PDF : LIMITE_IMAGEM)) return setErro(`${f.name} passa de ${pdf ? "10" : "5"} MB.`);
    }
    setArquivos((atuais) => [...atuais, ...novos].slice(0, MAX_ARQUIVOS));
  };

  return (
    <div className="painel-pedido">
      <label className="painel-campo painel-funil-escolha">
        <span>Para qual funil?</span>
        <select value={funilId} onChange={(e) => setFunilId(e.target.value)} required>
          {comBriefing.map((f) => (
            <option key={f.id} value={f.id}>{f.codigo} · {f.nome}</option>
          ))}
        </select>
        {funil && (
          <small className="painel-suave">
            Tudo deste pedido sai com o código <Codigo codigo={funil.codigo} /> (ex.: {funil.codigo}-EST-001).
          </small>
        )}
      </label>
      <CampoComAudio
        rotulo="O que você quer que o time faça?"
        valor={texto}
        aoMudar={setTexto}
        linhas={4}
        autoFocus
        placeholder="Escreva ou fale. Ex.: Quero uma oferta de Black Friday com 30% de desconto, focada em quem nunca participou de leilão."
      />
      <div className="painel-sugestoes" aria-label="Sugestões">
        {SUGESTOES.map((s) => (
          <button key={s} type="button" onClick={() => setTexto((t) => (t ? `${t.trim()}\n${s}` : s))}>
            + {s}
          </button>
        ))}
      </div>

      <fieldset className="painel-entregas">
        <legend>O que entregar</legend>
        <label className="painel-opcao">
          <input type="checkbox" checked={entregas.oferta} onChange={(e) => setEntregas({ ...entregas, oferta: e.target.checked })} />
          <span><strong>Nova oferta</strong><small>Promessa, preço, bônus e garantia. Sem marcar, o time usa a oferta atual.</small></span>
        </label>
        <label className="painel-opcao">
          <input type="checkbox" checked={entregas.pagina} onChange={(e) => setEntregas({ ...entregas, pagina: e.target.checked })} />
          <span><strong>Página de vendas</strong><small>Copy completa da página, pronta para publicar.</small></span>
        </label>
        <div className="painel-opcao">
          <span><strong>Anúncios estáticos</strong><small>Quantidade e formato</small></span>
          <div className="painel-qtd">
            <input type="number" min={0} max={10} value={entregas.estaticos} aria-label="Quantidade de anúncios estáticos"
              onChange={(e) => setEntregas({ ...entregas, estaticos: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} />
            <select value={entregas.formato_estatico} aria-label="Formato dos estáticos"
              onChange={(e) => setEntregas({ ...entregas, formato_estatico: e.target.value as Entregas["formato_estatico"] })}>
              {FORMATOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </div>
        </div>
        <div className="painel-opcao">
          <span><strong>Vídeos</strong><small>Quantidade e duração (motion graphics para Reels/Stories)</small></span>
          <div className="painel-qtd">
            <input type="number" min={0} max={5} value={entregas.videos} aria-label="Quantidade de vídeos"
              onChange={(e) => setEntregas({ ...entregas, videos: Math.max(0, Math.min(5, Number(e.target.value) || 0)) })} />
            <select value={entregas.duracao_video} aria-label="Duração dos vídeos"
              onChange={(e) => setEntregas({ ...entregas, duracao_video: Number(e.target.value) as Entregas["duracao_video"] })}>
              <option value={15}>15 segundos</option>
              <option value={30}>30 segundos</option>
              <option value={60}>60 segundos</option>
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="painel-entregas">
        <legend>Referências (opcional)</legend>
        <label className="painel-anexar">
          📎 Anexar imagens ou PDF
          <input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            onChange={(e) => { adicionarArquivos(e.target.files); e.target.value = ""; }} />
        </label>
        <small className="painel-suave">Até {MAX_ARQUIVOS} arquivos · imagens até 5 MB · PDF até 10 MB</small>
        {arquivos.length > 0 && (
          <ul className="painel-anexos">
            {arquivos.map((f, i) => (
              <li key={`${f.name}-${i}`}>
                {f.type === "application/pdf" ? "📄" : "🖼️"} {f.name}
                <button type="button" className="painel-link" onClick={() => setArquivos(arquivos.filter((_, j) => j !== i))}>remover</button>
              </li>
            ))}
          </ul>
        )}
        <label className="painel-campo painel-campo-links">
          Links de referência (um por linha)
          <textarea rows={2} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://..." />
        </label>
      </fieldset>

      {erro && <p className="painel-erro">{erro}</p>}
      {!liberado && <p className="painel-suave">Gere o briefing do produto (aba Briefing) para liberar os pedidos.</p>}
      <div className="painel-acoes">
        <button
          className="painel-botao"
          disabled={!liberado || !funilId || !texto.trim() || nada || enviando}
          onClick={() => aoEnviar({ funilId, texto: texto.trim(), entregas, links: links.split("\n").map((l) => l.trim()).filter(Boolean), arquivos })}
        >
          {enviando ? "Enviando…" : "Enviar pedido"}
        </button>
      </div>
    </div>
  );
}

export function HistoricoDePedidos({ pedidos, funis }: { pedidos: Pedido[]; funis: Funil[] }) {
  if (pedidos.length === 0) return <p className="painel-suave">Nenhum pedido ainda. Use “+ Novo pedido”.</p>;
  return (
    <ol className="painel-pedidos">
      {pedidos.map((p) => (
        <li key={p.id}>
          <div className="painel-cabecalho">
            <span className="painel-rotulo">
              <Codigo codigo={funis.find((f) => f.id === p.funil_id)?.codigo} /> {dataHora(p.created_at)} · {p.autor}
            </span>
            <Status status={p.status} />
          </div>
          <p>{p.texto}</p>
          <small className="painel-suave">
            {resumoDasEntregas(p.entregas)}
            {p.referencias.length > 0 && ` · ${p.referencias.length} anexo${p.referencias.length > 1 ? "s" : ""}`}
            {p.links.length > 0 && ` · ${p.links.length} link${p.links.length > 1 ? "s" : ""}`}
          </small>
          {p.erro && <p className="painel-motivo">Erro: {p.erro}</p>}
        </li>
      ))}
    </ol>
  );
}
