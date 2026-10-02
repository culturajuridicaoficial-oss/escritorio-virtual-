// Página de vendas montada a partir da copy aprovada. A mesma peça aparece na
// prévia do /painel e no endereço público /p/<id> depois de aprovada.

export type CopyDaPagina = {
  headline: string;
  subheadline: string;
  cta: string;
  secoes: Array<{ titulo: string; texto: string; itens: string[] }>;
  faq: Array<{ pergunta: string; resposta: string }>;
};

export type OfertaDaPagina = {
  titulo: string;
  promessa: string | null;
  preco: number | null;
  bonus: Array<{ nome: string; descricao: string }> | null;
  garantia: string | null;
  checkout_url: string | null;
};

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PaginaDeVendas({
  pagina,
  oferta,
  cor = "#00C26E",
}: {
  pagina: CopyDaPagina;
  oferta: OfertaDaPagina;
  cor?: string;
}) {
  const link = oferta.checkout_url ?? "#oferta";
  const Botao = () => (
    <a className="pv-botao" href={link}>
      {pagina.cta}
    </a>
  );
  return (
    <div className="pv" style={{ "--pv-cor": cor } as React.CSSProperties}>
      <style>{CSS}</style>
      <header className="pv-hero">
        <p className="pv-selo">{oferta.titulo}</p>
        <h1>{pagina.headline}</h1>
        <p className="pv-sub">{pagina.subheadline}</p>
        <Botao />
      </header>

      {pagina.secoes.map((s, i) => (
        <section key={i} className="pv-secao">
          <h2>{s.titulo}</h2>
          <p>{s.texto}</p>
          {s.itens.length > 0 && (
            <ul>
              {s.itens.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <section id="oferta" className="pv-oferta">
        <h2>{oferta.titulo}</h2>
        {oferta.promessa && <p>{oferta.promessa}</p>}
        {oferta.bonus && oferta.bonus.length > 0 && (
          <ul className="pv-bonus">
            {oferta.bonus.map((b, i) => (
              <li key={i}>
                <strong>🎁 {b.nome}</strong>
                <span>{b.descricao}</span>
              </li>
            ))}
          </ul>
        )}
        {oferta.preco !== null && <p className="pv-preco">{reais(oferta.preco)}</p>}
        <Botao />
        {oferta.garantia && <p className="pv-garantia">🛡️ {oferta.garantia}</p>}
      </section>

      {pagina.faq.length > 0 && (
        <section className="pv-secao">
          <h2>Perguntas frequentes</h2>
          {pagina.faq.map((f, i) => (
            <details key={i}>
              <summary>{f.pergunta}</summary>
              <p>{f.resposta}</p>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}

const CSS = `
.pv { --pv-fundo: #ffffff; --pv-texto: #111111; background: var(--pv-fundo); color: var(--pv-texto);
  font-family: Inter, system-ui, sans-serif; line-height: 1.6; }
.pv * { box-sizing: border-box; }
.pv-hero { padding: 64px 20px 56px; text-align: center; background: #0a0a0a; color: #f5f5f3; }
.pv-hero h1 { font-family: "Space Grotesk", system-ui, sans-serif; font-size: clamp(30px, 6vw, 52px); line-height: 1.1;
  max-width: 820px; margin: 12px auto; }
.pv-sub { font-size: clamp(17px, 2.4vw, 21px); max-width: 680px; margin: 0 auto 28px; opacity: 0.85; }
.pv-selo { display: inline-block; margin: 0; padding: 4px 12px; border: 1px solid var(--pv-cor); color: var(--pv-cor);
  font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; }
.pv-botao { display: inline-block; padding: 18px 34px; background: var(--pv-cor); color: #0a0a0a; font-weight: 800;
  font-size: 18px; text-decoration: none; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
.pv-botao:hover { filter: brightness(1.08); }
.pv-secao { max-width: 760px; margin: 0 auto; padding: 48px 20px; border-bottom: 1px solid #eee; }
.pv-secao h2, .pv-oferta h2 { font-family: "Space Grotesk", system-ui, sans-serif; font-size: clamp(24px, 4vw, 34px); line-height: 1.2; }
.pv-secao ul { padding-left: 0; list-style: none; }
.pv-secao li { padding: 8px 0 8px 32px; position: relative; }
.pv-secao li::before { content: "✔"; position: absolute; left: 0; color: var(--pv-cor); font-weight: 800; }
.pv-oferta { text-align: center; padding: 56px 20px; background: #f5f5f3; }
.pv-oferta > p { max-width: 640px; margin: 0 auto 16px; }
.pv-bonus { list-style: none; padding: 0; max-width: 560px; margin: 20px auto; text-align: left; }
.pv-bonus li { display: flex; flex-direction: column; padding: 12px 16px; margin-bottom: 8px; background: #fff; border-left: 4px solid var(--pv-cor); }
.pv-preco { font-family: "Space Grotesk", system-ui, sans-serif; font-size: 44px; font-weight: 800; margin: 20px 0 !important; }
.pv-garantia { margin-top: 18px !important; font-size: 15px; }
.pv details { border-bottom: 1px solid #eee; padding: 12px 0; }
.pv summary { font-weight: 700; cursor: pointer; }
`;
