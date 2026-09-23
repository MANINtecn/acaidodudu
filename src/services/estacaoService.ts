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
 * importa e entrega x retirada x mesa, nao a origem do pedido.
 *
 * 'retirada' adicionado em 23/09/2026 -- pedido do Ikarus: "vamos ser
 * profissionais... pensar em todos os casos". Antes so existia 'salao', que
 * juntava Mesa+Retirada+Balcao num grupo so -- uma loja que quer tocar para
 * Retirada mas ficar muda para Mesa (ou vice-versa) nao conseguia.
 */
export type EscopoSom =
    | 'tudo'       // toca em qualquer pedido (padrao)
    | 'entrega'    // so pedidos de entrega
    | 'retirada'   // so pedidos de retirada (site ou balcao)
    | 'mesa'       // so mesas de verdade
    | 'salao'      // retirada + mesa juntos (comportamento historico, mantido p/ quem ja usa)
    | 'mudo';      // esta maquina nao toca

/**
 * Quais colunas da aba Pedidos esta maquina MOSTRA. Terceiro eixo, ao lado de
 * impressao e som: o caixa do salao nao precisa ver a fila de entregas, e a
 * cozinha so recebe do app.
 */
export type EscopoJanelas =
    | 'tudo'       // Entrega + Balcao/Retirada (padrao)
    | 'entrega'    // so a coluna de Entrega
    | 'salao';     // so a coluna de Balcao/Retirada

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
    /** Quais colunas da aba Pedidos esta maquina mostra. */
    escopoJanelas?: EscopoJanelas;
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
    escopoJanelas: 'tudo',
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

/** Dados minimos de um pedido para classifica-lo em Entrega/Retirada/Mesa. */
export interface PedidoParaClassificar {
    orderType?: string;
    origin?: string;
    tableNumber?: string | number | null;
    deliveryFee?: number | null;
}

/**
 * Classifica um pedido em 'entrega' | 'retirada' | 'mesa' -- FONTE UNICA DA
 * VERDADE, usada tanto para decidir impressao quanto som (AdminPage.tsx e
 * este arquivo). Antes cada lugar tinha sua propria copia da regra e elas
 * desalinhavam (foi a causa do bug de 21-23/09/2026: a checagem de auto-print
 * so olhava orderType === 'Retirada' puro, e a de som nem existia).
 *
 * REGRA (ja usada em AdminPage.tsx ehColunaEntrega() desde antes): o botao
 * "Retirar" do site grava order_type = 'Balcão', NUNCA 'Retirada' --
 * nomenclatura historica, em producao ha meses, que a gente decidiu nao
 * mudar (arriscaria o fluxo do site). Por isso "Balcao SEM mesa vindo do
 * site (origin WEB/APP/AI)" tambem conta como retirada, mesmo com o campo
 * literal dizendo 'Balcão'.
 */
export function classificarTipoPedido(pedido: PedidoParaClassificar): 'entrega' | 'retirada' | 'mesa' {
    const ehEntrega =
        pedido.orderType === 'Entrega' ||
        (Number(pedido.deliveryFee) || 0) > 0;
    if (ehEntrega) return 'entrega';

    const semMesa = !pedido.tableNumber;
    const veioDoSite = pedido.origin === 'WEB' || pedido.origin === 'APP' || pedido.origin === 'AI';
    const ehRetiradaDoSite = pedido.orderType === 'Balcão' && semMesa && veioDoSite;

    if (pedido.orderType === 'Retirada' || ehRetiradaDoSite) return 'retirada';
    return 'mesa';
}

/**
 * Esta maquina deve TOCAR o alerta deste pedido?
 * Independente da impressao: a cozinha pode imprimir tudo e so tocar nas
 * entregas, por exemplo.
 */
export function estacaoDeveTocar(pedido: PedidoParaClassificar | string | undefined): boolean {
    // Compatibilidade: chamadores antigos passavam so o orderType (string).
    // Sem origin/tableNumber, a Retirada do site nao e reconhecida (vira
    // 'mesa') -- por isso os dois call-sites em AdminPage.tsx foram
    // atualizados para passar o pedido completo. Mantido aqui so para nao
    // quebrar quem ainda nao migrou.
    const p: PedidoParaClassificar = typeof pedido === 'string' ? { orderType: pedido } : (pedido || {});
    const orderType = p.orderType;
    // AINDA NAO CARREGOU: a config vem do disco por IPC (assincrono). Enquanto
    // a promessa do boot nao resolve, `cache` e o CONFIG_PADRAO com
    // ativo=false — e a linha de baixo devolveria `true`, fazendo TODA maquina
    // tocar nos primeiros segundos apos abrir o app.
    //
    // Na duvida, ficar em silencio: um alerta perdido no boot incomoda menos
    // que a sirene tocando no PC errado. O polling de 30s repete o pedido.
    if (!estacaoFoiCarregada()) {
        diagnosticarSom(orderType, false, 'config ainda nao carregou do disco');
        return false;
    }

    if (!cache.ativo) {
        diagnosticarSom(orderType, true, 'config desta maquina esta DESLIGADA (ativo=false)');
        return true;                                // desligado: nada muda
    }

    const escopo = cache.escopoSom || 'tudo';
    if (escopo === 'mudo') {
        diagnosticarSom(orderType, false, 'escopoSom=mudo');
        return false;
    }
    if (escopo === 'tudo') {
        diagnosticarSom(orderType, true, 'escopoSom=tudo');
        return true;
    }

    const tipo = classificarTipoPedido(p);
    let deve: boolean;
    switch (escopo) {
        case 'entrega':
            deve = tipo === 'entrega';
            break;
        case 'retirada':
            deve = tipo === 'retirada';
            break;
        case 'mesa':
            deve = tipo === 'mesa';
            break;
        case 'salao': // historico: retirada + mesa juntos
        default:
            deve = tipo !== 'entrega';
            break;
    }
    diagnosticarSom(orderType, deve, `escopoSom=${escopo}, tipo=${tipo}`);
    return deve;
}

/**
 * Log do porque esta maquina tocou (ou nao). Sempre visivel no console —
 * quando o som sair na maquina errada, esta linha diz exatamente o que ela
 * leu do disco, sem precisar adivinhar.
 */
function diagnosticarSom(orderType: string | undefined, deve: boolean, motivo: string): void {
    console.log(
        `[Som] ${deve ? 'TOCA' : 'silencio'} · pedido="${orderType ?? '(sem tipo)'}" · ${motivo}` +
        ` · estacao="${cache.nome || '(sem nome)'}" ativo=${cache.ativo}` +
        ` escopoSom=${cache.escopoSom ?? '(indefinido)'} carregada=${estacaoFoiCarregada()}`
    );
}

/**
 * Despeja a config desta maquina no console. Para suporte: pedir ao operador
 * que abra o console (Ctrl+Shift+I) e rode `window.pdvEstacao()`.
 */
export function dumpConfigEstacao(): ConfigEstacao & { carregada: boolean } {
    const info = { ...cache, carregada: carregado };
    console.log('[Estacao] configuracao desta maquina:', info);
    return info;
}

/**
 * Esta maquina mostra a coluna de Entrega? E a de Balcao/Retirada?
 *
 * ATENCAO: diferente da impressao, aqui NAO existe rede de seguranca no banco.
 * Se as duas maquinas esconderem a mesma coluna, o pedido fica parado e ninguem
 * ve. Por isso a aba Pedidos mostra um aviso fixo quando algo esta oculto —
 * assim "cade o pedido?" vira "esta maquina esta configurada assim", e nao um
 * chamado de suporte.
 */
export function estacaoMostraJanela(janela: 'entrega' | 'salao'): boolean {
    if (!cache.ativo) return true;                    // desligado: mostra tudo
    const escopo = cache.escopoJanelas || 'tudo';
    if (escopo === 'tudo') return true;
    return escopo === janela;
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
