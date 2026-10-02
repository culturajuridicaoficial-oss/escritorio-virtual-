import Link from "next/link";

/** Assinatura "GRUPO NKZ" do topo, no padrão do guia de marca. */
export function Marca({ subtitulo }: { subtitulo: string }) {
  return (
    <Link href="/" className="marca" aria-label="Grupo NKZ: voltar para a recepção">
      <span className="marca-nome">
        GRUPO <b>N<i>K</i>Z</b>
      </span>
      <span className="marca-sub">{subtitulo}</span>
    </Link>
  );
}
