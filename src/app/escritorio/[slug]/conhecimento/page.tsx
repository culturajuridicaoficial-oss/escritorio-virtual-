import { Conhecimento } from "@/components/painel/Conhecimento";

export const metadata = { title: "Conhecimento · Cultura Jurídica" };

export default async function ConhecimentoDoProjeto({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Conhecimento slug={slug} />;
}
