/**
 * Contas da comissão, da saúde das lojas e da auditoria de cancelamentos (30/10/2026).
 * Tudo função pura (sem tela e sem rede) para poder ser testada com números. Alimenta o Super Admin.
 *
 * Premissas (propostas, o Ikarus confirma): a comissão incide sobre o valor dos PRODUTOS, sem a taxa de
 * entrega; com entrega pelo app o frete inteiro vai para o motoboy; com entrega do lojista o frete fica com ele.
 */
import type { LojaFinanceiro } from '../types';

export type MeioDePagamento = 'dinheiro' | 'pix' | 'credito' | 'debito';
export type QuemEntrega = 'propria' | 'app';

/** Taxas de recebimento do gateway. Valores da página de preços do Asaas em 30/10/2026: CONFIRME na sua conta (negociável). */
export interface TaxasGateway {
    pixFixo: number;
    creditoFixo: number; creditoPct: number;
    debitoFixo: number; debitoPct: number;
}
export const TAXAS_ASAAS_PADRAO: TaxasGateway = { pixFixo: 1.99, creditoFixo: 0.49, creditoPct: 2.99, debitoFixo: 0.35, debitoPct: 1.89 };
/** Promoção dos 3 primeiros meses da conta (página do Asaas). */
export const TAXAS_ASAAS_PROMO: TaxasGateway = { pixFixo: 0.99, creditoFixo: 0.49, creditoPct: 1.99, debitoFixo: 0.35, debitoPct: 1.89 };

type Condicoes = Pick<LojaFinanceiro, 'comissao_pct_propria' | 'comissao_pct_app' | 'comissao_fixa' | 'repassa_taxa_pagamento'>;

export interface ResultadoDoPedido {
    total: number;
    /** Valor dos produtos, base da comissão. */
    baseComissao: number;
    comissao: number;
    taxaGateway: number;
    repasseLojista: number;
    repasseMotoboy: number;
    /** O que sobra para a plataforma depois do gateway. Negativo = a plataforma perde dinheiro nesse pedido. */
    margemPlataforma: number;
    /** Em dinheiro a comissão não é cobrada na hora: vira débito do lojista. */
    debitoGerado: number;
    /** Percentual do total que o lojista paga entre comissão e (se repassada) taxa do gateway. */
    custoDoLojistaPct: number;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function taxaDoGateway(total: number, meio: MeioDePagamento, t: TaxasGateway = TAXAS_ASAAS_PADRAO): number {
    switch (meio) {
        case 'pix': return r2(t.pixFixo);
        case 'credito': return r2(t.creditoFixo + (total * t.creditoPct) / 100);
        case 'debito': return r2(t.debitoFixo + (total * t.debitoPct) / 100);
        default: return 0;
    }
}

/**
 * Conta de um pedido: quanto fica para a plataforma, para o lojista e para o motoboy.
 * `total` é o que o cliente paga (produtos mais frete); `frete` é a taxa de entrega dentro dele.
 */
export function calcularPedido(args: {
    total: number; frete?: number; meio: MeioDePagamento; entrega: QuemEntrega; condicoes: Condicoes; taxas?: TaxasGateway;
}): ResultadoDoPedido {
    const { meio, entrega, condicoes } = args;
    const total = r2(args.total);
    const frete = Math.min(r2(args.frete || 0), total);
    const baseComissao = r2(total - frete);
    const pct = entrega === 'app' ? condicoes.comissao_pct_app : condicoes.comissao_pct_propria;
    const comissao = r2((baseComissao * pct) / 100 + (baseComissao > 0 ? condicoes.comissao_fixa : 0));
    const repasseMotoboy = entrega === 'app' ? frete : 0;

    if (meio === 'dinheiro') {
        // O lojista recebeu tudo em mãos; a comissão fica como débito dele.
        return { total, baseComissao, comissao, taxaGateway: 0, repasseLojista: 0, repasseMotoboy: 0, margemPlataforma: 0, debitoGerado: comissao, custoDoLojistaPct: total > 0 ? r2((comissao / total) * 100) : 0 };
    }

    const taxaGateway = taxaDoGateway(total, meio, args.taxas);
    const lojistaPagaATaxa = condicoes.repassa_taxa_pagamento;
    const repasseLojista = r2(total - repasseMotoboy - comissao - (lojistaPagaATaxa ? taxaGateway : 0));
    const margemPlataforma = r2(comissao - (lojistaPagaATaxa ? 0 : taxaGateway));
    const custoLojista = comissao + (lojistaPagaATaxa ? taxaGateway : 0);
    return { total, baseComissao, comissao, taxaGateway, repasseLojista, repasseMotoboy, margemPlataforma, debitoGerado: 0, custoDoLojistaPct: total > 0 ? r2((custoLojista / total) * 100) : 0 };
}

// ---------------- Simulador de volume (quanto a plataforma ganha por mês) ----------------
export interface SimulacaoPorEntrega {
    comissaoPorPedido: number;
    comissaoMensal: number;
    /** O que o lojista paga de comissão, em % do ticket (sem contar a taxa do pagamento online). */
    custoDoLojistaPct: number;
    lojistaRecebePorPedido: number;
    lojistaRecebeMes: number;
}

/**
 * Comissão de um volume: ticket médio dos PRODUTOS e quantidade de pedidos por mês.
 * A forma de pagamento não entra: com a taxa do pagamento online repassada ao lojista, a plataforma
 * recebe a comissão inteira no Pix, no cartão ou em dinheiro (que vira débito e depois é cobrado).
 */
export function simularVolume(args: { ticket: number; pedidosPorMes: number; pct: number; fixa: number }): SimulacaoPorEntrega {
    const ticket = Math.max(0, Number(args.ticket) || 0);
    const pedidos = Math.max(0, Math.floor(Number(args.pedidosPorMes) || 0));
    const comissao = r2((ticket * (Number(args.pct) || 0)) / 100 + (ticket > 0 ? Math.max(0, Number(args.fixa) || 0) : 0));
    return {
        comissaoPorPedido: comissao,
        comissaoMensal: r2(comissao * pedidos),
        custoDoLojistaPct: ticket > 0 ? r2((comissao / ticket) * 100) : 0,
        lojistaRecebePorPedido: r2(ticket - comissao),
        lojistaRecebeMes: r2((ticket - comissao) * pedidos),
    };
}

/** Receita do mês quando parte dos pedidos é entregue pelo app e o resto pelo lojista. */
export function receitaComMistura(propria: SimulacaoPorEntrega, app: SimulacaoPorEntrega, pedidosPorMes: number, pctPeloApp: number): { pedidosApp: number; pedidosProprios: number; comissaoMensal: number } {
    const total = Math.max(0, Math.floor(Number(pedidosPorMes) || 0));
    const pedidosApp = Math.round((total * Math.min(100, Math.max(0, Number(pctPeloApp) || 0))) / 100);
    const pedidosProprios = total - pedidosApp;
    return { pedidosApp, pedidosProprios, comissaoMensal: r2(propria.comissaoPorPedido * pedidosProprios + app.comissaoPorPedido * pedidosApp) };
}

/** Quanto o gateway cobra por pedido nesse ticket em cada meio (a plataforma só sente isso se NÃO repassar a taxa ao lojista). */
export function taxasPorMeio(ticket: number, taxas: TaxasGateway = TAXAS_ASAAS_PADRAO): { pix: number; credito: number; debito: number } {
    return { pix: taxaDoGateway(ticket, 'pix', taxas), credito: taxaDoGateway(ticket, 'credito', taxas), debito: taxaDoGateway(ticket, 'debito', taxas) };
}

// ---------------- Saúde das lojas (sinal de vida dos computadores) ----------------
export type NivelDeContato = 'ok' | 'atencao' | 'critico';

export const MIN_ATENCAO = 5;
export const MIN_CRITICO = 30;

/** Verde até 5 min sem contato, amarelo até 30, vermelho depois; venda presa na fila sobe um nível mais cedo. */
export function nivelDeContato(ultimoContato: string | number | null | undefined, agora: number, vendasNaFila = 0): NivelDeContato {
    if (!ultimoContato) return 'critico';
    const minutos = (agora - new Date(ultimoContato).getTime()) / 60000;
    if (minutos >= MIN_CRITICO) return 'critico';
    if (minutos >= MIN_ATENCAO) return vendasNaFila > 0 ? 'critico' : 'atencao';
    return 'ok';
}

// ---------------- Auditoria de cancelamentos ----------------
export interface PedidoResumo { store_id: string; status: string; total: number; cancel_reason?: string | null }

export interface ResumoDeCancelamento {
    store_id: string;
    pedidos: number;
    cancelados: number;
    taxaPct: number;
    semMotivo: number;
    valorCancelado: number;
    motivos: Record<string, number>;
    /** Muito cancelamento em loja de comissão pode ser fuga da comissão. Só avisa com amostra mínima. */
    suspeito: boolean;
}

export const LIMITE_CANCELAMENTO_PCT = 25;
export const AMOSTRA_MINIMA = 8;

export function resumirCancelamentos(pedidos: PedidoResumo[]): ResumoDeCancelamento[] {
    const por = new Map<string, ResumoDeCancelamento>();
    for (const p of pedidos) {
        const r = por.get(p.store_id) || { store_id: p.store_id, pedidos: 0, cancelados: 0, taxaPct: 0, semMotivo: 0, valorCancelado: 0, motivos: {}, suspeito: false };
        r.pedidos += 1;
        if (p.status === 'Cancelado') {
            r.cancelados += 1;
            r.valorCancelado = r2(r.valorCancelado + (Number(p.total) || 0));
            const m = (p.cancel_reason || '').trim();
            if (!m) r.semMotivo += 1; else { const chave = m.startsWith('Outro motivo') ? 'Outro motivo' : m; r.motivos[chave] = (r.motivos[chave] || 0) + 1; }
        }
        por.set(p.store_id, r);
    }
    for (const r of por.values()) {
        r.taxaPct = r.pedidos > 0 ? r2((r.cancelados / r.pedidos) * 100) : 0;
        r.suspeito = r.pedidos >= AMOSTRA_MINIMA && r.taxaPct >= LIMITE_CANCELAMENTO_PCT;
    }
    return Array.from(por.values()).sort((a, b) => b.taxaPct - a.taxaPct || b.cancelados - a.cancelados);
}

/** Pedido de loja de comissão que não é de Balcão do PC (os do site e do app). */
export const ehPedidoOnline = (origin?: string | null) => (origin || '') !== 'BALCÃO';

/** Estimativa de comissão de um conjunto de pedidos (sem cobrança real ainda): cartão conta como crédito à vista. */
export function estimarComissao(pedidos: { total: number; delivery_fee?: number | null; payment_method?: string | null; status: string }[], cond: Condicoes, taxas?: TaxasGateway) {
    let comissao = 0, margem = 0, debito = 0, vendas = 0, n = 0;
    for (const p of pedidos) {
        if (p.status === 'Cancelado') continue;
        const meio: MeioDePagamento = p.payment_method === 'PIX' ? 'pix' : p.payment_method === 'Cartão' ? 'credito' : 'dinheiro';
        const r = calcularPedido({ total: Number(p.total) || 0, frete: Number(p.delivery_fee) || 0, meio, entrega: 'propria', condicoes: cond, taxas });
        comissao += r.comissao; margem += r.margemPlataforma; debito += r.debitoGerado; vendas += r.total; n += 1;
    }
    return { pedidos: n, vendas: r2(vendas), comissao: r2(comissao), margem: r2(margem), debito: r2(debito) };
}
