import { NextResponse } from "next/server";
import { erroJson, exigirEquipe } from "@/lib/equipe";
import { urlParaEnviarReferencia } from "@/lib/fabrica";

// Devolve uma URL assinada para o painel enviar o anexo direto ao armazenamento.
export async function POST(req: Request) {
  const auth = await exigirEquipe(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const { projeto, nome } = await req.json();
    if (!projeto || !nome) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
    return NextResponse.json(await urlParaEnviarReferencia(String(projeto), String(nome)));
  } catch (e) {
    return erroJson(e);
  }
}
