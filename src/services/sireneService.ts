/**
 * sireneService — alerta sonoro de pedido novo, gerado no proprio app.
 *
 * POR QUE NAO USA ARQUIVO:
 * O som anterior vinha de uma URL externa (mixkit.co) com volume fixo em 0.8.
 * Dois problemas: ficava baixo demais para a cozinha, e **dependia de internet**
 * — se a conexao caisse, o alerta simplesmente nao tocava e o pedido passava
 * despercebido.
 *
 * Gerado por WebAudio: funciona offline, o volume vai alem do que um <audio>
 * permite (usamos ganho acumulado) e o padrao sonoro e escolhido pelo cliente.
 */

export type TipoSirene = 'sino' | 'alarme' | 'campainha';

export interface OpcaoSirene {
    valor: TipoSirene;
    nome: string;
    descricao: string;
}

export const SIRENES: OpcaoSirene[] = [
    { valor: 'sino',      nome: 'Sino',      descricao: 'Dois toques claros. Bom para ambiente calmo.' },
    { valor: 'alarme',    nome: 'Alarme',    descricao: 'Sobe e desce, tipo sirene. Corta barulho de loja cheia.' },
    { valor: 'campainha', nome: 'Campainha', descricao: 'Três toques curtos e agudos. Chama atenção rápido.' },
];

/** 1 = volume normal. Acima disso amplificamos além do que um <audio> alcança. */
export const VOLUME_PADRAO = 3;
export const VOLUME_MAXIMO = 10;

let ctx: AudioContext | null = null;

function contexto(): AudioContext | null {
    try {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AC) return null;
        if (!ctx || ctx.state === 'closed') ctx = new AC();
        // O navegador suspende o contexto até haver interação do usuário.
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
        return ctx;
    } catch {
        return null;
    }
}

interface Nota {
    freq: number;
    inicio: number;    // segundos a partir de agora
    duracao: number;
    tipo?: OscillatorType;
    /** Frequência final, para varredura (efeito de sirene). */
    freqFinal?: number;
}

function notasDe(tipo: TipoSirene): Nota[] {
    switch (tipo) {
        case 'alarme':
            // Varredura para cima e para baixo, duas vezes: atravessa ruído.
            return [
                { freq: 600, freqFinal: 1200, inicio: 0.00, duracao: 0.35, tipo: 'sawtooth' },
                { freq: 1200, freqFinal: 600, inicio: 0.35, duracao: 0.35, tipo: 'sawtooth' },
                { freq: 600, freqFinal: 1200, inicio: 0.75, duracao: 0.35, tipo: 'sawtooth' },
                { freq: 1200, freqFinal: 600, inicio: 1.10, duracao: 0.35, tipo: 'sawtooth' },
            ];
        case 'campainha':
            return [
                { freq: 1800, inicio: 0.00, duracao: 0.14, tipo: 'square' },
                { freq: 1800, inicio: 0.22, duracao: 0.14, tipo: 'square' },
                { freq: 1800, inicio: 0.44, duracao: 0.20, tipo: 'square' },
            ];
        case 'sino':
        default:
            // Duas notas com harmônico, lembrando um sino de balcão.
            return [
                { freq: 880, inicio: 0.00, duracao: 0.55, tipo: 'sine' },
                { freq: 1320, inicio: 0.00, duracao: 0.45, tipo: 'sine' },
                { freq: 880, inicio: 0.45, duracao: 0.55, tipo: 'sine' },
                { freq: 1320, inicio: 0.45, duracao: 0.45, tipo: 'sine' },
            ];
    }
}

/**
 * Toca a sirene.
 * @param tipo  padrão sonoro
 * @param volume 1 = normal · até VOLUME_MAXIMO para ambiente barulhento
 */
export function tocarSirene(tipo: TipoSirene = 'sino', volume: number = VOLUME_PADRAO): void {
    const ac = contexto();
    if (!ac) return;

    const nivel = Math.max(0.1, Math.min(VOLUME_MAXIMO, Number(volume) || VOLUME_PADRAO));

    // Compressor evita que o volume alto vire estalo/distorção no alto-falante.
    const compressor = ac.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-18, ac.currentTime);
    compressor.ratio.setValueAtTime(12, ac.currentTime);
    compressor.connect(ac.destination);

    const mestre = ac.createGain();
    // 0.25 de base: com nivel 3 (padrão) chega perto do limite sem distorcer.
    mestre.gain.setValueAtTime(Math.min(2.5, 0.25 * nivel), ac.currentTime);
    mestre.connect(compressor);

    notasDe(tipo).forEach(n => {
        const osc = ac.createOscillator();
        const g = ac.createGain();
        const t0 = ac.currentTime + n.inicio;
        const t1 = t0 + n.duracao;

        osc.type = n.tipo || 'sine';
        osc.frequency.setValueAtTime(n.freq, t0);
        if (n.freqFinal) osc.frequency.linearRampToValueAtTime(n.freqFinal, t1);

        // Ataque rápido e queda suave: audível sem estalar.
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t1);

        osc.connect(g);
        g.connect(mestre);
        osc.start(t0);
        osc.stop(t1 + 0.02);
    });
}

/** Usado pelo botão "Ouvir" nas Configurações. */
export function testarSirene(tipo: TipoSirene, volume: number): void {
    tocarSirene(tipo, volume);
}
