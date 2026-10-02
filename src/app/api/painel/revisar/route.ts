import { NextResponse } from "next/server";
import { erroJson, exigirEquipe } from "@/lib/equipe";
import { revisar } from "@/lib/fabrica";

export async function POST(req: Request) {
  const auth = await exigirEquipe(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const { tipo, id, decisao, motivo } = await req.json();
    if (!["oferta", "criativo"].includes(tipo) || !["aprovar", "reprovar"].includes(decisao)) {
      return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
    }
    return NextResponse.json(await revisar({ tipo, id, decisao, motivo, revisor: auth.email }));
  } catch (e) {
    return erroJson(e);
  }
}
