/**
 * Balcão V2 OFFLINE -- armazém local das comandas (15/10/2026).
 *
 * Desenho completo: DESIGN-BALCAO-OFFLINE.md (raiz da pasta do Marlon).
 *
 * Ideia: a tela do Balcão V2 continua EXATAMENTE a mesma (lógica testada), mas o
 * "banco" das comandas ABERTAS passa a ser este armazém, no disco do PC. Nada da
 * comanda vai à internet enquanto ela está aberta. No fechamento (F7/F8) a comanda
 * vira UMA venda, que entra na fila e sobe sozinha (sincronizadorBalcao.ts) com um
 * id gerado aqui -- reenviar nunca duplica.
 *
 * Toda mutação grava o arquivo (main.js, gravação atômica) ANTES de responder: o
 * que a tela mostrou como salvo está no disco.
 *
 * Só existe no app do PC (Electron). No site, `offlineDisponivel()` é false e o
 * app segue 100% online como sempre.
 */
import type { Order, CartItem } from '../types';
import { planejarFechamentoMesa } from '../utils/fechamentoMesa';

export interface PagamentoVenda {
    forma: string;
    valor: number;
    /** Valor entregue pelo cliente (dinheiro), quando houver troco. */
    recebido?: number;
    rotulo?: string;
    itens?: any[];
}

export interface Venda {
    id: string;
    storeId: string;
    comanda: number;
    nome: string;
    itens: CartItem[];
    pagamentos: PagamentoVenda[];
    desconto: number;
    taxa: number;
    total: number;
    abertaEm: string;
    fechadaEm: string;
    maquina: string;
    tentativas: number;
    ultimoErro?: string;
    numero?: number;
    enviadaEm?: string;
    notaDisparada?: boolean;
    /** Diferença perdoada no F8 ("fechar com diferença"). */
    perdoado?: number;
}

export interface PagamentoMesa {
    id: string;
    amount: number;
    payment_method: string;
    split_mode: 'VALOR' | 'PRODUTO';
    payer_label?: string;
    split_total?: number;
    split_index?: number;
    items_json?: any[];
    change_for?: number | null;
    created_at: string;
}

interface Estado {
    formato: 1;
    ativo: boolean;
    maquina: string;
    pedidos: Order[];
    pagamentosMesa: Record<string, PagamentoMesa[]>;
    fila: Venda[];
    enviadas: Venda[];
    problemas: Venda[];
}

const DIAS_GUARDANDO_ENVIADAS = 3;

const novoId = (): string => {
    try { return (crypto as any).randomUUID(); } catch (_) { /* cai no fallback */ }
    const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
    return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`;
};
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const arred = (n: number) => Number((Number(n) || 0).toFixed(2));
const aberto = (o: Order) => o.status !== 'Entregue' && o.status !== 'Cancelado';
const mesmaComanda = (o: Order, n: number) => Number(o.table_number) === Number(n);

const estadoVazio = (): Estado => ({
    formato: 1,
    ativo: false,
    maquina: `balcao-${novoId().slice(0, 8)}`,
    pedidos: [],
    pagamentosMesa: {},
    fila: [],
    enviadas: [],
    problemas: [],
});

let estado: Estado = estadoVazio();
let carregado = false;
let erroDisco: string | null = null;
const ouvintes = new Set<() => void>();
let gravacao: Promise<void> = Promise.resolve();

const api = (): any => (typeof window !== 'undefined' ? (window as any).electron?.balcao : null);

export const offlineDisponivel = (): boolean => !!api();
export const armazemCarregado = (): boolean => carregado;
/** O modo offline vale para esta máquina? (o interruptor mora no MESMO arquivo das comandas) */
export const modoOfflineAtivo = (): boolean => carregado && offlineDisponivel() && estado.ativo;
export const erroDeDisco = (): string | null => erroDisco;
export const identificadorMaquina = (): string => estado.maquina;

export const assinarArmazem = (fn: () => void) => { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; };
const avisar = () => ouvintes.forEach(fn => { try { fn(); } catch (_) { /* ouvinte com erro nao derruba os outros */ } });

/** Para o diário dizer QUAIS itens (19/10/2026: o de 18/10 só tinha quantidade e total). */
const resumoItens = (itens: any[] | undefined): string[] => (itens || []).map((i: any) => i.weightKg
    ? `${Number(i.weightKg).toFixed(3)}kg`
    : `${i.quantity || 1}x ${String(i.name || '').slice(0, 30)}`);
/** Registro livre no diário (usado pelo Balcão para as respostas da pergunta da balança). */
export const registrarNoDiario = (tipo: string, dados: any) => diario(tipo, dados);

const diario = (tipo: string, dados: any) => {
    try { api()?.diario(JSON.stringify({ em: new Date().toISOString(), tipo, ...dados })); } catch (_) { /* diario e auditoria, nunca trava venda */ }
};
export const logBalcao = (msg: string) => { try { api()?.log(msg); } catch (_) { /* idem */ } console.log(`[Balcao] ${msg}`); };

/** Grava o estado inteiro no disco, em ordem (uma gravação de cada vez). */
const persistir = (): Promise<void> => {
    const texto = JSON.stringify(estado);
    gravacao = gravacao.then(async () => {
        const r = await api()?.salvar(texto);
        if (r && r.ok === false) {
            erroDisco = r.erro || 'falha ao gravar';
            logBalcao(`FALHA AO GRAVAR NO DISCO: ${erroDisco}`);
        } else {
            erroDisco = null;
        }
    }).catch(e => { erroDisco = String(e?.message || e); });
    avisar();
    return gravacao;
};

export async function carregarArmazem(): Promise<void> {
    if (carregado || !offlineDisponivel()) return;
    try {
        const texto = await api().carregar();
        if (texto) {
            const lido = JSON.parse(texto);
            estado = { ...estadoVazio(), ...lido };
        }
    } catch (e: any) {
        logBalcao(`arquivo do balcao ilegivel, comecando vazio: ${e?.message || e}`);
    }
    // Limpa enviadas antigas (ficam alguns dias so para conferencia)
    const limite = Date.now() - DIAS_GUARDANDO_ENVIADAS * 86400000;
    estado.enviadas = estado.enviadas.filter(v => new Date(v.enviadaEm || v.fechadaEm).getTime() >= limite);
    carregado = true;
    await persistir();
}

// ---------------------------------------------------------------------------
// Interruptor
// ---------------------------------------------------------------------------
export const comandasAbertasLocais = (): number =>
    new Set(estado.pedidos.filter(aberto).map(o => Number(o.table_number))).size;

/**
 * Liga/desliga o modo offline nesta máquina. Só troca com ZERO comandas abertas
 * no modo de onde está saindo (nunca mistura comanda do banco com comanda local).
 * `comandasAbertasNoBanco` é informado pelo AdminPage (pedidos de mesa abertos).
 */
export async function definirModoOffline(ativo: boolean, comandasAbertasNoBanco: number): Promise<{ ok: boolean; motivo?: string }> {
    if (!offlineDisponivel()) return { ok: false, motivo: 'O modo offline só existe no aplicativo do computador.' };
    if (!carregado) await carregarArmazem();
    if (ativo === estado.ativo) return { ok: true };
    if (ativo && comandasAbertasNoBanco > 0) {
        return { ok: false, motivo: `Feche as ${comandasAbertasNoBanco} comanda(s) aberta(s) antes de ligar o modo offline.` };
    }
    if (!ativo && comandasAbertasLocais() > 0) {
        return { ok: false, motivo: `Feche as ${comandasAbertasLocais()} comanda(s) aberta(s) antes de desligar o modo offline.` };
    }
    estado.ativo = ativo;
    diario(ativo ? 'modo-offline-ligado' : 'modo-offline-desligado', {});
    logBalcao(`modo offline ${ativo ? 'LIGADO' : 'DESLIGADO'}`);
    await persistir();
    return { ok: true };
}

// ---------------------------------------------------------------------------
// "Banco" local das comandas abertas (mesma forma que o supabaseService devolve)
// ---------------------------------------------------------------------------
export const pedidosAbertosLocais = (): Order[] => clone(estado.pedidos.filter(aberto));

export const pedidosAbertosDaComanda = (n: number): Order[] =>
    clone(estado.pedidos.filter(o => mesmaComanda(o, n) && aberto(o)).sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp))));

export async function criarPedidoLocal(order: any): Promise<Order> {
    const agora = new Date().toISOString();
    const novo: Order = clone({
        ...order,
        id: `L-${novoId()}`,
        timestamp: agora,
        dailyOrderNumber: 0,
        status: order.status || 'Novo',
        statusHistory: [{ status: order.status || 'Novo', timestamp: agora }],
    });
    estado.pedidos.push(novo);
    diario('item-salvo', { comanda: novo.table_number, pedido: novo.id, itens: (novo.items || []).length, total: novo.total, detalhe: resumoItens(novo.items), ids: (novo.items || []).map((i: any) => i.cartId) });
    await persistir();
    return clone(novo);
}

export async function atualizarPedidoLocal(id: string, updates: any): Promise<Order[]> {
    const o = estado.pedidos.find(p => p.id === id);
    if (!o) return [];
    Object.assign(o, clone({ ...updates, id }));
    diario('comanda-atualizada', { comanda: o.table_number, pedido: id, itens: (o.items || []).length, total: o.total, detalhe: resumoItens(o.items), ids: (o.items || []).map((i: any) => i.cartId) });
    await persistir();
    return [clone(o)];
}

export async function apagarPedidoLocal(id: string): Promise<true> {
    const o = estado.pedidos.find(p => p.id === id);
    estado.pedidos = estado.pedidos.filter(p => p.id !== id);
    if (o) {
        diario('pedido-apagado', { comanda: o.table_number, pedido: id });
        // Comanda ficou vazia: o próximo cliente deste número começa do zero (bug de 02/10:
        // pagamento fracionado herdado entre clientes diferentes).
        if (!estado.pedidos.some(p => mesmaComanda(p, Number(o.table_number)) && aberto(p))) {
            delete estado.pagamentosMesa[String(Number(o.table_number))];
        }
    }
    await persistir();
    return true;
}

export async function limparPagamentosComanda(n: number): Promise<void> {
    if (!estado.pagamentosMesa[String(n)]) return;
    // Só limpa se a comanda está vazia de verdade (mesma regra de antes, mas sem apagar
    // pagamento de uma comanda que ainda tem pedido aberto).
    if (estado.pedidos.some(p => mesmaComanda(p, n) && aberto(p))) return;
    delete estado.pagamentosMesa[String(n)];
    await persistir();
}

// ---------------------------------------------------------------------------
// Fechamento (F7) -> venda na fila
// ---------------------------------------------------------------------------
export interface DetalhesCheckout {
    method: string;
    amountTendered: number;
    discount: number;
    tax: number;
    finalTotal: number;
}

const nomeDaComandaLocal = (pedidos: Order[], n: number): string => {
    const nomes = pedidos.map(p => String(p.customerName || '')).filter(Boolean);
    return nomes.find(x => x.includes('·')) || nomes[0] || `Comanda ${n}`;
};

function criarVenda(n: number, pedidos: Order[], pagamentos: PagamentoVenda[], d: { discount: number; tax: number; finalTotal: number }, perdoado = 0): Venda {
    return {
        id: novoId(),
        storeId: String(pedidos[0]?.store_id || ''),
        comanda: n,
        nome: nomeDaComandaLocal(pedidos, n),
        itens: clone(pedidos.flatMap(p => p.items || [])),
        pagamentos,
        desconto: arred(d.discount),
        taxa: arred(d.tax),
        total: arred(d.finalTotal),
        abertaEm: pedidos.map(p => String(p.timestamp)).sort()[0] || new Date().toISOString(),
        fechadaEm: new Date().toISOString(),
        maquina: estado.maquina,
        tentativas: 0,
        perdoado: perdoado > 0 ? arred(perdoado) : undefined,
    };
}

async function concluirComanda(n: number, venda: Venda): Promise<Venda> {
    estado.pedidos = estado.pedidos.filter(p => !(mesmaComanda(p, n) && aberto(p)));
    delete estado.pagamentosMesa[String(n)];
    estado.fila.push(venda);
    diario('venda-fechada', { comanda: n, venda: venda.id, total: venda.total, pagamentos: venda.pagamentos, itens: venda.itens.length, detalhe: resumoItens(venda.itens), ids: venda.itens.map((i: any) => i.cartId) });
    logBalcao(`venda fechada comanda ${n} R$ ${venda.total.toFixed(2)} (${venda.pagamentos.map(p => p.forma).join('+')}) id=${venda.id}`);
    await persistir();
    return clone(venda);
}

/**
 * F7: fecha a comanda N como UMA venda. Confere (instantâneo, sem rede) que o total
 * da tela bate com a soma dos pedidos locais -- mesma regra do fechamento online.
 */
export async function fecharComandaLocal(n: number, totalTela: number, d: DetalhesCheckout): Promise<{ ok: true; venda: Venda } | { ok: false; totalTela: number; totalLocal: number }> {
    const pedidos = estado.pedidos.filter(p => mesmaComanda(p, n) && aberto(p));
    const plano = planejarFechamentoMesa(pedidos.map(p => ({ id: String(p.id), total: Number(p.total) || 0 })), totalTela, d);
    if (!plano.ok) {
        diario('fechamento-bloqueado', { comanda: n, totalTela: plano.totalTela, totalLocal: plano.totalBanco });
        return { ok: false, totalTela: plano.totalTela, totalLocal: plano.totalBanco };
    }
    const pagamento: PagamentoVenda = { forma: d.method, valor: arred(d.finalTotal) };
    if (d.method === 'Dinheiro' && d.amountTendered > d.finalTotal) pagamento.recebido = arred(d.amountTendered);
    const venda = criarVenda(n, pedidos, [pagamento], d);
    return { ok: true, venda: await concluirComanda(n, venda) };
}

// ---------------------------------------------------------------------------
// F8 (dividir conta) -- mesmas respostas das RPCs do banco, mas locais
// ---------------------------------------------------------------------------
const pagamentosDe = (n: number) => (estado.pagamentosMesa[String(n)] ||= []);

export function saldoComandaLocal(n: number) {
    const pedidos = estado.pedidos.filter(p => mesmaComanda(p, n) && aberto(p));
    const total = arred(pedidos.reduce((s, p) => s + (Number(p.total) || 0), 0));
    // Só LÊ (não cria a lista vazia no estado): consultar saldo não pode mudar o que vai para o disco.
    const pagos = clone(estado.pagamentosMesa[String(n)] || []);
    const paid = arred(pagos.reduce((s, p) => s + (Number(p.amount) || 0), 0));
    const balance = arred(total - paid);
    return { table_number: n, open_orders: pedidos.length, total, paid, balance, is_settled: pedidos.length > 0 && balance <= 0.01, payments: pagos };
}

export async function adicionarPagamentoLocal(p: {
    tableNumber: number; amount: number; paymentMethod: string; splitMode?: 'VALOR' | 'PRODUTO';
    payerLabel?: string; splitTotal?: number; splitIndex?: number; itemsJson?: any[] | null; changeFor?: number | null;
}) {
    if (!(p.amount > 0)) return { success: false, error: 'Valor inválido.' };
    const saldo = saldoComandaLocal(p.tableNumber);
    if (saldo.open_orders === 0) return { success: false, error: 'Comanda sem itens.' };
    pagamentosDe(p.tableNumber).push({
        id: novoId(), amount: arred(p.amount), payment_method: p.paymentMethod, split_mode: p.splitMode || 'VALOR',
        payer_label: p.payerLabel, split_total: p.splitTotal, split_index: p.splitIndex,
        items_json: p.itemsJson || undefined, change_for: p.changeFor ?? null, created_at: new Date().toISOString(),
    });
    diario('pagamento-parcial', { comanda: p.tableNumber, valor: p.amount, forma: p.paymentMethod });
    await persistir();
    return { success: true, ...saldoComandaLocal(p.tableNumber) };
}

export async function estornarPagamentoLocal(paymentId: string) {
    for (const [n, lista] of Object.entries(estado.pagamentosMesa)) {
        const i = lista.findIndex(p => p.id === paymentId);
        if (i >= 0) {
            const [p] = lista.splice(i, 1);
            diario('pagamento-estornado', { comanda: Number(n), valor: p.amount, forma: p.payment_method });
            await persistir();
            return { success: true };
        }
    }
    return { success: false, error: 'Pagamento não encontrado.' };
}

/** F8 "fechar": só com saldo zerado; force=true perdoa a diferença (registrada na venda). */
export async function fecharComandaPorSaldoLocal(n: number, force: boolean) {
    const saldo = saldoComandaLocal(n);
    if (saldo.open_orders === 0) return { success: false, error: 'Comanda sem itens.' };
    if (saldo.balance > 0.01 && !force) return { success: false, error: `Ainda faltam R$ ${saldo.balance.toFixed(2)}.` };
    const pedidos = estado.pedidos.filter(p => mesmaComanda(p, n) && aberto(p));
    const porForma = new Map<string, number>();
    saldo.payments.forEach(p => porForma.set(p.payment_method, arred((porForma.get(p.payment_method) || 0) + Number(p.amount))));
    const pagamentos: PagamentoVenda[] = Array.from(porForma.entries()).map(([forma, valor]) => ({ forma, valor }));
    const perdoado = saldo.balance > 0.01 ? saldo.balance : 0;
    const totalVenda = arred(saldo.total - perdoado);
    // Pagou a mais (ex.: arredondamento na divisão)? O vendido é o total dos itens: o excesso
    // sai do último pagamento, senão o Histórico somaria mais dinheiro/PIX do que foi vendido.
    let excesso = arred(pagamentos.reduce((s, p) => s + p.valor, 0) - totalVenda);
    for (let i = pagamentos.length - 1; i >= 0 && excesso > 0.004; i--) {
        const tira = Math.min(excesso, pagamentos[i].valor);
        pagamentos[i].valor = arred(pagamentos[i].valor - tira);
        excesso = arred(excesso - tira);
    }
    const venda = criarVenda(n, pedidos, pagamentos, { discount: perdoado, tax: 0, finalTotal: totalVenda }, perdoado);
    await concluirComanda(n, venda);
    return { success: true };
}

// ---------------------------------------------------------------------------
// Fila (usada pelo sincronizador e pelo Histórico)
// ---------------------------------------------------------------------------
export const vendasNaFila = (): Venda[] => clone(estado.fila);
export const vendasEnviadasRecentes = (): Venda[] => clone(estado.enviadas);
export const vendasComProblema = (): Venda[] => clone(estado.problemas);

export async function marcarVendaEnviada(id: string, numero?: number): Promise<void> {
    const i = estado.fila.findIndex(v => v.id === id);
    if (i < 0) return;
    const [v] = estado.fila.splice(i, 1);
    v.numero = numero; v.enviadaEm = new Date().toISOString(); v.ultimoErro = undefined;
    diario('venda-enviada', { venda: id, numero, comanda: v.comanda, total: v.total, itens: v.itens });
    // Já está no banco (e no diário): guarda só o RESUMO. O arquivo é regravado inteiro a cada
    // lançamento -- itens completos de 3 dias de vendas deixariam cada Enter mais lento.
    v.itens = [];
    estado.enviadas.push(v);
    await persistir();
}

export async function registrarFalhaEnvio(id: string, erro: string, permanente: boolean): Promise<void> {
    const i = estado.fila.findIndex(v => v.id === id);
    if (i < 0) return;
    const v = estado.fila[i];
    v.tentativas += 1; v.ultimoErro = erro;
    if (permanente) {
        estado.fila.splice(i, 1);
        estado.problemas.push(v);
        diario('venda-com-problema', { venda: id, erro });
        logBalcao(`VENDA RECUSADA pelo banco (separada, nao trava as outras) id=${id}: ${erro}`);
    }
    await persistir();
}

export async function marcarNotaDisparada(id: string): Promise<void> {
    const v = estado.enviadas.find(x => x.id === id) || estado.fila.find(x => x.id === id);
    if (!v || v.notaDisparada) return;
    v.notaDisparada = true;
    await persistir();
}

/** Venda ainda na fila no formato de pedido, para o Histórico mostrar (marcada como pendente). */
export function vendaComoPedido(v: Venda): Order {
    const formas = Array.from(new Set(v.pagamentos.filter(p => p.valor > 0).map(p => p.forma)));
    return {
        id: v.id,
        timestamp: v.fechadaEm,
        dailyOrderNumber: 0,
        customerName: v.nome,
        orderType: 'Balcão',
        origin: 'BALCÃO',
        paymentMethod: (formas.length === 1 ? formas[0] : 'Misto') as any,
        status: 'Entregue',
        items: clone(v.itens),
        total: v.total,
        discount: v.desconto,
        tax: v.taxa,
        table_number: v.comanda,
        store_id: v.storeId,
        statusHistory: [{ status: 'Novo', timestamp: v.abertaEm }, { status: 'Entregue', timestamp: v.fechadaEm }] as any,
        pagamentos: v.pagamentos.map(p => ({ forma: p.forma, valor: p.valor })),
        pendenteEnvio: true,
    } as Order;
}

/** Só para os testes: zera o armazém em memória. */
export function __reiniciarArmazemParaTeste(ativo = true) {
    estado = { ...estadoVazio(), ativo };
    carregado = true;
    erroDisco = null;
    // Como no app real: ligar o interruptor GRAVA no disco (senão um "reinício" no teste voltava desligado).
    persistir();
}

/** Só para os testes: "desliga o PC" -- esquece a memória; o próximo carregarArmazem() lê do disco. */
export async function __simularReinicioParaTeste() {
    await gravacao;
    estado = estadoVazio();
    carregado = false;
}

/** Só para os testes: retrato do estado (para comparar antes/depois de reiniciar). */
export const __retratoParaTeste = () => clone({ pedidos: estado.pedidos, pagamentosMesa: estado.pagamentosMesa, fila: estado.fila, ativo: estado.ativo });
