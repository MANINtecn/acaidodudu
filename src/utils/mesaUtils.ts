/**
 * Mesa e nome da comanda.
 *
 * POR QUE ISTO EXISTE:
 * `table_number` chega do Supabase como STRING ("1"), mas o codigo comparava
 * com `=== numeroMesa` (number). "1" === 1 e false, entao o atalho da aba
 * Pedidos dizia "mesa nao tem comanda aberta" com a comanda visivel na tela.
 * O types.ts declarava `number`, e por isso o tsc nunca acusou.
 */

/** Compara mesa sem se importar se veio string ou number do banco. */
export function mesmaMesa(a: number | string | null | undefined,
                          b: number | string | null | undefined): boolean {
    if (a === null || a === undefined || a === '') return false;
    if (b === null || b === undefined || b === '') return false;
    return Number(a) === Number(b);
}

/**
 * Tira o prefixo "Mesa N · " e devolve so o nome que o operador digitou.
 *
 * O CounterTab salva os dois juntos no mesmo campo ("Mesa 1 · TECX SISTEMAS"),
 * entao exibir o customerName cru ao lado de "MESA 1" duplicava o numero:
 * "MESA 1 · MESA 1 · TECX SIS...".
 *
 *   "Mesa 1 · TECX SISTEMAS" -> "TECX SISTEMAS"
 *   "Mesa 1"                 -> ""   (nao e nome de ninguem)
 *   "TECX SISTEMAS"          -> "TECX SISTEMAS"
 */
export function nomeSemPrefixoDeMesa(nome?: string | null): string {
    const limpo = (nome || '').trim();
    if (!limpo) return '';

    // "Mesa 1 · Fulano" / "Mesa 1 - Fulano" / "Mesa 1: Fulano"
    const comSeparador = limpo.match(/^mesa\s*\d+\s*[·\-:|]\s*(.+)$/i);
    if (comSeparador) return comSeparador[1].trim();

    // "Mesa 1" puro: o padrao automatico, sem nome de cliente.
    if (/^mesa\s*\d+$/i.test(limpo)) return '';

    return limpo;
}

/** Primeiro nome real entre os pedidos de uma mesa (pode vir no 2o pedido). */
export function nomeDaComanda(pedidos: { customerName?: string }[]): string {
    for (const p of pedidos) {
        const nome = nomeSemPrefixoDeMesa(p.customerName);
        if (nome) return nome;
    }
    return '';
}
