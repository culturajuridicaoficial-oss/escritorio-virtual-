import type { Metadata } from "next";
import { Admin } from "@/components/painel/Admin";

export const metadata: Metadata = { title: "Administração · Grupo NKZ" };

export default function PaginaAdmin() {
  return <Admin />;
}
