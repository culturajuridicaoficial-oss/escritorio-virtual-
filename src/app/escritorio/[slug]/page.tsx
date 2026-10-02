import { HallDoProjeto } from "@/components/recepcao/HallDoProjeto";

export default async function PaginaDoProjeto({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <HallDoProjeto slug={slug} />;
}
