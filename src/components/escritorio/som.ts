// Som do sino da venda, sintetizado com a Web Audio API (sem arquivo de áudio).
// Os navegadores só liberam áudio depois de um clique na página, por isso o som
// começa desligado e é ativado pelo botão do topo.

// Parciais de um sino de mão: frequências fora da série harmônica dão o timbre metálico.
const PARCIAIS = [
  { razao: 1, volume: 1, duracao: 2.4 },
  { razao: 2.0, volume: 0.6, duracao: 1.8 },
  { razao: 2.76, volume: 0.45, duracao: 1.4 },
  { razao: 5.4, volume: 0.25, duracao: 0.8 },
  { razao: 8.93, volume: 0.12, duracao: 0.4 },
];

export class SomDoSino {
  private ctx: AudioContext | null = null;

  get ativo(): boolean {
    return this.ctx?.state === "running";
  }

  /** Precisa ser chamado dentro de um clique. */
  async ativar(): Promise<boolean> {
    this.ctx ??= new AudioContext();
    if (this.ctx.state !== "running") await this.ctx.resume();
    return this.ativo;
  }

  desativar() {
    void this.ctx?.suspend();
  }

  /** "Blém, blém, blém": três badaladas seguidas. */
  tocar() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const inicio = ctx.currentTime + 0.02;
    [0, 0.32, 0.64].forEach((atraso, i) => this.badalada(ctx, inicio + atraso, i === 2 ? 1 : 0.8));
  }

  /** Comemoração da meta: fanfarra, sino e aplausos. */
  festa() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime + 0.05;
    this.fanfarra(ctx, t);
    [0.9, 1.2, 1.5, 1.8].forEach((atraso) => this.badalada(ctx, t + atraso, 0.7));
    this.aplausos(ctx, t + 0.6, 4);
  }

  private fanfarra(ctx: AudioContext, t: number) {
    // Dó-mi-sol-dó, a última nota segurada, com timbre de metal (dente de serra filtrado)
    const notas = [
      { f: 523.25, em: 0, dur: 0.16 },
      { f: 659.25, em: 0.16, dur: 0.16 },
      { f: 783.99, em: 0.32, dur: 0.16 },
      { f: 1046.5, em: 0.48, dur: 0.9 },
    ];
    const filtro = ctx.createBiquadFilter();
    filtro.type = "lowpass";
    filtro.frequency.value = 2800;
    const saida = ctx.createGain();
    saida.gain.value = 0.12;
    filtro.connect(saida).connect(ctx.destination);
    for (const n of notas) {
      for (const desafino of [-6, 6]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = n.f;
        osc.detune.value = desafino;
        const env = ctx.createGain();
        const ini = t + n.em;
        env.gain.setValueAtTime(0.0001, ini);
        env.gain.exponentialRampToValueAtTime(1, ini + 0.03);
        env.gain.setValueAtTime(1, ini + n.dur - 0.05);
        env.gain.exponentialRampToValueAtTime(0.0001, ini + n.dur + 0.12);
        osc.connect(env).connect(filtro);
        osc.start(ini);
        osc.stop(ini + n.dur + 0.15);
      }
    }
  }

  private aplausos(ctx: AudioContext, t: number, segundos: number) {
    // Cada palma é um estalo curto de ruído; centenas delas em horários aleatórios viram plateia.
    const ruido = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const dados = ruido.getChannelData(0);
    for (let i = 0; i < dados.length; i++) dados[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.008));

    const saida = ctx.createGain();
    saida.gain.setValueAtTime(0.0001, t);
    saida.gain.exponentialRampToValueAtTime(0.5, t + 0.4);
    saida.gain.setValueAtTime(0.5, t + segundos - 1.2);
    saida.gain.exponentialRampToValueAtTime(0.0001, t + segundos);
    saida.connect(ctx.destination);

    const palmas = Math.round(segundos * 70);
    for (let i = 0; i < palmas; i++) {
      const fonte = ctx.createBufferSource();
      fonte.buffer = ruido;
      fonte.playbackRate.value = 0.8 + Math.random() * 0.5;
      const filtro = ctx.createBiquadFilter();
      filtro.type = "bandpass";
      filtro.frequency.value = 1000 + Math.random() * 1500;
      filtro.Q.value = 0.9;
      const volume = ctx.createGain();
      volume.gain.value = 0.3 + Math.random() * 0.7;
      fonte.connect(filtro).connect(volume).connect(saida);
      fonte.start(t + Math.random() * segundos);
    }
  }

  private badalada(ctx: AudioContext, t: number, intensidade: number) {
    const fundamental = 1046.5; // dó agudo
    const saida = ctx.createGain();
    saida.gain.value = 0.18 * intensidade;
    saida.connect(ctx.destination);

    for (const p of PARCIAIS) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = fundamental * p.razao;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(p.volume, t + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, t + p.duracao);
      osc.connect(env).connect(saida);
      osc.start(t);
      osc.stop(t + p.duracao + 0.05);
    }
  }
}

/** Um único som para o site todo: ativado na recepção, continua ativo ao entrar num escritório. */
export const somDoSino = new SomDoSino();
