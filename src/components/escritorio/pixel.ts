// Peças de desenho compartilhadas entre a recepção e os escritórios,
// na identidade visual do Grupo NKZ (guia de marca v3.0).

export const MARCA = {
  onix: "#0A0A0A",
  gelo: "#F5F5F3",
  verde: "#00C26E",
  verdeClaro: "#5EF0A8",
  verdeEscuro: "#0B2A1C",
  chao: "#0E100F",
  painel: "#151917",
  painelBorda: "rgba(0, 194, 110, 0.35)",
  grade: "rgba(0, 194, 110, 0.06)",
  movel: "#2A2F2C",
  movelSombra: "#1D211F",
  cinza: "#8C938F",
  ouro: "#F5B82E",
  ouroEscuro: "#C98D12",
};

export const FONTE_TITULO = '"Space Grotesk", system-ui, sans-serif';
export const FONTE_TEXTO = 'Inter, system-ui, sans-serif';

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
  ctx.fillStyle = "#1f9d5c";
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
 * Logotipo "GRUPO / NKZ / ECOSSISTEMA DE VENDAS ONLINE" desenhado com formas
 * (a perna inferior do K em verde, como no guia). `x` é o centro e `y` o topo.
 */
export function desenharLogo(ctx: CanvasRenderingContext2D, cx: number, y: number, altura: number) {
  const u = altura / 5; // unidade X do guia: o monograma tem 3X de altura útil aqui
  const hMono = u * 2.6;
  const topoMono = y + u * 1.15;
  const largLetra = hMono * 0.92;
  const espaco = hMono * 0.12;
  const larguraTotal = largLetra * 3 + espaco * 2;
  const x0 = cx - larguraTotal / 2;
  const traco = hMono * 0.24;

  // GRUPO
  ctx.fillStyle = MARCA.gelo;
  ctx.font = `700 ${u * 0.78}px ${FONTE_TITULO}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${u * 0.35}px`;
  ctx.fillText("GRUPO", cx + u * 0.17, y);
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px";
  ctx.strokeStyle = MARCA.verde;
  ctx.lineWidth = Math.max(1, u * 0.05);
  for (const lado of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + lado * larguraTotal * 0.3, y + u * 0.4);
    ctx.lineTo(cx + lado * larguraTotal * 0.5, y + u * 0.4);
    ctx.stroke();
  }

  const t = topoMono;
  const b = topoMono + hMono;
  const poligono = (pontos: number[][], cor: string) => {
    ctx.fillStyle = cor;
    ctx.beginPath();
    pontos.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    ctx.fill();
  };

  // N
  let x = x0;
  poligono([[x, t], [x + traco, t], [x + traco, b], [x, b]], MARCA.gelo);
  poligono([[x + largLetra - traco, t], [x + largLetra, t], [x + largLetra, b], [x + largLetra - traco, b]], MARCA.gelo);
  poligono([[x, t], [x + traco * 1.25, t], [x + largLetra, b], [x + largLetra - traco * 1.25, b]], MARCA.gelo);

  // K (perna de cima branca, perna de baixo verde)
  x = x0 + largLetra + espaco;
  const meio = t + hMono * 0.55;
  poligono([[x, t], [x + traco, t], [x + traco, b], [x, b]], MARCA.gelo);
  poligono([[x + traco, meio], [x + largLetra - traco * 1.3, t], [x + largLetra, t], [x + traco, meio + traco * 1.1]], MARCA.gelo);
  poligono([[x + traco * 1.4, meio - traco * 0.2], [x + traco * 2.6, meio - traco * 0.2], [x + largLetra, b], [x + largLetra - traco * 1.3, b]], MARCA.verde);

  // Z
  x = x0 + (largLetra + espaco) * 2;
  poligono([[x, t], [x + largLetra, t], [x + largLetra, t + traco], [x, t + traco]], MARCA.gelo);
  poligono([[x, b - traco], [x + largLetra, b - traco], [x + largLetra, b], [x, b]], MARCA.gelo);
  poligono([[x + largLetra - traco * 1.35, t + traco], [x + largLetra, t + traco], [x + traco * 1.35, b - traco], [x, b - traco]], MARCA.gelo);

  // ECOSSISTEMA DE VENDAS ONLINE
  ctx.fillStyle = MARCA.verde;
  ctx.font = `500 ${u * 0.42}px ${FONTE_TITULO}`;
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${u * 0.18}px`;
  ctx.fillText("ECOSSISTEMA DE VENDAS ONLINE", cx + u * 0.09, b + u * 0.45);
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px";
}
