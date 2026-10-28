/**
 * Estado da conexão do PC com o banco (28/10/2026).
 *
 * Alimenta o aviso que pulsa no canto da tela do Balcão e a faixa do Histórico. Quem registra
 * é o sincronizador: cada envio de venda e cada sinal de vida (a cada 60 s) diz se a nuvem respondeu.
 * Função pura sobre um registro em memória, para testar com relógio falso.
 *
 * Níveis:
 *   ok        tudo respondendo, nada na fila
 *   enviando  há venda na fila, mas a nuvem está respondendo (ou falhou há menos de 1 minuto)
 *   atencao   a nuvem não responde há 1 minuto ou mais e não há venda na fila
 *   critico   a nuvem não responde há 1 minuto ou mais COM venda na fila, ou há 15 minutos ou mais
 */
export type NivelConexao = 'ok' | 'enviando' | 'atencao' | 'critico';
export type MotivoConexao = 'desconhecido' | 'sem-rede' | 'sem-internet' | 'servidor';

export const LIMIARES = { atencaoMs: 60_000, criticoMs: 15 * 60_000 };

interface Registro {
    desde: number | null;
    ultimaTentativaEm: number | null;
    ultimoSucessoEm: number | null;
    motivo: MotivoConexao;
    ultimoErro?: string;
}

const novoRegistro = (): Registro => ({ desde: null, ultimaTentativaEm: null, ultimoSucessoEm: null, motivo: 'desconhecido' });
let reg: Registro = novoRegistro();

/** A nuvem respondeu (mesmo recusando um dado: respondeu, então a internet está de pé). */
export function registrarSucesso(agora = Date.now()) {
    reg.desde = null;
    reg.ultimaTentativaEm = agora;
    reg.ultimoSucessoEm = agora;
    reg.motivo = 'desconhecido';
    reg.ultimoErro = undefined;
}

/** A nuvem não respondeu (rede caiu, tempo esgotado, servidor fora). */
export function registrarFalha(erro: unknown, agora = Date.now()) {
    if (reg.desde === null) reg.desde = agora;
    reg.ultimaTentativaEm = agora;
    const e: any = erro;
    reg.ultimoErro = String(e?.message || e || 'sem resposta').slice(0, 200);
}

export const definirMotivo = (m: MotivoConexao) => { reg.motivo = m; };

export interface EstadoConexao {
    nivel: NivelConexao;
    /** Desde quando não responde (ms), se não responde. */
    desde: number | null;
    duracaoMs: number;
    naFila: number;
    valorNaFila: number;
    /** Fechamento da venda mais antiga que ainda não subiu (ISO). */
    maisAntigaEm: string | null;
    motivo: MotivoConexao;
    ultimaTentativaEm: number | null;
    ultimoSucessoEm: number | null;
    ultimoErro?: string;
}

export function lerEstadoConexao(fila: { total: number; fechadaEm: string }[], agora = Date.now()): EstadoConexao {
    const naFila = fila.length;
    const valorNaFila = Math.round(fila.reduce((s, v) => s + (Number(v.total) || 0), 0) * 100) / 100;
    const maisAntigaEm = fila.length ? fila.map(v => v.fechadaEm).sort()[0] : null;
    const duracaoMs = reg.desde === null ? 0 : Math.max(0, agora - reg.desde);

    let nivel: NivelConexao;
    if (reg.desde === null || duracaoMs < LIMIARES.atencaoMs) nivel = naFila > 0 ? 'enviando' : 'ok';
    else nivel = naFila > 0 || duracaoMs >= LIMIARES.criticoMs ? 'critico' : 'atencao';

    return {
        nivel, desde: reg.desde, duracaoMs, naFila, valorNaFila, maisAntigaEm,
        motivo: reg.motivo, ultimaTentativaEm: reg.ultimaTentativaEm, ultimoSucessoEm: reg.ultimoSucessoEm, ultimoErro: reg.ultimoErro,
    };
}

/**
 * Descobre o que está falhando, para o app dizer ao dono o que fazer:
 *  sem-rede      o computador não está ligado a nenhuma rede (cabo ou Wi-Fi)
 *  sem-internet  há rede, mas não chega à internet (roteador ou provedor)
 *  servidor      a internet funciona, mas o sistema não responde
 */
export async function diagnosticarRede(): Promise<MotivoConexao> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { definirMotivo('sem-rede'); return 'sem-rede'; }
    try {
        await Promise.race([
            fetch('https://www.cloudflare.com/cdn-cgi/trace', { mode: 'no-cors', cache: 'no-store' }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('tempo esgotado')), 4000)),
        ]);
        definirMotivo('servidor');
        return 'servidor';
    } catch (_) {
        definirMotivo('sem-internet');
        return 'sem-internet';
    }
}

/** Só para os testes. */
export const __zerarConexaoParaTeste = () => { reg = novoRegistro(); };
