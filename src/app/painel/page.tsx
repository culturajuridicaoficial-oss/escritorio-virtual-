import { EntradaDoPainel } from "@/components/painel/Painel";

// O painel fica dentro de cada escritório (/escritorio/<projeto>/painel).
// Aqui só chega o link de login do e-mail, que volta para o painel de onde a pessoa veio.
export const metadata = { title: "Entrando · Cultura Jurídica" };

export default function EntradaPainel() {
  return <EntradaDoPainel />;
}
