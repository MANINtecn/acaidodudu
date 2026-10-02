import type { CartItem } from '../types';

/**
 * Valor de um carrinho: (preço + combo + adicionais) * quantidade, somado.
 * Extraída em 30/09/2026 (achado pela auditoria): o card de comanda do V2
 * tinha sua própria conta duplicada (`totalDe`) que esquecia o preço de
 * combo -- um item marcado como combo aparecia com valor menor no card do
 * que o que `handleFinalize` de fato cobra.
 *
 * Movida para cá em 01/10/2026 (auditoria do caixa não bater, cliente
 * Marlon/Açaí do Dudu): existiam DUAS OUTRAS cópias manuais deste mesmo
 * cálculo -- uma em `CounterTab.tsx` (handleFinalize, split de mesa) e duas
 * em `AdminPage.tsx` (EditOrderModal onSave) -- nenhuma delas somava
 * `comboPrice`. Um item marcado como combo ficava GRAVADO no banco com
 * total menor que o exibido na tela, divergindo silenciosamente no
 * fechamento de caixa. Uma função só, importada nos 3 lugares, evita as
 * contas divergirem de novo.
 */
export const calcularValorCarrinho = (cart: CartItem[], comboPrice?: number): number =>
    cart.reduce((sum, item) => {
        let itemPrice = Number(item.price) || 0;
        if (item.isCombo && comboPrice) {
            itemPrice += Number(comboPrice) || 0;
        }
        const addonsPrice = item.selectedAddons?.reduce((s, a) => s + (Number(a.price) || 0), 0) || 0;
        return sum + (itemPrice + addonsPrice) * item.quantity;
    }, 0);
