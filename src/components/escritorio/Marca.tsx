import Link from "next/link";

/** Assinatura "CULTURA JURÍDICA" do topo, nas cores do site (preto, branco e dourado). */
export function Marca({ subtitulo }: { subtitulo: string }) {
  return (
    <Link href="/" className="marca" aria-label="Cultura Jurídica: voltar para a recepção">
      <span className="marca-nome">
        CULTURA <b>JURÍ<i>DICA</i></b>
      </span>
      <span className="marca-sub">{subtitulo}</span>
    </Link>
  );
}
