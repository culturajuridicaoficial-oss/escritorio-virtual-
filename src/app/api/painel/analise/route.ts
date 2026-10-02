import { NextResponse, after } from "next/server";
import { erroJson, exigirEquipe } from "@/lib/equipe";
import { pedirAnalise, repetirAnalise, rodarAnalise, type Agente } from "@/lib/analises";

export const maxDuration = 300;

// Pedido de análise ao Veredito (oferta e copy) ou à Lupa (Meta Ads). Responde na hora
// com o código; o agente trabalha em seguida e o painel acompanha pelo quadro de análises.
export async function POST(req: Request) {
  const auth = await exigirEquipe(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const corpo = await req.json();
    // { projeto, repetir: id } tenta de novo uma análise que deu erro
    if (corpo.repetir) {
      const id = String(corpo.repetir);
      await repetirAnalise(id, String(corpo.projeto ?? ""));
      after(() => rodarAnalise(id));
      return NextResponse.json({ id });
    }
    const agente: Agente = corpo.agente === "analista-meta" ? "analista-meta" : "analista-ofertas";
    const analise = await pedirAnalise({
      slug: String(corpo.projeto ?? ""),
      autor: auth.email,
      agente,
      funilId: corpo.funil ? String(corpo.funil) : null,
      alvo: {
        pagina_url: corpo.alvo?.pagina_url ? String(corpo.alvo.pagina_url) : null,
        ofertas: Array.isArray(corpo.alvo?.ofertas) ? corpo.alvo.ofertas.map(String) : [],
        criativos: Array.isArray(corpo.alvo?.criativos) ? corpo.alvo.criativos.map(String) : [],
        links: Array.isArray(corpo.alvo?.links) ? corpo.alvo.links.map(String) : [],
        texto: corpo.alvo?.texto ? String(corpo.alvo.texto) : "",
      },
      contexto: corpo.contexto && typeof corpo.contexto === "object" ? corpo.contexto : {},
      arquivos: Array.isArray(corpo.arquivos) ? corpo.arquivos : [],
      instrucoes: String(corpo.instrucoes ?? ""),
    });
    after(() => rodarAnalise(analise.id));
    return NextResponse.json(analise);
  } catch (e) {
    return erroJson(e);
  }
}
