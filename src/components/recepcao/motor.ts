import {
  CORES_CONFETE,
  FONTE_TITULO,
  FONTE_TEXTO,
  MARCA,
  aparencia,
  caixa,
  desenharBoneco,
  desenharChao,
  desenharLogo,
  desenharPlanta,
  etiqueta,
  type Ponto,
} from "../escritorio/pixel";

// Recepção do Grupo NKZ: o saguão com o logotipo na parede e uma porta para
// cada escritório. Cada venda traz um cliente que atravessa o saguão e entra
// pela porta do projeto; quando um projeto bate a meta, a recepção comemora.

export const MUNDO_RECEPCAO = { w: 1600, h: 900 };

const PAREDE_H = 570;
const PORTA = { w: 170, h: 250 };
const BALCAO = { x: 800, y: 735 };
const VELOCIDADE = 170;
const DURACAO_FESTA = 9000;

export type PortaInfo = { slug: string; nome: string };
export type RetanguloPorta = { slug: string; x: number; y: number; w: number; h: number };

/** Posição de cada porta no mundo (o React usa para posicionar os links clicáveis). */
export function posicoesDasPortas(portas: PortaInfo[]): RetanguloPorta[] {
  const n = portas.length;
  return portas.map((p, i) => {
    const cx = (MUNDO_RECEPCAO.w * (i + 1)) / (n + 1);
    return { slug: p.slug, x: cx - PORTA.w / 2, y: PAREDE_H - PORTA.h, w: PORTA.w, h: PORTA.h };
  });
}

type Cliente = {
  pos: Ponto;
  rota: Ponto[];
  slug: string;
  pele: string;
  cabelo: string;
  roupa: string;
  passo: number;
  fala: string;
  sumindo: number; // 1 = visível, 0 = já entrou
};

type Confete = { x: number; y: number; vx: number; vy: number; cor: string; vida: number };

const FALAS_RECEPCAO = [
  "Bem-vindo ao Grupo NKZ!",
  "Escolha um escritório 👆",
  "Os squads estão a todo vapor",
];
const ROUPAS_CLIENTE = ["#3e63dd", "#e5484d", "#8e4ec6", "#f76b15", "#12a594", "#d6409f"];

export class MotorRecepcao {
  private ctx: CanvasRenderingContext2D;
  private portas: RetanguloPorta[];
  private nomes = new Map<string, string>();
  private clientes: Cliente[] = [];
  private confetes: Confete[] = [];
  private aberturaPorta = new Map<string, number>(); // até quando a porta fica aberta
  private brilhoPorta = new Map<string, number>(); // até quando a porta brilha (venda)
  private metaBatida = new Set<string>();
  private festaAte = 0;
  private festaTitulo = "";
  private proximoConfete = 0;
  private ultimoQuadro = 0;
  private escala = 1;
  private recepcionista = aparencia("recepcao-nkz");
  private falaRecepcao = FALAS_RECEPCAO[0];
  private falaTemporaria: { texto: string; ate: number } | null = null;
  private proximaFala = 0;
  hover: string | null = null;
  /** Fala da recepcionista numa venda: "Venda no <porta>!" (no hall do projeto: "Venda na"). */
  prefixoVenda = "Venda no";
  /** Nome na parede no lugar do logotipo do grupo (usado no hall de cada projeto). */
  tituloDaParede: string | null = null;
  /** Falas da recepcionista quando não há nada acontecendo. */
  falasPadrao = FALAS_RECEPCAO;

  constructor(private canvas: HTMLCanvasElement, portas: PortaInfo[]) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponível");
    this.ctx = ctx;
    this.portas = posicoesDasPortas(portas);
    for (const p of portas) this.nomes.set(p.slug, p.nome);
  }

  redimensionar(larguraCss: number) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(larguraCss * dpr);
    this.canvas.height = Math.round(larguraCss * (MUNDO_RECEPCAO.h / MUNDO_RECEPCAO.w) * dpr);
    this.escala = this.canvas.width / MUNDO_RECEPCAO.w;
  }

  marcarMetaBatida(slug: string) {
    this.metaBatida.add(slug);
  }

  /** Venda: um cliente entra pelo saguão e atravessa a porta do projeto. */
  venda(slug: string, valor: number | null) {
    const porta = this.portas.find((p) => p.slug === slug);
    if (!porta) return;
    const agora = performance.now();
    const cx = porta.x + porta.w / 2;
    const semente = `${slug}-${agora}`;
    this.clientes.push({
      pos: { x: BALCAO.x + (Math.random() - 0.5) * 200, y: MUNDO_RECEPCAO.h + 40 },
      rota: [
        { x: cx + (Math.random() - 0.5) * 40, y: PAREDE_H + 70 },
        { x: cx, y: PAREDE_H + 8 },
      ],
      slug,
      ...aparencia(semente),
      roupa: ROUPAS_CLIENTE[Math.floor(Math.random() * ROUPAS_CLIENTE.length)],
      passo: 0,
      fala: valor ? `Comprei! ${valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : "Comprei! 🎉",
      sumindo: 1,
    });
    this.brilhoPorta.set(slug, agora + 4000);
    this.falaTemporaria = { texto: `${this.prefixoVenda} ${this.nomes.get(slug)}! 🔔`, ate: agora + 4000 };
  }

  /** Meta batida: faixa, confete e todo mundo pulando. */
  comemorarMeta(slug: string, titulo?: string) {
    const agora = performance.now();
    this.metaBatida.add(slug);
    this.festaAte = agora + DURACAO_FESTA;
    this.festaTitulo = titulo ?? `🏆 ${this.nomes.get(slug) ?? ""} bateu a meta do dia!`;
    this.proximoConfete = agora;
    this.falaTemporaria = { texto: "META BATIDA! 🏆", ate: agora + DURACAO_FESTA - 1000 };
  }

  passo(agora: number) {
    const dt = Math.min(0.05, (agora - (this.ultimoQuadro || agora)) / 1000);
    this.ultimoQuadro = agora;

    for (const c of this.clientes) {
      const alvo = c.rota[0];
      if (alvo) {
        const dx = alvo.x - c.pos.x;
        const dy = alvo.y - c.pos.y;
        const dist = Math.hypot(dx, dy);
        const andar = VELOCIDADE * dt;
        c.passo += dt * 9;
        if (dist <= andar) {
          c.pos = { ...alvo };
          c.rota.shift();
          if (c.rota.length === 1) this.aberturaPorta.set(c.slug, agora + 1800);
        } else {
          c.pos.x += (dx / dist) * andar;
          c.pos.y += (dy / dist) * andar;
        }
      } else {
        c.sumindo -= dt * 2;
      }
    }
    this.clientes = this.clientes.filter((c) => c.sumindo > 0);

    if (agora > this.proximaFala) {
      this.proximaFala = agora + 7000;
      const falas = this.falasPadrao;
      this.falaRecepcao = falas[(falas.indexOf(this.falaRecepcao) + 1) % falas.length];
    }
    if (this.falaTemporaria && agora > this.falaTemporaria.ate) this.falaTemporaria = null;

    if (agora < this.festaAte && agora > this.proximoConfete) {
      this.proximoConfete = agora + 700;
      for (let i = 0; i < 60; i++) {
        this.confetes.push({
          x: Math.random() * MUNDO_RECEPCAO.w,
          y: -20 - Math.random() * 200,
          vx: (Math.random() - 0.5) * 120,
          vy: 80 + Math.random() * 160,
          cor: CORES_CONFETE[i % CORES_CONFETE.length],
          vida: 5,
        });
      }
    }
    this.confetes = this.confetes.filter((c) => (c.vida -= dt) > 0);
    for (const c of this.confetes) {
      c.vy += 500 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
    }
  }

  desenhar(agora: number) {
    const ctx = this.ctx;
    const { w, h } = MUNDO_RECEPCAO;
    ctx.setTransform(this.escala, 0, 0, this.escala, 0, 0);
    desenharChao(ctx, w, h);
    this.desenharParede();
    if (this.tituloDaParede) this.desenharNomeDoProjeto(this.tituloDaParede);
    else desenharLogo(ctx, w / 2, 44, 200);
    for (const p of this.portas) this.desenharPorta(p, agora);
    this.desenharSaguao();

    const pulo = agora < this.festaAte ? -Math.abs(Math.sin(agora / 140)) * 14 : 0;
    // recepcionista atrás do balcão
    desenharBoneco(ctx, BALCAO.x, BALCAO.y - 34 + pulo, {
      roupa: MARCA.verde,
      ...this.recepcionista,
      passo: 0,
      andando: false,
      deFrente: true,
    });
    this.desenharBalcao();
    this.balao(this.falaTemporaria?.texto ?? this.falaRecepcao, BALCAO.x, BALCAO.y - 102, !!this.falaTemporaria);

    for (const c of [...this.clientes].sort((a, b) => a.pos.y - b.pos.y)) {
      ctx.globalAlpha = Math.max(0, c.sumindo);
      desenharBoneco(ctx, c.pos.x, c.pos.y + (agora < this.festaAte ? pulo : 0), {
        roupa: c.roupa,
        pele: c.pele,
        cabelo: c.cabelo,
        passo: c.passo,
        andando: c.rota.length > 0,
        deFrente: false,
      });
      if (c.rota.length > 0) this.balao(c.fala, c.pos.x, c.pos.y - 66, true);
      ctx.globalAlpha = 1;
    }

    if (agora < this.festaAte) this.desenharFaixa(agora);
    for (const c of this.confetes) {
      ctx.fillStyle = c.cor;
      ctx.globalAlpha = Math.min(1, c.vida);
      ctx.fillRect(c.x, c.y, 7, 4);
    }
    ctx.globalAlpha = 1;
  }

  /** Nome do projeto na parede, no mesmo espaço e estilo do logotipo do grupo. */
  private desenharNomeDoProjeto(nome: string) {
    const ctx = this.ctx;
    const cx = MUNDO_RECEPCAO.w / 2;
    const comEspaco = (px: number) => {
      if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
    };
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    // "ESCRITÓRIO" no lugar de "GRUPO", com os traços verdes dos lados
    ctx.fillStyle = MARCA.gelo;
    ctx.font = `700 30px ${FONTE_TITULO}`;
    comEspaco(14);
    ctx.fillText("ESCRITÓRIO", cx + 7, 86);
    const metade = ctx.measureText("ESCRITÓRIO").width / 2;
    comEspaco(0);
    ctx.strokeStyle = MARCA.verde;
    ctx.lineWidth = 2;
    for (const lado of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + lado * (metade + 24), 76);
      ctx.lineTo(cx + lado * (metade + 134), 76);
      ctx.stroke();
    }

    // Nome do projeto grande; diminui até caber na parede
    const texto = nome.toUpperCase();
    let tamanho = 112;
    ctx.font = `700 ${tamanho}px ${FONTE_TITULO}`;
    while (ctx.measureText(texto).width > MUNDO_RECEPCAO.w - 260 && tamanho > 40) {
      tamanho -= 4;
      ctx.font = `700 ${tamanho}px ${FONTE_TITULO}`;
    }
    ctx.fillStyle = MARCA.gelo;
    ctx.fillText(texto, cx, 112 + tamanho * 0.78);
  }

  private desenharParede() {
    const ctx = this.ctx;
    const { w } = MUNDO_RECEPCAO;
    const grad = ctx.createLinearGradient(0, 0, 0, PAREDE_H);
    grad.addColorStop(0, "#0b0d0c");
    grad.addColorStop(1, "#141816");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, PAREDE_H);
    // painéis verticais e frisos de luz
    ctx.strokeStyle = "rgba(245,245,243,0.04)";
    for (let x = 80; x < w; x += 160) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, PAREDE_H);
      ctx.stroke();
    }
    ctx.fillStyle = MARCA.verde;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(0, 14, w, 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = MARCA.movelSombra;
    ctx.fillRect(0, PAREDE_H - 6, w, 6);
    ctx.fillStyle = MARCA.painelBorda;
    ctx.fillRect(0, PAREDE_H, w, 1);
  }

  private desenharPorta(p: RetanguloPorta, agora: number) {
    const ctx = this.ctx;
    const nome = this.nomes.get(p.slug) ?? p.slug;
    const aberta = Math.max(0, Math.min(1, ((this.aberturaPorta.get(p.slug) ?? 0) - agora) / 400));
    const brilho = (this.brilhoPorta.get(p.slug) ?? 0) > agora;
    const destaque = this.hover === p.slug || brilho;

    // luz no chão
    if (destaque) {
      const luz = ctx.createRadialGradient(p.x + p.w / 2, PAREDE_H, 10, p.x + p.w / 2, PAREDE_H, 160);
      luz.addColorStop(0, "rgba(0,194,110,0.35)");
      luz.addColorStop(1, "rgba(0,194,110,0)");
      ctx.fillStyle = luz;
      ctx.fillRect(p.x - 120, PAREDE_H - 160, p.w + 240, 320);
    }

    // batente
    ctx.fillStyle = MARCA.movel;
    ctx.fillRect(p.x - 10, p.y - 10, p.w + 20, p.h + 10);
    // vão (escuro, aparece quando a porta abre)
    ctx.fillStyle = "#050605";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    // folhas de vidro que deslizam para os lados
    const folha = (p.w / 2) * (1 - aberta * 0.85);
    for (const lado of [0, 1]) {
      const fx = lado === 0 ? p.x : p.x + p.w - folha;
      const vidro = ctx.createLinearGradient(fx, p.y, fx + folha, p.y + p.h);
      vidro.addColorStop(0, "#1b2420");
      vidro.addColorStop(1, "#0f1512");
      ctx.fillStyle = vidro;
      ctx.fillRect(fx, p.y, folha, p.h);
      ctx.strokeStyle = destaque ? MARCA.verde : "rgba(0,194,110,0.25)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(fx + 0.5, p.y + 0.5, folha - 1, p.h - 1);
      // reflexo
      ctx.fillStyle = "rgba(245,245,243,0.05)";
      ctx.beginPath();
      ctx.moveTo(fx + folha * 0.2, p.y);
      ctx.lineTo(fx + folha * 0.45, p.y);
      ctx.lineTo(fx + folha * 0.1, p.y + p.h);
      ctx.lineTo(fx, p.y + p.h);
      ctx.closePath();
      ctx.fill();
    }
    // puxadores
    ctx.fillStyle = MARCA.gelo;
    ctx.fillRect(p.x + p.w / 2 - 12 - (p.w / 2 - folha), p.y + p.h / 2 - 30, 3, 60);
    ctx.fillRect(p.x + p.w / 2 + 9 + (p.w / 2 - folha), p.y + p.h / 2 - 30, 3, 60);

    // monograma no vidro
    ctx.fillStyle = "rgba(245,245,243,0.12)";
    ctx.font = `700 22px ${FONTE_TITULO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("NKZ", p.x + p.w / 2, p.y + 46);

    // placa com o nome do projeto
    ctx.font = `700 15px ${FONTE_TITULO}`;
    const texto = nome.toUpperCase();
    const largura = Math.max(p.w + 20, ctx.measureText(texto).width + 44);
    const px = p.x + p.w / 2 - largura / 2;
    const py = p.y - 52;
    ctx.fillStyle = MARCA.onix;
    caixa(ctx, px, py, largura, 32, 4);
    ctx.fill();
    ctx.strokeStyle = destaque ? MARCA.verde : MARCA.painelBorda;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // LED: verde aceso se bateu a meta, pulsando quando acabou de vender
    const led = this.metaBatida.has(p.slug) ? MARCA.verde : brilho ? (Math.floor(agora / 200) % 2 ? MARCA.verdeClaro : MARCA.verde) : "#3a403c";
    ctx.fillStyle = led;
    ctx.beginPath();
    ctx.arc(px + 14, py + 16, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = MARCA.gelo;
    ctx.textAlign = "center";
    ctx.fillText(texto, p.x + p.w / 2 + 6, py + 17);
    if (this.metaBatida.has(p.slug)) {
      ctx.font = `20px ${FONTE_TEXTO}`;
      ctx.fillText("🏆", px + largura - 4, py - 4);
    }

    // tapete
    ctx.fillStyle = MARCA.verdeEscuro;
    ctx.fillRect(p.x + 15, PAREDE_H + 4, p.w - 30, 22);
    ctx.fillStyle = MARCA.verde;
    ctx.fillRect(p.x + 15, PAREDE_H + 24, p.w - 30, 2);
  }

  private desenharSaguao() {
    const ctx = this.ctx;
    const { w, h } = MUNDO_RECEPCAO;
    // sofás e plantas
    ctx.fillStyle = "#26302b";
    caixa(ctx, 90, 720, 230, 60, 14);
    ctx.fill();
    caixa(ctx, w - 320, 720, 230, 60, 14);
    ctx.fill();
    ctx.fillStyle = MARCA.movel;
    caixa(ctx, 170, 805, 70, 40, 8);
    ctx.fill();
    caixa(ctx, w - 240, 805, 70, 40, 8);
    ctx.fill();
    for (const [x, y] of [[60, 640], [w - 60, 640], [60, 870], [w - 60, 870], [520, 870], [w - 520, 870]]) {
      desenharPlanta(ctx, x, y);
    }
    // entrada de vidro no rodapé
    ctx.fillStyle = "rgba(0,194,110,0.5)";
    ctx.fillRect(w / 2 - 160, h - 6, 320, 3);
  }

  private desenharBalcao() {
    const ctx = this.ctx;
    const larg = 360;
    ctx.fillStyle = MARCA.movel;
    caixa(ctx, BALCAO.x - larg / 2, BALCAO.y - 40, larg, 80, 10);
    ctx.fill();
    ctx.fillStyle = MARCA.verde;
    ctx.fillRect(BALCAO.x - larg / 2 + 10, BALCAO.y - 40, larg - 20, 3);
    ctx.fillStyle = MARCA.gelo;
    ctx.font = `600 13px ${FONTE_TITULO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "4px";
    ctx.fillText("RECEPÇÃO", BALCAO.x + 2, BALCAO.y + 8);
    if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px";
    etiqueta(ctx, "Recepção NKZ", BALCAO.x, BALCAO.y + 48);
  }

  private balao(texto: string, cx: number, base: number, destaque: boolean) {
    const ctx = this.ctx;
    ctx.font = `600 13px ${FONTE_TEXTO}`;
    const w = ctx.measureText(texto).width + 20;
    const h = 26;
    ctx.fillStyle = destaque ? MARCA.verde : MARCA.gelo;
    caixa(ctx, cx - w / 2, base - h, w, h, 6);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 5, base);
    ctx.lineTo(cx, base + 6);
    ctx.lineTo(cx + 5, base);
    ctx.fill();
    ctx.fillStyle = MARCA.onix;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(texto, cx, base - h / 2 + 0.5);
  }

  private desenharFaixa(agora: number) {
    const ctx = this.ctx;
    const restante = this.festaAte - agora;
    const entrada = Math.min(1, (DURACAO_FESTA - restante) / 400);
    const saida = Math.min(1, restante / 400);
    const pulso = 1 + Math.sin(agora / 160) * 0.03;
    ctx.save();
    ctx.globalAlpha = Math.min(entrada, saida);
    ctx.translate(MUNDO_RECEPCAO.w / 2, 640);
    ctx.scale(pulso * entrada, pulso * entrada);
    ctx.font = `700 40px ${FONTE_TITULO}`;
    const w = ctx.measureText(this.festaTitulo).width + 80;
    ctx.fillStyle = MARCA.onix;
    caixa(ctx, -w / 2, -40, w, 80, 8);
    ctx.fill();
    ctx.strokeStyle = MARCA.verde;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = MARCA.gelo;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.festaTitulo, 0, 2);
    ctx.restore();
  }
}
