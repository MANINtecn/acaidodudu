/**
 * Plano de fechamento de uma mesa/comanda (checkout) -- 15/10/2026.
 *
 * Problema real (pedido #165, sexta 09/10/2026): o total mostrado no checkout vem da lista LOCAL de
 * pedidos, mas o rateio usava os sub-pedidos do BANCO. Com as duas fontes diferentes (segundo peso que
 * nao foi gravado, lista local atrasada, ou "AVANCAR" de UM sub-pedido com o total so dele), o total
 * inteiro caia no unico sub-pedido que o banco tinha e a venda era gravada errada, em silencio.
 *
 * Regras:
 *  1. O total da tela (antes de desconto/taxa) TEM que bater com a soma dos sub-pedidos do banco.
 *     Se nao bater, NAO fecha: quem chama atualiza a lista e pede para tentar de novo.
 *  2. Sem desconto e sem taxa, cada sub-pedido MANTEM o proprio total (a soma sai sozinha).
 *  3. Com desconto/taxa, rateia proporcional ao total de cada um; o ultimo absorve o centavo.
 */

export interface SubPedidoDoBanco { id: string; total: number }
export interface DetalhesFechamento { discount: number; tax: number; finalTotal: number }

export type PlanoFechamento =
    | { ok: true; partes: { id: string; total: number }[] }
    | { ok: false; totalTela: number; totalBanco: number };

const TOLERANCIA = 0.02;
const arred = (n: number) => Number(n.toFixed(2));

export function planejarFechamentoMesa(
    subPedidos: SubPedidoDoBanco[],
    totalTela: number,
    d: DetalhesFechamento,
): PlanoFechamento {
    const totais = subPedidos.map(s => Number(s.total) || 0);
    const totalBanco = arred(totais.reduce((a, b) => a + b, 0));

    if (subPedidos.length === 0 || Math.abs(totalBanco - (Number(totalTela) || 0)) > TOLERANCIA) {
        return { ok: false, totalTela: arred(Number(totalTela) || 0), totalBanco };
    }

    const semAjuste = Math.abs(d.discount || 0) < 0.005 && Math.abs(d.tax || 0) < 0.005;
    if (semAjuste) {
        return { ok: true, partes: subPedidos.map((s, i) => ({ id: s.id, total: totais[i] })) };
    }

    let acumulado = 0;
    const partes = subPedidos.map((s, i) => {
        const ehUltimo = i === subPedidos.length - 1;
        const parte = ehUltimo
            ? arred(d.finalTotal - acumulado)
            : arred(totais[i] / (totalBanco || 1) * d.finalTotal);
        acumulado += parte;
        return { id: s.id, total: parte };
    });
    return { ok: true, partes };
}
