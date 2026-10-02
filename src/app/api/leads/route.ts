import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { registrarLead } from "@/lib/crm";
import { nomeCurto, registrarEvento } from "@/lib/eventos";

// Formulários das páginas de vendas -> CRM ("Para atender"). Público: as páginas ficam em
// outros domínios. Exemplo de envio (fetch no submit do formulário):
//   POST https://<dominio>/api/leads
//   { "projeto": "cultura-juridica", "nome": "Ana", "telefone": "(11) 98765-4321",
//     "email": "ana@email.com", "funil": "CJ-CUR-01", "utm": { "utm_source": "meta" } }
// O campo "site" é uma armadilha para robôs: deixe-o escondido e vazio no formulário.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const Cadastro = z.object({
  projeto: z.string().min(1).max(80),
  nome: z.string().max(120).optional(),
  telefone: z.string().max(40).optional(),
  email: z.string().email().max(160).optional().or(z.literal("")),
  funil: z.string().max(40).optional(),
  utm: z.record(z.string(), z.string().max(300)).optional(),
  site: z.string().max(0).optional(), // armadilha para robôs
});

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);
  const dados = Cadastro.safeParse(corpo);
  if (!dados.success) return NextResponse.json({ erro: "Dados inválidos." }, { status: 400, headers: CORS });
  const d = dados.data;

  const { data: projeto } = await supabaseAdmin().from("projetos").select("id, slug").eq("slug", d.projeto).eq("ativo", true).maybeSingle();
  if (!projeto) return NextResponse.json({ erro: "Projeto não encontrado." }, { status: 404, headers: CORS });

  try {
    const { novo } = await registrarLead({
      projetoId: projeto.id,
      telefone: d.telefone,
      email: d.email || null,
      nome: d.nome,
      origem: "formulario",
      funilCodigo: d.funil ?? null,
      utm: d.utm ?? null,
    });
    if (novo) {
      await registrarEvento({
        projetoId: projeto.id,
        slug: projeto.slug,
        funcao: "comercial-popup",
        tipo: "mensagem_lead",
        mensagem: `Novo lead: ${nomeCurto(d.nome)}`,
      });
    }
    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400, headers: CORS });
  }
}
