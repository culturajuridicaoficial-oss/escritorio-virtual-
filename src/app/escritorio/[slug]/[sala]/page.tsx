import { notFound } from "next/navigation";
import { Escritorio } from "@/components/escritorio/Escritorio";

export default async function PaginaDaSala({ params }: { params: Promise<{ slug: string; sala: string }> }) {
  const { slug, sala } = await params;
  if (sala !== "marketing" && sala !== "comercial") notFound();
  return <Escritorio slug={slug} sala={sala} />;
}
