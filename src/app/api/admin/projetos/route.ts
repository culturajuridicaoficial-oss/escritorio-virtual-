import { NextResponse } from "next/server";
import { erroJson, exigirAdmin } from "@/lib/equipe";
import { criarProjeto, listarProjetos, ocultarProjeto } from "@/lib/projetosAdmin";

// Só administradores: lista os projetos e cria um novo com o squad completo.
export async function GET(req: Request) {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    return NextResponse.json({ projetos: await listarProjetos() });
  } catch (e) {
    return erroJson(e);
  }
}

// { nome, sigla, meta? } -> projeto criado
export async function POST(req: Request) {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const corpo = await req.json();
    const projeto = await criarProjeto({
      nome: String(corpo.nome ?? ""),
      sigla: String(corpo.sigla ?? ""),
      meta: corpo.meta ? Number(corpo.meta) : null,
      autor: auth.email,
    });
    return NextResponse.json({ projeto });
  } catch (e) {
    return erroJson(e, 400);
  }
}

// { id, oculto } -> esconde ou mostra o escritório nas páginas públicas
export async function PATCH(req: Request) {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const corpo = await req.json();
    await ocultarProjeto(String(corpo.id ?? ""), !!corpo.oculto);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroJson(e, 400);
  }
}
