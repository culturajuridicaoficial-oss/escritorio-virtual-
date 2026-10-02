import { NextResponse } from "next/server";
import { erroJson, exigirEquipe } from "@/lib/equipe";
import { criarPedido } from "@/lib/fabrica";

export const maxDuration = 300;

// Pedido feito no painel do projeto. O time de copy escreve na hora; o painel
// depois pede a produção de cada peça (estáticos e vídeos) em paralelo.
export async function POST(req: Request) {
  const auth = await exigirEquipe(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const corpo = await req.json();
    const texto = String(corpo.texto ?? "").trim();
    if (!texto) return NextResponse.json({ erro: "Escreva o que você quer que o time faça." }, { status: 400 });
    return NextResponse.json(
      await criarPedido({
        slug: corpo.projeto,
        funilId: String(corpo.funil ?? ""),
        autor: auth.email,
        texto,
        entregas: corpo.entregas,
        links: Array.isArray(corpo.links) ? corpo.links.map(String).filter((l: string) => /^https?:\/\//.test(l)) : [],
        referencias: Array.isArray(corpo.referencias) ? corpo.referencias : [],
      }),
    );
  } catch (e) {
    return erroJson(e);
  }
}
