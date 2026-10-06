/**
 * Reconciliação do RASCUNHO de uma comanda com o que já está no banco (Balcão V2) -- auditoria
 * de 05/10/2026.
 *
 * Problema real (#13 -> #15 -> #17..#20): o rascunho local guardava itens que JÁ tinham sido
 * enviados. Ao reabrir a comanda, o rascunho valia mais que o banco e o próximo Enter criava
 * um pedido NOVO com tudo de novo (valores duplicados na comanda).
 *
 * Regra: o BANCO manda no que já foi enviado; o rascunho só contribui com o que ainda é do
 * operador (item novo não enviado e edição pendente de item já enviado).
 *   S = itens (cartId) que o rascunho sabia estarem enviados (rascunho.pedidosDaMesa)
 *   D = itens (cartId) que estão no banco agora
 *   - cartId em S e em D  -> edição pendente (ex.: quantidade): mantém a versão do rascunho
 *   - cartId em S, fora de D -> sumiu do banco (cancelado/pago/resetado): descarta
 *   - cartId fora de S, em D -> foi enviado depois do rascunho: descarta a cópia do rascunho e
 *                               usa a do banco (é o caso que duplicava)
 *   - cartId fora de S e de D -> item novo ainda não enviado: mantém
 */

export interface ItemComCartId { cartId?: string }
export interface PedidoComItens<I extends ItemComCartId = ItemComCartId> { id?: string; items?: I[] }

export interface RascunhoComanda<I extends ItemComCartId, P extends PedidoComItens<I>> {
    cart: I[];
    customerName: string;
    pedidosDaMesa: P[];
    currentOrderId: string | null;
    /** Quando foi salvo (ms). Sem isto ou com mais de 12 h, o rascunho é lixo de outro turno. */
    salvoEm?: number;
}

/** Rascunho de comanda só faz sentido no mesmo turno de trabalho. */
export const VALIDADE_RASCUNHO_MS = 12 * 60 * 60 * 1000;

export function rascunhoEstaValido(r: { salvoEm?: number } | null | undefined, agora = Date.now()): boolean {
    return !!r && typeof r.salvoEm === 'number' && agora - r.salvoEm >= 0 && agora - r.salvoEm <= VALIDADE_RASCUNHO_MS;
}

export function reconciliarRascunho<I extends ItemComCartId, P extends PedidoComItens<I>>(
    rascunho: RascunhoComanda<I, P>,
    abertos: P[],
): { cart: I[]; pedidosDaMesa: P[]; currentOrderId: string | null; customerName: string } {
    const idsDe = (pedidos: P[]) => new Set(pedidos.flatMap(p => (p.items || []).map(i => i.cartId)));
    const S = idsDe(rascunho.pedidosDaMesa || []);
    const itensDoBanco = abertos.flatMap(p => p.items || []);
    const D = new Set(itensDoBanco.map(i => i.cartId));

    const doRascunho = (rascunho.cart || []).filter(i => {
        if (S.has(i.cartId)) return D.has(i.cartId); // edição pendente só se ainda existe no banco
        return !D.has(i.cartId);                      // já enviado depois do rascunho -> usa o do banco
    });
    const doBancoNovo = itensDoBanco.filter(i => !S.has(i.cartId));

    return {
        // Ordem na tela: o que ja estava na comanda, o que chegou do banco, e por ultimo o pendente.
        cart: abertos.length > 0
            ? [...doRascunho.filter(i => S.has(i.cartId)), ...doBancoNovo, ...doRascunho.filter(i => !S.has(i.cartId))]
            : doRascunho,
        pedidosDaMesa: abertos,
        currentOrderId: abertos[0]?.id ?? null,
        customerName: rascunho.customerName,
    };
}

interface ItemParaComparar extends ItemComCartId {
    quantity?: number;
    price?: number;
    notes?: string;
    selectedAddons?: { id: string | number }[];
}

const chaveDoItem = (i: ItemParaComparar) =>
    `${i.cartId}|${Number(i.quantity) || 1}|${Number(i.price) || 0}|${(i.selectedAddons || []).map(a => String(a.id)).sort().join('+')}|${i.notes || ''}`;

/**
 * A comanda na tela tem algo que o banco ainda não tem? (item novo, quantidade/adicional/obs
 * alterados, item removido). Usada pelo F7/F8 para enviar ANTES de abrir o checkout -- antes só
 * enviava se a comanda nunca tivesse sido enviada, então item acrescentado numa comanda já
 * enviada ficava de fora da conta (e sumia ao fechar). Também decide se vale guardar rascunho.
 */
export function comandaTemPendencia<I extends ItemParaComparar, P extends { items?: I[] }>(cart: I[], pedidos: P[]): boolean {
    const salvos = pedidos.flatMap(p => p.items || []).map(chaveDoItem).sort();
    const atuais = cart.map(chaveDoItem).sort();
    if (salvos.length !== atuais.length) return true;
    return salvos.some((k, idx) => k !== atuais[idx]);
}
