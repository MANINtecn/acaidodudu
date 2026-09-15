/**
 * estacaoService — configuração de impressão POR MÁQUINA.
 *
 * POR QUE ISTO EXISTE:
 * As impressoras ficavam em `settings`, que é UMA linha por loja no banco.
 * Com dois PCs (salão e cozinha), os dois liam a mesma configuração: o que a
 * cozinha escolhia, o salão sobrescrevia, e cada máquina tentava imprimir numa
 * impressora que talvez nem enxergasse.
 *
 * Aqui a configuração vive no electron-store, no disco de cada máquina.
 * Um PC nunca altera o do outro.
 *
 * O que continua no banco (settings): largura de papel, modo compatibilidade,
 * auto-print de mesa/retirada — regras da LOJA, iguais em toda máquina.
 * O que fica aqui: qual impressora esta máquina usa e o que ela imprime.
 */

/** Que pedidos esta máquina imprime. */
export type EscopoImpressao =
    | 'tudo'        // qualquer pedido (padrão — comportamento histórico)
    | 'app'         // só o que chega pelo site/WhatsApp (WEB, APP, AI)
    | 'local'       // só o que foi lançado aqui no balcão/garçom
    | 'nada';       // esta máquina não imprime

/**
 * O que esta maquina TOCA. Eixo diferente do escopo de impressao: aqui o que
 * importa e entrega x salao, nao a origem do pedido.
 */
export type EscopoSom =
    | 'tudo'       // toca em qualquer pedido (padrao)
    | 'entrega'    // so pedidos de entrega
    | 'salao'      // so mesa/retirada/balcao
    | 'mudo';      // esta maquina nao toca

export interface ConfigEstacao {
    /** Nome da estação, só para o operador se localizar. Ex.: "Cozinha". */
    nome: string;
    /** Impressora principal DESTA máquina. Vazio = não imprime a via principal. */
    impressora: string;
    /** Impressora de produção DESTA máquina. Vazio = sem via de cozinha. */
    impressoraCozinha: string;
    escopo: EscopoImpressao;
    /** O que esta maquina toca. Independente do escopo de impressao. */
    escopoSom?: EscopoSom;
    /** false = ignora tudo isto e usa a configuração do banco (como era antes). */
    ativo: boolean;
}

const CHAVE = 'estacao-impressao';

export const CONFIG_PADRAO: ConfigEstacao = {
    nome: '',
    impressora: '',
    impressoraCozinha: '',
    escopo: 'tudo',
    escopoSom: 'tudo',
    ativo: false,
};

const api = () => (window as any).electron?.storage;

/** Cache em memória: o printerService precisa ler isto de forma síncrona. */
let cache: ConfigEstacao = { ...CONFIG_PADRAO };
let carregado = false;

export async function carregarConfigEstacao(): Promise<ConfigEstacao> {
    try {
        const bruto = await api()?.getItem(CHAVE);
        if (bruto) {
            const obj = typeof bruto === 'string' ? JSON.parse(bruto) : bruto;
            cache = { ...CONFIG_PADRAO, ...obj };
        }
    } catch (err) {
        console.warn('[Estacao] não foi possível ler a configuração local:', err);
    }
    carregado = true;
    return cache;
}

export async function salvarConfigEstacao(cfg: ConfigEstacao): Promise<void> {
    cache = { ...cfg };
    try {
        await api()?.setItem(CHAVE, JSON.stringify(cache));
    } catch (err) {
        console.error('[Estacao] falha ao gravar a configuração local:', err);
        throw err;
    }
}

/** Leitura síncrona (usa o cache). Chame carregarConfigEstacao() no boot. */
export function getConfigEstacao(): ConfigEstacao {
    return cache;
}

export function estacaoFoiCarregada(): boolean {
    return carregado;
}

/** true quando esta máquina está com configuração própria valendo. */
export function estacaoAtiva(): boolean {
    return cache.ativo === true;
}

/**
 * Esta máquina deve imprimir este pedido?
 * Só decide o ESCOPO — se a impressora está configurada é outra checagem.
 */
export function estacaoDeveImprimir(origem?: string): boolean {
    if (!cache.ativo) return true;                 // desligado: nada muda
    if (cache.escopo === 'nada') return false;
    if (cache.escopo === 'tudo') return true;

    const o = (origem || '').toUpperCase();
    // Pedido que o cliente fez sozinho (site, app, WhatsApp).
    const veioDoApp = o === 'WEB' || o === 'APP' || o === 'AI';

    return cache.escopo === 'app' ? veioDoApp : !veioDoApp;
}

/**
 * Esta maquina deve TOCAR o alerta deste pedido?
 * Independente da impressao: a cozinha pode imprimir tudo e so tocar nas
 * entregas, por exemplo.
 */
export function estacaoDeveTocar(orderType?: string): boolean {
    if (!cache.ativo) return true;                  // desligado: nada muda
    const escopo = cache.escopoSom || 'tudo';
    if (escopo === 'mudo') return false;
    if (escopo === 'tudo') return true;

    const ehEntrega = (orderType || '').toLowerCase() === 'entrega';
    return escopo === 'entrega' ? ehEntrega : !ehEntrega;
}

/**
 * Sobrepõe as impressoras do banco pelas desta máquina.
 * Devolve o settings pronto para o printerService.
 */
export function aplicarEstacao<T extends Record<string, any>>(settings: T): T {
    if (!cache.ativo) return settings;
    return {
        ...settings,
        preferredPrinter: cache.impressora,
        kitchenPrinter: cache.impressoraCozinha,
    };
}
