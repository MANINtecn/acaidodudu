/**
 * Decisão do ENTER na comanda (Balcão V2) quando existe uma balança automática.
 *
 * Regra (pedido do Ikarus, 05/10/2026):
 *   Enter = lança o peso NOVO que está na balança. Se não há peso novo, Enter = envia a comanda.
 *
 * "Peso novo" = estável, maior que zero e ainda NÃO lançado. Depois de lançar, o peso vira
 * "já lançado" e só volta a ser "novo" quando a balança passar por zero (prato retirado).
 * Assim o 2º Enter (com o prato ainda na balança) envia, e um prato diferente é pesado de
 * novo depois de tirar o anterior. Se o cliente acrescentar comida no MESMO prato, o peso
 * não é relançado (evita contar 0,35 kg + 0,42 kg do mesmo prato).
 *
 * Função pura: não lê estado de tela, só os valores que recebe (por isso é testável).
 */

/** Abaixo disso a balança está "zerada" (tolerância de deriva do zero). */
export const PESO_ZERO_KG = 0.005;

/** Depois de avisar "aguarde estabilizar", um 2º Enter dentro deste prazo envia mesmo assim. */
export const PRAZO_SEGUNDO_ENTER_MS = 4000;

export type DecisaoEnterComPeso = 'lancar-peso' | 'enviar' | 'aguardar-estabilizar';

export interface EntradaDecisaoEnter {
    /** Peso atual da balança em kg (0 se desconectada/muda). */
    peso: number;
    /** Balança declarou o peso estável (3 leituras iguais). */
    estavel: boolean;
    /** Este prato já foi lançado e a balança ainda não passou por zero. */
    pesoJaLancado: boolean;
    carrinhoVazio: boolean;
    /** A comanda já tem pedido gravado no banco. */
    temPedidoAnterior: boolean;
    /** Há quantos ms o operador recebeu o aviso "aguarde estabilizar" (undefined = não recebeu). */
    msDesdeAvisoEstabilizar?: number;
}

export function decidirEnterComPeso(e: EntradaDecisaoEnter): DecisaoEnterComPeso {
    // Esvaziou a comanda de propósito (carrinho vazio + pedido já existia): Enter EXCLUI
    // a comanda (regra de 02/10). Nunca lançar peso por cima disso.
    if (e.carrinhoVazio && e.temPedidoAnterior) return 'enviar';

    const temPeso = e.peso > PESO_ZERO_KG;
    if (!temPeso || e.pesoJaLancado) return 'enviar';

    if (e.estavel) return 'lancar-peso';

    // Há peso mas ainda oscilando: não envia calado (o peso se perderia). Avisa; se o
    // operador insistir com outro Enter logo em seguida, deixa enviar.
    if (e.msDesdeAvisoEstabilizar !== undefined && e.msDesdeAvisoEstabilizar < PRAZO_SEGUNDO_ENTER_MS) {
        return 'enviar';
    }
    return 'aguardar-estabilizar';
}
