import type { AgenteInfo, EventoInfo } from "./tipos";
import {
  CORES_CONFETE,
  FONTE_TEXTO,
  FONTE_TITULO,
  MARCA,
  aparencia,
  caixa,
  desenharBoneco,
  desenharChao,
  desenharPlanta,
  etiqueta,
  hash,
  type Ponto,
} from "./pixel";

// Motor do escritório virtual: desenha tudo num <canvas> com coordenadas de um
// "mundo" fixo e escala para o tamanho da tela. Com um squad, o escritório é a
// sala daquele projeto; com vários, as salas ficam lado a lado (visão geral).

type Sala = {
  slug: string;
  nome: string;
  x: number;
  y: number;
  w: number;
  h: number;
  portaX: number;
  portaLado: "baixo" | "cima";
  filas: Fila[];
};
/** Uma fila de mesas da Sala de Marketing (um time). */
type Fila = { time: string; x: number; y: number; w: number; agentes: number };

type Avatar = {
  info: AgenteInfo;
  casa: Ponto;
  pos: Ponto;
  sala: Sala;
  pele: string;
  cabelo: string;
  rota: Ponto[];
  modo: "mesa" | "indo" | "parado" | "voltando";
  esperarAte: number;
  aoChegar: (() => void) | null;
  trabalhandoAte: number;
  fala: string | null;
  falaTemporaria: string | null;
  falaTemporariaAte: number;
  passo: number;
  destaqueAte: number;
};

type Confete = { x: number; y: number; vx: number; vy: number; cor: string; vida: number };
type Retangulo = { x: number; y: number; w: number; h: number };

/** As duas salas do escritório de um projeto. */
export type SalaDoProjeto = "marketing" | "comercial";

type Layout = {
  modo: SalaDoProjeto | "geral";
  mundo: { w: number; h: number };
  colunas: number;
  celulaW: number;
  linhas: number;
  /** Sino da venda (não existe na Sala de Marketing). */
  sino: Ponto | null;
  cafe: Ponto;
  /** Sala de resultados (só na visão geral; no escritório do projeto o espaço é da Sala Comercial). */
  reuniao: Retangulo | null;
  mesaReuniao: Retangulo | null;
  copa: Retangulo;
  /** Sala Comercial (só no escritório de um projeto). */
  comercial: Retangulo | null;
  /** Raio horizontal do tapete do sino. */
  tapete: number;
  plantas: Ponto[];
  faixaY: number;
};

const CELULA_H = 170;
const VELOCIDADE = 140; // px por segundo
const COMEMORACOES = ["Parabéns!! 🎉", "Uhuuu! 🙌", "Merecido! 🏆", "É isso aí! 🔥", "👏👏👏"];
const GRITOS_DE_META = ["META BATIDA! 🏆", "BORA!!! 🚀", "É CAMPEÃO! 🥇", "UHUUUU! 🎉", "👏👏👏👏", "QUE DIA! 🔥"];
const DURACAO_FESTA = 9000;

/** Times da Sala de Marketing, na ordem das filas (coluna da esquerda, depois a da direita). */
export const TIMES: Array<{ id: string; nome: string }> = [
  { id: "copy", nome: "Time de Copy" },
  { id: "design", nome: "Time de Design" },
  { id: "trafego", nome: "Time de Tráfego" },
  { id: "bi", nome: "Time de BI" },
  { id: "video", nome: "Edição de Vídeo" },
  { id: "dev", nome: "Programação e Infra" },
];
const FILAS_POR_COLUNA = 3;
/** Espaço entre o título da Sala de Marketing e a primeira fila. */
const TOPO_MARKETING = 80;
const ROTULO_FILA_W = 170;
const CELULA_FILA_W = 140;

/** Tamanho do mundo (o React usa para a proporção do palco). */
export function tamanhoDoMundo(squads: number, sala?: SalaDoProjeto) {
  if (sala === "marketing") return { w: 1600, h: 880 };
  if (sala === "comercial") return { w: 1600, h: 720 };
  // Escritório geral: salas de 3 em 3 por linha; cada linha a mais aumenta a altura.
  return { w: 1920, h: 1080 + (linhasDeSalas(squads) - 1) * (SALA_GERAL_H + 20) };
}

const SALAS_POR_LINHA = 3;
const SALA_GERAL_H = 70 + 3 * CELULA_H;
function linhasDeSalas(squads: number) {
  return Math.max(1, Math.ceil(squads / SALAS_POR_LINHA));
}

function calcularLayout(squads: number, sala?: SalaDoProjeto): Layout {
  const mundo = tamanhoDoMundo(squads, sala);
  const base = { colunas: 3, celulaW: CELULA_FILA_W, linhas: FILAS_POR_COLUNA, reuniao: null, mesaReuniao: null, tapete: 150 };

  if (sala === "marketing") {
    // Sala de Marketing ocupa o andar; embaixo, a copa para o time tomar café.
    const copa = { x: 40, y: 670, w: mundo.w - 80, h: 170 };
    return {
      ...base,
      modo: "marketing",
      mundo,
      sino: null,
      cafe: { x: mundo.w / 2, y: copa.y + 100 },
      copa,
      comercial: null,
      plantas: [{ x: 360, y: copa.y + 80 }, { x: mundo.w - 360, y: copa.y + 80 }],
      faixaY: 640,
    };
  }
  if (sala === "comercial") {
    // Sala Comercial à esquerda; à direita a copa e o sino da venda.
    const comercial = { x: 40, y: 40, w: 1060, h: 520 };
    const copa = { x: 1160, y: 40, w: mundo.w - 40 - 1160, h: 210 };
    return {
      ...base,
      modo: "comercial",
      mundo,
      sino: { x: 1330, y: 450 },
      cafe: { x: copa.x + copa.w * 0.55, y: copa.y + 140 },
      copa,
      comercial,
      plantas: [{ x: 1140, y: 640 }, { x: mundo.w - 30, y: 640 }],
      faixaY: 600,
    };
  }

  const linhas = 3;
  const salaBase = 40 + linhasDeSalas(squads) * (SALA_GERAL_H + 20) - 20;
  const areaY = salaBase + 40;
  const larguraArea = Math.min(560, mundo.w * 0.31);
  const reuniao = { x: 40, y: areaY, w: larguraArea, h: 360 };
  const copa = { x: mundo.w - 40 - larguraArea, y: areaY, w: larguraArea, h: 360 };
  return {
    modo: "geral",
    comercial: null,
    tapete: 150,
    mundo,
    colunas: 5,
    celulaW: 112,
    linhas,
    sino: { x: mundo.w / 2, y: areaY + 210 },
    cafe: { x: copa.x + copa.w * 0.55, y: areaY + 170 },
    reuniao,
    mesaReuniao: { x: reuniao.x + 90, y: areaY + 170, w: reuniao.w - 220, h: 80 },
    copa,
    plantas: [
      { x: reuniao.x + reuniao.w + 46, y: areaY + 20 },
      { x: copa.x - 46, y: areaY + 20 },
      { x: reuniao.x + reuniao.w + 46, y: areaY + 350 },
      { x: copa.x - 46, y: areaY + 350 },
    ],
    faixaY: areaY - 20,
  };
}

export class MotorEscritorio {
  private ctx: CanvasRenderingContext2D;
  private layout: Layout;
  private salas: Sala[] = [];
  private avatares = new Map<string, Avatar>();
  private confetes: Confete[] = [];
  private sinoTocouEm = -Infinity;
  private ultimoQuadro = 0;
  private proximoPasseio = 0;
  private escala = 1;
  private festaAte = 0;
  private festaTitulo = "";
  private proximoConfete = 0;
  /** Chamado sempre que o sino toca (o React liga isso ao som). */
  aoTocarSino: (() => void) | null = null;
  /** Chamado quando um projeto bate a meta e o escritório inteiro comemora. */
  aoComemorarMeta: (() => void) | null = null;

  constructor(private canvas: HTMLCanvasElement, agentes: AgenteInfo[], sala?: SalaDoProjeto) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponível");
    this.ctx = ctx;
    const projetos = [...new Map(agentes.map((a) => [a.projetoSlug, a.projetoNome])).entries()];
    this.layout = calcularLayout(projetos.length, sala);
    this.projetoNome = projetos[0]?.[1] ?? "";
    this.montar(projetos, agentes);
  }

  private projetoNome: string;

  get mundo() {
    return this.layout.mundo;
  }

  private montar(projetos: Array<[string, string]>, agentes: AgenteInfo[]) {
    if (this.layout.modo !== "geral" && projetos.length === 1) {
      this.montarSala(this.layout.modo, projetos[0], agentes);
      return;
    }
    const { mundo, colunas, celulaW, linhas } = this.layout;
    const salaW = colunas * celulaW + 40;
    const salaH = 70 + linhas * CELULA_H;
    this.salas = projetos.map(([slug, nome], i) => {
      // Até 3 salas por linha, cada linha centralizada.
      const linha = Math.floor(i / SALAS_POR_LINHA);
      const naLinha = Math.min(SALAS_POR_LINHA, projetos.length - linha * SALAS_POR_LINHA);
      const largura = naLinha * salaW + (naLinha - 1) * 20;
      const x = (mundo.w - largura) / 2 + (i % SALAS_POR_LINHA) * (salaW + 20);
      const y = 40 + linha * (salaH + 20);
      return { slug, nome, x, y, w: salaW, h: salaH, portaX: x + salaW / 2, portaLado: "baixo", filas: [] };
    });

    for (const sala of this.salas) {
      const squad = agentes.filter((a) => a.projetoSlug === sala.slug).sort((a, b) => a.ordem - b.ordem);
      squad.forEach((info, i) => {
        const col = i % colunas;
        const lin = Math.floor(i / colunas);
        this.criarAvatar(info, sala, { x: sala.x + 20 + col * celulaW + celulaW / 2, y: sala.y + 70 + lin * CELULA_H + 112 });
      });
    }
  }

  /** Uma sala do escritório do projeto: Marketing (uma fila por time) ou Comercial. */
  private montarSala(sala: SalaDoProjeto, [slug, nome]: [string, string], agentes: AgenteInfo[]) {
    const { mundo } = this.layout;
    const ordenar = (lista: AgenteInfo[]) => lista.sort((a, b) => a.ordem - b.ordem);

    if (sala === "marketing") {
      const marketing: Sala = {
        slug,
        nome: `${nome} · Sala de Marketing`,
        x: 40,
        y: 40,
        w: mundo.w - 80,
        h: TOPO_MARKETING + FILAS_POR_COLUNA * CELULA_H,
        portaX: mundo.w / 2,
        portaLado: "baixo",
        filas: [],
      };
      this.salas = [marketing];
      const colunaW = (marketing.w - 40) / 2;
      TIMES.forEach((time, i) => {
        const coluna = Math.floor(i / FILAS_POR_COLUNA);
        const linha = i % FILAS_POR_COLUNA;
        const fila: Fila = {
          time: time.nome,
          x: marketing.x + 20 + coluna * colunaW,
          y: marketing.y + TOPO_MARKETING + linha * CELULA_H,
          w: colunaW - 10,
          agentes: 0,
        };
        const membros = ordenar(agentes.filter((a) => a.time === time.id));
        fila.agentes = membros.length;
        membros.forEach((info, j) => {
          this.criarAvatar(info, marketing, {
            x: fila.x + ROTULO_FILA_W + j * CELULA_FILA_W + CELULA_FILA_W / 2,
            y: fila.y + 112,
          });
        });
        marketing.filas.push(fila);
      });
      return;
    }

    const r = this.layout.comercial!;
    const comercial: Sala = {
      slug,
      nome: `${nome} · Sala Comercial`,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      portaX: r.x + r.w - 90,
      portaLado: "baixo",
      filas: [],
    };
    this.salas = [comercial];
    const doComercial = ordenar(agentes.filter((a) => !TIMES.some((t) => t.id === a.time)));
    // Mesas espaçadas; a sala tem lugar para o time comercial crescer.
    const celula = Math.min(220, (comercial.w - 40) / Math.max(1, doComercial.length));
    const inicio = comercial.x + (comercial.w - doComercial.length * celula) / 2;
    doComercial.forEach((info, j) => {
      this.criarAvatar(info, comercial, { x: inicio + j * celula + celula / 2, y: comercial.y + comercial.h / 2 + 70 });
    });
  }

  private criarAvatar(info: AgenteInfo, sala: Sala, casa: Ponto) {
    this.avatares.set(info.id, {
      info,
      casa,
      pos: { ...casa },
      sala,
      ...aparencia(info.id),
      rota: [],
      modo: "mesa",
      esperarAte: 0,
      aoChegar: null,
      trabalhandoAte: 0,
      fala: info.ultimaFala,
      falaTemporaria: null,
      falaTemporariaAte: 0,
      passo: 0,
      destaqueAte: 0,
    });
  }

  redimensionar(larguraCss: number) {
    const { mundo } = this.layout;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(larguraCss * dpr);
    this.canvas.height = Math.round(larguraCss * (mundo.h / mundo.w) * dpr);
    this.escala = this.canvas.width / mundo.w;
  }

  // ---------------------------------------------------------------- eventos

  aplicar(evento: EventoInfo) {
    const agora = performance.now();
    const avatar = evento.agenteId ? this.avatares.get(evento.agenteId) : undefined;
    if (evento.tipo === "meta_batida" && !avatar) {
      // A meta vale para a sala inteira, mesmo sem o vendedor nela.
      setTimeout(() => this.comemorarMeta(this.projetoNome), 3000);
      return;
    }
    if (!avatar) return;

    avatar.fala = evento.mensagem;
    avatar.info.tarefasHoje += 1;
    avatar.destaqueAte = agora + 2500;

    if (evento.tipo === "meta_batida") {
      // A meta chega junto com a venda que a cruzou: espera o vendedor tocar o sino primeiro.
      const nome = avatar.info.projetoNome;
      setTimeout(() => this.comemorarMeta(nome), avatar.modo === "indo" ? 4200 : 0);
    } else if (evento.tipo === "venda") {
      // Se o agente já estiver fora da mesa (outra venda em seguida), o sino toca na hora.
      const sino = this.layout.sino;
      if (!sino) return;
      if (avatar.modo === "mesa") this.levar(avatar, this.pontoLivre(sino, 40), 4500, () => this.tocarSino(avatar));
      else this.tocarSino(avatar);
    } else if (evento.tipo === "relatorio") {
      const time = [...this.avatares.values()].filter(
        (a) => a.sala.slug === avatar.sala.slug && (a.info.funcaoId.startsWith("analista") || a.info.funcaoId === "ofertas" || a.info.funcaoId.startsWith("copy-")),
      );
      time.forEach((membro, i) => {
        if (this.layout.mesaReuniao) {
          if (membro !== avatar) this.falarPorUm(membro, "Indo pra reunião 📊", 4000);
          this.levar(membro, this.cadeiraReuniao(i), 12000, null);
        } else {
          // Sem sala de reunião: cada um lê o relatório na própria mesa.
          if (membro !== avatar) this.falarPorUm(membro, "Lendo o relatório 📊", 8000);
          membro.trabalhandoAte = agora + 8000;
        }
      });
    } else {
      avatar.trabalhandoAte = agora + 6000;
    }
  }

  /**
   * Tarefa em andamento: o agente fica na mesa trabalhando (monitor piscando) até
   * a tarefa acabar. `titulo` null encerra.
   */
  ocupar(agenteId: string, titulo: string | null) {
    const avatar = this.avatares.get(agenteId);
    if (!avatar) return;
    if (titulo) {
      avatar.trabalhandoAte = Infinity;
      avatar.fala = titulo;
    } else if (avatar.trabalhandoAte === Infinity) {
      avatar.trabalhandoAte = performance.now();
    }
  }

  private tocarSino(vendedor: Avatar) {
    const agora = performance.now();
    const sino = this.layout.sino;
    if (!sino) return;
    this.sinoTocouEm = agora;
    this.aoTocarSino?.();
    for (let i = 0; i < 80; i++) {
      const angulo = Math.random() * Math.PI * 2;
      const forca = 120 + Math.random() * 260;
      this.confetes.push({
        x: sino.x,
        y: sino.y - 120,
        vx: Math.cos(angulo) * forca,
        vy: Math.sin(angulo) * forca - 200,
        cor: CORES_CONFETE[i % CORES_CONFETE.length],
        vida: 2.5,
      });
    }
    this.falarPorUm(vendedor, "VENDEU! 🔔", 4500);
    for (const colega of this.avatares.values()) {
      if (colega.sala.slug === vendedor.sala.slug && colega !== vendedor) {
        this.falarPorUm(colega, COMEMORACOES[hash(colega.info.id + agora) % COMEMORACOES.length], 6000);
      }
    }
  }

  /** Meta do dia batida: todos pulam, gritam e chove confete no escritório inteiro. */
  comemorarMeta(projeto: string) {
    const agora = performance.now();
    this.festaAte = agora + DURACAO_FESTA;
    this.festaTitulo = `🏆 ${projeto} bateu a meta do dia!`;
    this.proximoConfete = agora;
    for (const a of this.avatares.values()) {
      this.falarPorUm(a, GRITOS_DE_META[hash(a.info.id + agora) % GRITOS_DE_META.length], DURACAO_FESTA - 1000);
    }
    this.aoComemorarMeta?.();
  }

  private chuvaDeConfete() {
    for (let i = 0; i < 60; i++) {
      this.confetes.push({
        x: Math.random() * this.layout.mundo.w,
        y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 120,
        vy: 80 + Math.random() * 160,
        cor: CORES_CONFETE[i % CORES_CONFETE.length],
        vida: 5,
      });
    }
  }

  private falarPorUm(avatar: Avatar, texto: string, ms: number) {
    avatar.falaTemporaria = texto;
    avatar.falaTemporariaAte = performance.now() + ms;
  }

  private pontoLivre(centro: Ponto, raio: number): Ponto {
    const ocupados = [...this.avatares.values()].filter((a) => a.modo !== "mesa").length;
    const angulo = ocupados * 1.3;
    return { x: centro.x - 70 + Math.cos(angulo) * raio, y: centro.y + 20 + Math.sin(angulo) * raio };
  }

  private cadeiraReuniao(i: number): Ponto {
    const mesa = this.layout.mesaReuniao ?? { x: 0, y: 0, w: 0, h: 0 };
    const lado = i % 2 === 0 ? -1 : 1;
    const pos = Math.floor(i / 2);
    const x = mesa.x + 30 + pos * Math.max(60, (mesa.w - 60) / 2);
    return lado < 0 ? { x, y: mesa.y - 8 } : { x, y: mesa.y + mesa.h + 44 };
  }

  /** Sai da sala pela porta, vai até o destino, espera e volta para a mesa. */
  private portaDaSala(s: Sala) {
    return s.portaLado === "baixo"
      ? { corredor: s.y + s.h - 12, fora: s.y + s.h + 30 }
      : { corredor: s.y + 14, fora: s.y - 22 };
  }

  private levar(avatar: Avatar, destino: Ponto, permanenciaMs: number, aoChegar: (() => void) | null) {
    if (avatar.modo !== "mesa") return;
    const s = avatar.sala;
    const { corredor, fora } = this.portaDaSala(s);
    avatar.rota = [
      { x: avatar.casa.x, y: corredor },
      { x: s.portaX, y: corredor },
      { x: s.portaX, y: fora },
      destino,
    ];
    avatar.modo = "indo";
    avatar.esperarAte = permanenciaMs;
    avatar.aoChegar = aoChegar;
  }

  private voltar(avatar: Avatar) {
    const s = avatar.sala;
    const { corredor, fora } = this.portaDaSala(s);
    avatar.rota = [
      { x: s.portaX, y: fora },
      { x: s.portaX, y: corredor },
      { x: avatar.casa.x, y: corredor },
      { ...avatar.casa },
    ];
    avatar.modo = "voltando";
  }

  // ---------------------------------------------------------------- simulação

  passo(agora: number) {
    const dt = Math.min(0.05, (agora - (this.ultimoQuadro || agora)) / 1000);
    this.ultimoQuadro = agora;

    for (const a of this.avatares.values()) {
      if (a.falaTemporaria && agora > a.falaTemporariaAte) a.falaTemporaria = null;
      const alvo = a.rota[0];
      if (alvo) {
        const dx = alvo.x - a.pos.x;
        const dy = alvo.y - a.pos.y;
        const dist = Math.hypot(dx, dy);
        const andar = VELOCIDADE * dt;
        a.passo += dt * 8;
        if (dist <= andar) {
          a.pos = { ...alvo };
          a.rota.shift();
          if (a.rota.length === 0) {
            if (a.modo === "indo") {
              a.modo = "parado";
              a.esperarAte = agora + a.esperarAte;
              a.aoChegar?.();
              a.aoChegar = null;
            } else if (a.modo === "voltando") {
              a.modo = "mesa";
            }
          }
        } else {
          a.pos.x += (dx / dist) * andar;
          a.pos.y += (dy / dist) * andar;
        }
      } else if (a.modo === "parado" && agora > a.esperarAte) {
        this.voltar(a);
      }
    }

    // De vez em quando alguém vai tomar um café, para o escritório parecer vivo.
    if (agora > this.proximoPasseio) {
      this.proximoPasseio = agora + 6000 + Math.random() * 6000;
      const livres = [...this.avatares.values()].filter((a) => a.modo === "mesa" && agora > a.trabalhandoAte);
      const sorteado = livres[Math.floor(Math.random() * livres.length)];
      const { cafe } = this.layout;
      if (sorteado) this.levar(sorteado, { x: cafe.x - 60 + Math.random() * 120, y: cafe.y + 40 }, 5000, null);
    }

    if (agora < this.festaAte && agora > this.proximoConfete) {
      this.chuvaDeConfete();
      this.proximoConfete = agora + 700;
    }

    this.confetes = this.confetes.filter((c) => (c.vida -= dt) > 0);
    for (const c of this.confetes) {
      c.vy += 500 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
    }
  }

  // ---------------------------------------------------------------- desenho

  desenhar(agora: number) {
    const ctx = this.ctx;
    const { mundo } = this.layout;
    ctx.setTransform(this.escala, 0, 0, this.escala, 0, 0);
    desenharChao(ctx, mundo.w, mundo.h);
    this.desenharAreaComum(agora);
    for (const sala of this.salas) this.desenharSala(sala);
    for (const a of this.avatares.values()) this.desenharMesa(a, agora);

    const ordenados = [...this.avatares.values()].sort((a, b) => a.pos.y - b.pos.y);
    for (const a of ordenados) this.desenharAvatar(a, agora);
    for (const a of ordenados) this.desenharCracha(a, agora);
    for (const a of ordenados) this.desenharBalao(a);

    if (agora < this.festaAte) this.desenharFaixaDaMeta(agora);

    for (const c of this.confetes) {
      ctx.fillStyle = c.cor;
      ctx.globalAlpha = Math.min(1, c.vida);
      ctx.fillRect(c.x, c.y, 7, 4);
    }
    ctx.globalAlpha = 1;
  }

  private desenharFaixaDaMeta(agora: number) {
    const ctx = this.ctx;
    const restante = this.festaAte - agora;
    const entrada = Math.min(1, (DURACAO_FESTA - restante) / 400);
    const saida = Math.min(1, restante / 400);
    const pulso = 1 + Math.sin(agora / 160) * 0.03;
    ctx.save();
    ctx.globalAlpha = Math.min(entrada, saida);
    ctx.translate(this.layout.mundo.w / 2, this.layout.faixaY);
    ctx.scale(pulso * entrada, pulso * entrada);
    ctx.font = `700 44px ${FONTE_TITULO}`;
    const w = ctx.measureText(this.festaTitulo).width + 80;
    ctx.fillStyle = MARCA.onix;
    caixa(ctx, -w / 2, -44, w, 88, 8);
    ctx.fill();
    ctx.strokeStyle = MARCA.verde;
    ctx.lineWidth = 3;
    ctx.stroke();
    // cantoneiras do guia de marca
    ctx.strokeStyle = MARCA.verdeClaro;
    ctx.lineWidth = 4;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = (sx * w) / 2 + sx * 8;
      const cy = sy * 44 + sy * 8;
      ctx.beginPath();
      ctx.moveTo(cx - sx * 22, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy - sy * 22);
      ctx.stroke();
    }
    ctx.fillStyle = MARCA.gelo;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.festaTitulo, 0, 2);
    ctx.restore();
  }

  private desenharSala(s: Sala) {
    const ctx = this.ctx;
    ctx.fillStyle = MARCA.painel;
    caixa(ctx, s.x, s.y, s.w, s.h, 14);
    ctx.fill();
    ctx.strokeStyle = MARCA.painelBorda;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // porta
    const py = s.portaLado === "baixo" ? s.y + s.h - 3 : s.y - 5;
    ctx.fillStyle = MARCA.chao;
    ctx.fillRect(s.portaX - 42, py, 84, 8);
    ctx.fillStyle = MARCA.verde;
    ctx.fillRect(s.portaX - 46, py, 4, 8);
    ctx.fillRect(s.portaX + 42, py, 4, 8);

    // placa com o nome da sala
    ctx.font = `700 20px ${FONTE_TITULO}`;
    const texto = s.nome.toUpperCase();
    const largura = ctx.measureText(texto).width + 40;
    ctx.fillStyle = MARCA.onix;
    caixa(ctx, s.x + 16, s.y + 12, largura, 34, 4);
    ctx.fill();
    ctx.fillStyle = MARCA.verde;
    ctx.fillRect(s.x + 16, s.y + 12, 4, 34);
    ctx.fillStyle = MARCA.gelo;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(texto, s.x + 32, s.y + 30);

    for (const fila of s.filas) this.desenharFila(fila);
  }

  /** Faixa de fundo e placa do time no começo da fila. */
  private desenharFila(f: Fila) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0, 194, 110, 0.035)";
    caixa(ctx, f.x, f.y + 6, f.w, CELULA_H - 14, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 194, 110, 0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const cy = f.y + CELULA_H / 2;
    ctx.fillStyle = MARCA.verde;
    ctx.fillRect(f.x + 14, cy - 26, 3, 52);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = MARCA.gelo;
    ctx.font = `700 15px ${FONTE_TITULO}`;
    // nomes que não cabem na placa vão para duas linhas
    const nome = f.time.toUpperCase();
    const cabe = ctx.measureText(nome).width <= ROTULO_FILA_W - 40;
    const palavras = nome.split(" ");
    const meio = Math.ceil(palavras.length / 2);
    const linhas = cabe ? [nome] : [palavras.slice(0, meio).join(" "), palavras.slice(meio).join(" ")];
    linhas.forEach((l, i) => ctx.fillText(l, f.x + 26, cy - 10 - (linhas.length - 1) * 9 + i * 18));
    ctx.fillStyle = MARCA.cinza;
    ctx.font = `500 12px ${FONTE_TEXTO}`;
    ctx.fillText(f.agentes === 1 ? "1 agente" : `${f.agentes} agentes`, f.x + 26, cy + 14 + (linhas.length - 1) * 9);
  }

  private desenharMesa(a: Avatar, agora: number) {
    const ctx = this.ctx;
    const { x, y } = a.casa;
    ctx.fillStyle = "#3a403c";
    caixa(ctx, x - 14, y - 34, 28, 30, 6);
    ctx.fill();
    ctx.fillStyle = MARCA.movel;
    caixa(ctx, x - 46, y - 72, 92, 26, 4);
    ctx.fill();
    ctx.fillStyle = MARCA.movelSombra;
    ctx.fillRect(x - 46, y - 48, 92, 4);
    const trabalhando = agora < a.trabalhandoAte && a.modo === "mesa";
    ctx.fillStyle = MARCA.onix;
    ctx.fillRect(x - 20, y - 100, 40, 26);
    ctx.fillStyle = trabalhando ? (Math.floor(agora / 250) % 2 ? MARCA.verdeClaro : MARCA.verde) : "#1f2a24";
    ctx.fillRect(x - 17, y - 97, 34, 20);
    ctx.fillStyle = MARCA.onix;
    ctx.fillRect(x - 3, y - 74, 6, 4);
  }

  private desenharAreaComum(agora: number) {
    const ctx = this.ctx;
    const { reuniao, mesaReuniao, copa, sino, cafe, plantas } = this.layout;

    const painel = (r: Retangulo, titulo: string) => {
      ctx.fillStyle = MARCA.painel;
      caixa(ctx, r.x, r.y, r.w, r.h, 14);
      ctx.fill();
      ctx.strokeStyle = MARCA.painelBorda;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = MARCA.verde;
      ctx.font = `600 15px ${FONTE_TITULO}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(titulo, r.x + 24, r.y + 34);
    };

    // Sala de resultados (só na visão geral)
    if (reuniao && mesaReuniao) {
    painel(reuniao, "SALA DE RESULTADOS");
    ctx.fillStyle = MARCA.movel;
    caixa(ctx, mesaReuniao.x, mesaReuniao.y, mesaReuniao.w, mesaReuniao.h, 10);
    ctx.fill();
    ctx.fillStyle = MARCA.verde;
    ctx.fillRect(mesaReuniao.x + 10, mesaReuniao.y + mesaReuniao.h / 2 - 1, mesaReuniao.w - 20, 2);
    const tela = { x: reuniao.x + reuniao.w - 150, y: reuniao.y + 50 };
    ctx.fillStyle = MARCA.onix;
    ctx.fillRect(tela.x, tela.y, 120, 70);
    ctx.strokeStyle = MARCA.painelBorda;
    ctx.strokeRect(tela.x, tela.y, 120, 70);
    ctx.fillStyle = MARCA.verde;
    for (let i = 0; i < 5; i++) ctx.fillRect(tela.x + 12 + i * 21, tela.y + 55 - (i + 1) * 9, 14, (i + 1) * 9);
    }

    // Sino da venda (não existe na Sala de Marketing)
    if (sino) {
      ctx.fillStyle = MARCA.verdeEscuro;
      ctx.beginPath();
      const raio = this.layout.tapete;
      ctx.ellipse(sino.x, sino.y + 20, raio, raio * 0.41, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = MARCA.verde;
      ctx.setLineDash([10, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(sino.x, sino.y + 20, raio - 22, (raio - 22) * 0.38, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#4a4f4c";
      ctx.fillRect(sino.x + 40, sino.y - 190, 10, 200);
      ctx.fillRect(sino.x - 10, sino.y - 190, 60, 10);
      const t = (agora - this.sinoTocouEm) / 1000;
      const balanco = t < 3 ? Math.sin(t * 18) * 0.5 * (1 - t / 3) : 0;
      ctx.save();
      ctx.translate(sino.x, sino.y - 180);
      ctx.rotate(balanco);
      ctx.fillStyle = "#4a4f4c";
      ctx.fillRect(-2, 0, 4, 20);
      if (t < 1.5) {
        ctx.shadowColor = MARCA.ouro;
        ctx.shadowBlur = 30 * (1 - t / 1.5);
      }
      ctx.fillStyle = MARCA.ouro;
      ctx.beginPath();
      ctx.moveTo(-14, 22);
      ctx.quadraticCurveTo(-16, 60, -42, 82);
      ctx.lineTo(42, 82);
      ctx.quadraticCurveTo(16, 60, 14, 22);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = MARCA.ouroEscuro;
      ctx.beginPath();
      ctx.arc(0, 86, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      etiqueta(ctx, "🔔 SINO DA VENDA", sino.x, sino.y + 92, { tamanho: 15, fonte: FONTE_TITULO });

    }

    // Copa
    painel(copa, "COPA");
    ctx.fillStyle = MARCA.movel;
    ctx.fillRect(cafe.x - 30, cafe.y - 90, 60, 80);
    ctx.fillStyle = MARCA.verde;
    ctx.fillRect(cafe.x - 18, cafe.y - 76, 12, 12);
    ctx.fillStyle = "#26302b";
    caixa(ctx, copa.x + 60, copa.y + copa.h - 70, 200, 50, 12);
    ctx.fill();

    for (const p of plantas) desenharPlanta(ctx, p.x, p.y);
  }

  private desenharAvatar(a: Avatar, agora: number) {
    const andando = a.rota.length > 0;
    const pulo = agora < this.festaAte ? -Math.abs(Math.sin(agora / 140 + (hash(a.info.id) % 10))) * 14 : 0;
    const bob = (!andando && agora < a.trabalhandoAte ? Math.sin(agora / 120) * 1.2 : 0) + pulo;
    desenharBoneco(this.ctx, a.pos.x, a.pos.y + bob, {
      roupa: a.info.cor,
      pele: a.pele,
      cabelo: a.cabelo,
      passo: a.passo,
      andando,
      deFrente: andando || a.modo !== "mesa",
    });
  }

  private desenharCracha(a: Avatar, agora: number) {
    etiqueta(this.ctx, `${a.info.nome}  💬 ${a.info.tarefasHoje}`, a.pos.x, a.pos.y + 6, {
      destaque: agora < a.destaqueAte,
    });
  }

  private desenharBalao(a: Avatar) {
    const texto = a.falaTemporaria ?? a.fala;
    if (!texto) return;
    const ctx = this.ctx;
    ctx.font = `500 12px ${FONTE_TEXTO}`;
    const linhas = this.quebrar(texto, this.layout.celulaW - 14, 2);
    const w = Math.max(56, ...linhas.map((l) => ctx.measureText(l).width)) + 14;
    const h = 8 + linhas.length * 15;
    const naMesa = a.modo === "mesa" && a.rota.length === 0;
    const base = a.pos.y - (naMesa ? 104 : 70);
    const x = a.pos.x - w / 2;
    const y = base - h;
    ctx.fillStyle = a.falaTemporaria ? MARCA.verde : MARCA.gelo;
    caixa(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(a.pos.x - 5, base);
    ctx.lineTo(a.pos.x, base + 6);
    ctx.lineTo(a.pos.x + 5, base);
    ctx.fill();
    ctx.fillStyle = MARCA.onix;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    linhas.forEach((l, i) => ctx.fillText(l, a.pos.x, y + 11.5 + i * 15));
  }

  /** Quebra o texto em linhas que cabem na largura; a última leva reticências se sobrar texto. */
  private quebrar(texto: string, largura: number, maxLinhas: number): string[] {
    const ctx = this.ctx;
    const linhas: string[] = [];
    let atual = "";
    for (const palavra of texto.split(/\s+/)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (ctx.measureText(tentativa).width <= largura || !atual) {
        atual = tentativa;
      } else {
        linhas.push(atual);
        atual = palavra;
      }
    }
    if (atual) linhas.push(atual);
    if (linhas.length > maxLinhas) {
      linhas.length = maxLinhas;
      linhas[maxLinhas - 1] += "…";
    }
    return linhas.map((l) => {
      let r = l;
      while (ctx.measureText(r).width > largura && r.length > 2) r = `${r.slice(0, -2)}…`;
      return r;
    });
  }
}
