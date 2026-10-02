import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A Kiwify assina o webhook com HMAC-SHA1 do corpo usando o token do webhook
 * e envia o resultado no parâmetro `?signature=` da URL.
 */
export function assinaturaKiwifyValida(corpo: string, assinatura: string | null, token: string): boolean {
  if (!assinatura) return false;
  const esperado = createHmac("sha1", token).update(corpo).digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(assinatura);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Dicionario = Record<string, unknown>;
const obj = (v: unknown): Dicionario => (v && typeof v === "object" ? (v as Dicionario) : {});
const str = (v: unknown): string | null => (v === undefined || v === null || v === "" ? null : String(v));

/** Valores monetários da Kiwify chegam em centavos. */
function centavos(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n / 100 : null;
}

export type PedidoKiwify = {
  orderId: string;
  status: string;
  evento: string | null;
  produtoId: string | null;
  produtoNome: string | null;
  valor: number | null;
  clienteNome: string | null;
  clienteEmail: string | null;
  clienteTelefone: string | null;
  utm: Dicionario | null;
  metodo: string | null; // pix, boleto, credit_card
  checkoutUrl: string | null;
};

/**
 * Normaliza os dois formatos que a Kiwify envia: pedido (compra, pix, boleto,
 * reembolso, chargeback) e carrinho abandonado. O payload bruto é sempre salvo,
 * então dá para conferir os campos com o primeiro webhook real.
 */
export function lerPedidoKiwify(p: Dicionario): PedidoKiwify | null {
  // Carrinho abandonado: payload "achatado"
  if (p.status === "abandoned" || (p.checkout_link && !p.order_id)) {
    const id = str(p.id);
    if (!id) return null;
    return {
      orderId: `carrinho-${id}`,
      status: "abandoned",
      evento: "abandoned_cart",
      produtoId: str(p.product_id),
      produtoNome: str(p.product_name),
      valor: null,
      clienteNome: str(p.name),
      clienteEmail: str(p.email),
      clienteTelefone: str(p.phone),
      utm: null,
      metodo: null,
      checkoutUrl: str(p.checkout_link),
    };
  }

  const orderId = str(p.order_id);
  if (!orderId) return null;
  const produto = obj(p.Product);
  const cliente = obj(p.Customer);
  const comissoes = obj(p.Commissions);
  return {
    orderId,
    status: str(p.order_status) ?? "desconhecido",
    evento: str(p.webhook_event_type),
    produtoId: str(produto.product_id),
    produtoNome: str(produto.product_name),
    valor: centavos(comissoes.charge_amount ?? comissoes.product_base_price),
    clienteNome: str(cliente.full_name) ?? str(cliente.first_name),
    clienteEmail: str(cliente.email),
    clienteTelefone: str(cliente.mobile),
    utm: p.TrackingParameters ? obj(p.TrackingParameters) : null,
    metodo: str(p.payment_method),
    checkoutUrl: null,
  };
}
