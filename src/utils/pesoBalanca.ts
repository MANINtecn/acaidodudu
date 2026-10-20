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

// ---------------------------------------------------------------------------
// 19/10/2026 -- peso que muda SEM a balança zerar (bateria scripts/teste-balcao/balanca.tsx)
// ---------------------------------------------------------------------------
// Caso real: 18/10 19h16, comanda 5 (#415). Prato 0,136 lançado, trocado DIRETO pelo de 0,085 sem a
// balança passar por zero: a regra acima achou que era o mesmo prato e o Enter ENVIOU a comanda --
// o 2º peso nunca entrou (a atendente cobrou R$ 5,47 de acréscimo na mão). A bateria achou mais 4
// perdas iguais: troca para prato mais pesado, resto de 16 g na balança, "mais comida no mesmo prato"
// (cobrava o peso antigo) e troca de prato entre comandas (a marca "já lançado" valia para todas).
// O app não tem como saber se peso que mudou é OUTRO prato ou MAIS comida -- então PERGUNTA, nunca
// envia calado.

/** Diferença acima da qual o peso "mudou" (abaixo disso é o mesmo prato, só ruído). */
export const PESO_MUDOU_KG = 0.010;

export interface UltimoPesoLancado { comanda: number; kg: number }

/**
 * O prato lançado foi RETIRADO? Sem peso mínimo de venda (sorvete/açaí no peso), então a regra é
 * relativa: zerou (< 5 g) OU caiu abaixo da metade do que foi lançado (resto/migalha na balança).
 */
export function pratoFoiRetirado(pesoAtual: number, ultimo: UltimoPesoLancado | null): boolean {
    if (!ultimo) return true;
    return pesoAtual <= PESO_ZERO_KG || pesoAtual < ultimo.kg * 0.5;
}

export type DecisaoEnterComBalanca =
    | 'lancar-peso'
    | 'enviar'
    | 'aguardar-estabilizar'
    /** Mesma comanda, peso mudou sem zerar: outro prato? mais comida? */
    | 'confirmar-mudou'
    /** O MESMO peso acabou de ser lançado em OUTRA comanda (prato não foi tirado). */
    | 'confirmar-outra-comanda';

export interface EntradaDecisaoComBalanca {
    peso: number;
    estavel: boolean;
    /** Último peso lançado cujo prato ainda NÃO foi retirado (null = balança livre). */
    ultimoLancado: UltimoPesoLancado | null;
    comandaAtual: number;
    carrinhoVazio: boolean;
    temPedidoAnterior: boolean;
    msDesdeAvisoEstabilizar?: number;
}

export function decidirEnterComBalanca(e: EntradaDecisaoComBalanca): DecisaoEnterComBalanca {
    // Esvaziou a comanda de propósito (carrinho vazio + pedido já existia): Enter EXCLUI (regra de 02/10).
    if (e.carrinhoVazio && e.temPedidoAnterior) return 'enviar';
    if (e.peso <= PESO_ZERO_KG) return 'enviar';

    const insistiu = e.msDesdeAvisoEstabilizar !== undefined && e.msDesdeAvisoEstabilizar < PRAZO_SEGUNDO_ENTER_MS;
    const u = e.ultimoLancado;
    if (u) {
        const mudou = Math.abs(e.peso - u.kg) > PESO_MUDOU_KG;
        if (u.comanda === e.comandaAtual) {
            if (!mudou) return 'enviar'; // mesmo prato: 2º Enter envia (regra de 05/10, mantida)
            return (e.estavel || insistiu) ? 'confirmar-mudou' : 'aguardar-estabilizar';
        }
        if (!mudou) return (e.estavel || insistiu) ? 'confirmar-outra-comanda' : 'aguardar-estabilizar';
        // outra comanda e peso diferente: é prato novo -- segue como peso novo
    }
    if (e.estavel) return 'lancar-peso';
    // 19/10/2026 (relato da atendente + balanca.tsx S21): o 2º Enter com a balança ainda firmando ENVIAVA a
    // comanda sem o prato ("só o peso 1 fica, o outro some"). Agora lança o peso que está na tela -- como o
    // programa antigo: alguns gramas a mais ou a menos não importam, perder o prato importa.
    return insistiu ? 'lancar-peso' : 'aguardar-estabilizar';
}
