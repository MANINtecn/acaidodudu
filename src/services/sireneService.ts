/**
 * sireneService — alerta sonoro de pedido novo.
 *
 * É o MESMO som que o sistema sempre usou. O que muda é o volume:
 * antes ficava travado em 0.8 (o máximo de um <audio> é 1.0), e a cozinha
 * reclamava que era baixo. Aqui o áudio passa por um GainNode do WebAudio,
 * que amplifica muito além disso.
 *
 * Sons sintetizados por oscilador foram testados e reprovados — soam
 * artificiais. Mantido o arquivo real.
 *
 * O arquivo é baixado uma vez e fica em memória: se a internet cair depois,
 * o alerta continua tocando.
 */

export type TipoSirene = 'sino' | 'alarme' | 'campainha';

export interface OpcaoSirene {
    valor: TipoSirene;
    nome: string;
    descricao: string;
    url: string;
    /** Quantas vezes toca seguidas. O alerta pede mais de um toque. */
    repeticoes?: number;
}

/** O 'sino' é o som histórico do sistema. Os outros são alternativas. */
export const SIRENES: OpcaoSirene[] = [
    {
        valor: 'sino',
        nome: 'Padrão',
        descricao: 'O som que o sistema sempre usou.',
        url: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
    },
    {
        valor: 'campainha',
        nome: 'Campainha',
        descricao: 'Toque de campainha, mais longo.',
        url: 'https://assets.mixkit.co/active_storage/sfx/933/933-preview.mp3',
    },
    {
        valor: 'alarme',
        nome: 'Alerta',
        descricao: 'Toca 3 vezes. Para loja barulhenta.',
        url: 'https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3',
        repeticoes: 3,
    },
];

export const VOLUME_PADRAO = 3;
export const VOLUME_MAXIMO = 10;

/**
 * Compressor: protege o alto-falante SEM achatar o controle de volume.
 *
 * Antes era threshold -16dB / ratio 12:1, ligado sempre: qualquer ganho acima
 * de -16dB virava o mesmo patamar, entao volume 1 e volume 10 soavam iguais e
 * o controle nao fazia efeito (variacao real: 1.21x).
 *
 * Desligar nos niveis baixos foi pior: criava um DEGRAU no nivel 4, onde o som
 * despencava 6x ao subir o controle.
 *
 * Com threshold alto e ratio suave ele so age perto do estouro. A curva sobe
 * sempre, varia 3.24x e o teto fica em ~1.30 (nao distorce).
 */
const COMPRESSOR_THRESHOLD = -1;
const COMPRESSOR_RATIO = 4;

let ctx: AudioContext | null = null;
/** Áudio já decodificado, por tipo. Evita rebaixar a cada pedido. */
const buffers = new Map<TipoSirene, AudioBuffer>();
/** Elementos <audio> de reserva, caso o WebAudio não esteja disponível. */
const fallbacks = new Map<TipoSirene, HTMLAudioElement>();

function contexto(): AudioContext | null {
    try {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AC) return null;
        if (!ctx || ctx.state === 'closed') ctx = new AC();
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
        return ctx;
    } catch {
        return null;
    }
}

function urlDe(tipo: TipoSirene): string {
    return (SIRENES.find(s => s.valor === tipo) || SIRENES[0]).url;
}

/**
 * Baixa e decodifica o som. Chamado no boot para o primeiro pedido do dia
 * não esperar o download.
 */
export async function precarregarSirene(tipo: TipoSirene = 'sino'): Promise<void> {
    if (buffers.has(tipo)) return;
    const ac = contexto();
    if (!ac) return;
    try {
        const resp = await fetch(urlDe(tipo));
        const dados = await resp.arrayBuffer();
        const buffer = await ac.decodeAudioData(dados);
        buffers.set(tipo, buffer);
    } catch (err) {
        console.warn('[Sirene] não foi possível pré-carregar o som:', err);
    }
}

/** Reserva: <audio> comum, limitado a volume 1.0. */
function tocarComElemento(tipo: TipoSirene, volume: number) {
    try {
        let el = fallbacks.get(tipo);
        if (!el) {
            el = new Audio(urlDe(tipo));
            fallbacks.set(tipo, el);
        }
        // Sem o piso de +0.3 que existia antes: ele fazia o nivel 1 (0.4) e o
        // nivel 3 (0.6) soarem quase iguais, anulando o controle. Agora o
        // volume escolhido vale direto, com um minimo audivel de 0.08.
        el.volume = Math.max(0.08, Math.min(1, volume / VOLUME_MAXIMO));
        el.currentTime = 0;
        el.play().catch(e => console.warn('[Sirene] bloqueado pelo navegador:', e));
    } catch (err) {
        console.warn('[Sirene] falha ao tocar:', err);
    }
}

/**
 * Toca o alerta.
 * @param volume 1 = normal · até VOLUME_MAXIMO para ambiente barulhento
 */
export function tocarSirene(tipo: TipoSirene = 'sino', volume: number = VOLUME_PADRAO): void {
    const nivel = Math.max(0.1, Math.min(VOLUME_MAXIMO, Number(volume) || VOLUME_PADRAO));
    const ac = contexto();

    if (!ac) {
        tocarComElemento(tipo, nivel);
        return;
    }

    const buffer = buffers.get(tipo);
    if (!buffer) {
        // Ainda não carregou: toca pelo <audio> e já deixa pronto para a próxima.
        tocarComElemento(tipo, nivel);
        precarregarSirene(tipo);
        return;
    }

    try {
        const fonte = ac.createBufferSource();
        fonte.buffer = buffer;

        // É AQUI que passamos do limite de um <audio>: nível 10 ≈ 4x o máximo.
        const ganho = ac.createGain();
        ganho.gain.setValueAtTime(0.4 * nivel, ac.currentTime);

        // Compressor sempre ligado, mas so atuando perto do estouro: assim
        // ele protege o alto-falante sem achatar o controle de volume.
        // Ver claude-acai.md, 1.0.49.
        const comp = ac.createDynamicsCompressor();
        comp.threshold.setValueAtTime(COMPRESSOR_THRESHOLD, ac.currentTime);
        comp.knee.setValueAtTime(6, ac.currentTime);
        comp.ratio.setValueAtTime(COMPRESSOR_RATIO, ac.currentTime);
        comp.attack.setValueAtTime(0.003, ac.currentTime);
        comp.release.setValueAtTime(0.2, ac.currentTime);

        ganho.connect(comp);
        comp.connect(ac.destination);

        // Repete o som N vezes. O agendamento vai no proprio WebAudio (e nao
        // em setTimeout), entao o intervalo sai exato mesmo com a aba ocupada.
        const vezes = SIRENES.find(x => x.valor === tipo)?.repeticoes ?? 1;
        const intervalo = buffer.duration + 0.15;
        for (let i = 0; i < vezes; i++) {
            const f = i === 0 ? fonte : ac.createBufferSource();
            if (i > 0) f.buffer = buffer;
            f.connect(ganho);
            f.start(ac.currentTime + i * intervalo);
        }
    } catch (err) {
        console.warn('[Sirene] falha no WebAudio, usando <audio>:', err);
        tocarComElemento(tipo, nivel);
    }
}

/** Usado pelo botão "Ouvir" nas Configurações. */
export function testarSirene(tipo: TipoSirene, volume: number): void {
    tocarSirene(tipo, volume);
}
