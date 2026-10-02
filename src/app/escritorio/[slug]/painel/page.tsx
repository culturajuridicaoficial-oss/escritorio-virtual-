import { Painel } from "@/components/painel/Painel";

export const metadata = { title: "Painel do projeto · Grupo NKZ" };

export default async function PainelDoProjeto({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Painel slug={slug} />;
}
