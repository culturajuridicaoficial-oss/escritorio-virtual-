import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { PaginaDeVendas, type CopyDaPagina, type OfertaDaPagina } from "@/components/pagina/PaginaDeVendas";

export const dynamic = "force-dynamic";

// Página de vendas pública. Só aparece depois de aprovada no /painel.
export default async function PaginaPublica({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data } = await supabaseAdmin()
    .from("criativos")
    .select("copy, status, tipo, ofertas(titulo, promessa, preco, bonus, garantia, checkout_url), projetos(briefing)")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.tipo !== "pagina" || !["aprovado", "publicado"].includes(data.status)) notFound();

  const briefing = (data.projetos as unknown as { briefing: { identidade_visual?: { cores?: string[] } } | null }).briefing;
  return (
    <PaginaDeVendas
      pagina={data.copy as CopyDaPagina}
      oferta={data.ofertas as unknown as OfertaDaPagina}
      cor={briefing?.identidade_visual?.cores?.[0]}
    />
  );
}
