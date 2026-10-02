// Peças de desenho compartilhadas entre a recepção e os escritórios,
// na identidade visual da Cultura Jurídica (preto, branco e dourado do site).

export const MARCA = {
  onix: "#0D0D0F",
  gelo: "#F5F5F3",
  verde: "#D29300",
  verdeClaro: "#F0C35A",
  verdeEscuro: "#2E2205",
  chao: "#0F0F11",
  painel: "#171719",
  painelBorda: "rgba(210, 147, 0, 0.35)",
  grade: "rgba(210, 147, 0, 0.06)",
  movel: "#2C2C2E",
  movelSombra: "#1F1F21",
  cinza: "#8F8F91",
  ouro: "#F5B82E",
  ouroEscuro: "#C98D12",
};

export const FONTE_TITULO = '"Plus Jakarta Sans", system-ui, sans-serif';
export const FONTE_TEXTO = '"DM Sans", system-ui, sans-serif';

export const CORES_CONFETE = [MARCA.verde, MARCA.verdeClaro, MARCA.gelo, MARCA.ouro];
const PELES = ["#f2c9a0", "#e0ac7e", "#c68a5a", "#8d5a3b", "#5e3a24"];
const CABELOS = ["#2b1d14", "#4a2f1d", "#7a4b28", "#c58b3c", "#1c1c1c", "#8a8a8a", "#a33b2b"];

export type Ponto = { x: number; y: number };

export function hash(texto: string): number {
  let h = 0;
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export function aparencia(semente: string) {
  const h = hash(semente);
  return { pele: PELES[h % PELES.length], cabelo: CABELOS[(h >> 3) % CABELOS.length] };
}

export function caixa(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Boneco em pixel art com os pés em (x, y). */
export function desenharBoneco(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  opcoes: { roupa: string; pele: string; cabelo: string; passo: number; andando: boolean; deFrente: boolean },
) {
  const u = 1.7;
  const perna = opcoes.andando ? Math.sin(opcoes.passo) * 3 : 0;
  x = Math.round(x);
  y = Math.round(y);

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(x, y, 13, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1c1f2b";
  ctx.fillRect(x - 5 * u, y - 9 * u + perna, 4 * u, 9 * u - perna);
  ctx.fillRect(x + 1 * u, y - 9 * u - perna, 4 * u, 9 * u + perna);
  ctx.fillStyle = opcoes.roupa;
  ctx.fillRect(x - 7 * u, y - 21 * u, 14 * u, 13 * u);
  ctx.fillStyle = opcoes.pele;
  ctx.fillRect(x - 9 * u, y - 20 * u - perna / 2, 2 * u, 9 * u);
  ctx.fillRect(x + 7 * u, y - 20 * u + perna / 2, 2 * u, 9 * u);
  ctx.fillRect(x - 5 * u, y - 31 * u, 10 * u, 10 * u);
  ctx.fillStyle = opcoes.cabelo;
  ctx.fillRect(x - 6 * u, y - 33 * u, 12 * u, 4 * u);
  ctx.fillRect(x - 6 * u, y - 30 * u, 2 * u, 5 * u);
  ctx.fillRect(x + 4 * u, y - 30 * u, 2 * u, 5 * u);
  if (opcoes.deFrente) {
    ctx.fillStyle = "#111111";
    ctx.fillRect(x - 3 * u, y - 26 * u, 1.5 * u, 2 * u);
    ctx.fillRect(x + 1.5 * u, y - 26 * u, 1.5 * u, 2 * u);
  }
}

export function desenharPlanta(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = MARCA.movel;
  ctx.fillRect(x - 12, y - 4, 24, 20);
  ctx.fillStyle = "#b07c00";
  for (const [dx, dy, r] of [[0, -18, 12], [-10, -10, 9], [10, -10, 9]]) {
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Chão escuro com a grade técnica do guia de marca. */
export function desenharChao(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = MARCA.chao;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = MARCA.grade;
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

/** Etiqueta escura com detalhe verde (padrão dos crachás e das placas). */
export function etiqueta(
  ctx: CanvasRenderingContext2D,
  texto: string,
  cx: number,
  y: number,
  opcoes: { tamanho?: number; destaque?: boolean; fonte?: string } = {},
) {
  const tamanho = opcoes.tamanho ?? 13;
  ctx.font = `600 ${tamanho}px ${opcoes.fonte ?? FONTE_TEXTO}`;
  const w = ctx.measureText(texto).width + tamanho * 1.4;
  const h = tamanho + 9;
  ctx.fillStyle = opcoes.destaque ? MARCA.verde : MARCA.onix;
  caixa(ctx, cx - w / 2, y, w, h, h / 2);
  ctx.fill();
  if (!opcoes.destaque) {
    ctx.strokeStyle = MARCA.painelBorda;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = opcoes.destaque ? MARCA.onix : MARCA.gelo;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(texto, cx, y + h / 2 + 0.5);
}

/**
 * Logotipo "CULTURA / JURÍDICA / CURSOS DE DIREITO" em texto, com um fio dourado
 * entre as linhas. `x` é o centro e `y` o topo.
 */
export function desenharLogo(ctx: CanvasRenderingContext2D, cx: number, y: number, altura: number) {
  const u = altura / 5;
  const espacar = (px: number) => {
    if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
  };
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // CULTURA
  ctx.fillStyle = MARCA.gelo;
  ctx.font = `700 ${u * 0.78}px ${FONTE_TITULO}`;
  espacar(u * 0.35);
  ctx.fillText("CULTURA", cx + u * 0.17, y);
  const meiaCultura = ctx.measureText("CULTURA").width / 2;

  // JURÍDICA, o destaque em dourado
  ctx.fillStyle = MARCA.verde;
  ctx.font = `800 ${u * 1.7}px ${FONTE_TITULO}`;
  espacar(u * 0.08);
  ctx.fillText("JURÍDICA", cx + u * 0.04, y + u * 1.15);
  const inicio = meiaCultura + u * 0.4;
  const fim = Math.max(inicio + u * 1.2, ctx.measureText("JURÍDICA").width / 2);

  // fios dos lados de CULTURA
  ctx.strokeStyle = MARCA.verde;
  ctx.lineWidth = Math.max(1, u * 0.05);
  for (const lado of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + lado * inicio, y + u * 0.4);
    ctx.lineTo(cx + lado * fim, y + u * 0.4);
    ctx.stroke();
  }

  // CURSOS DE DIREITO
  ctx.fillStyle = MARCA.gelo;
  ctx.font = `500 ${u * 0.42}px ${FONTE_TITULO}`;
  espacar(u * 0.18);
  ctx.fillText("CURSOS DE DIREITO", cx + u * 0.09, y + u * 3.25);
  espacar(0);
}
