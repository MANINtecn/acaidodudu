/**
 * O que fazer com os dígitos já digitados no Balcão V2 (código do produto cai na hora, sem Enter).
 *
 * Código de produto é sempre >= 100 (1..30 são números de comanda/mesa). Regras:
 *   - menos de 100 .................. 'esperar' (é comanda: precisa do Enter)
 *   - código existe e é único ....... 'lancar' (ou 'indisponivel')
 *   - é prefixo de um código maior .. 'esperar' (ex.: 100 e 1000 -- espera o Enter)
 *   - 3+ dígitos e nada começa assim  'nao-encontrado'
 * Função pura (testável): só olha os dados que recebe.
 */
export interface ProdutoComCodigo { codigo?: number | null; isAvailable?: boolean }

export type ResolucaoCodigo<P extends ProdutoComCodigo> =
    | { tipo: 'esperar' }
    | { tipo: 'lancar'; produto: P }
    | { tipo: 'indisponivel'; produto: P }
    | { tipo: 'nao-encontrado'; numero: number };

export function resolverCodigoDigitado<P extends ProdutoComCodigo>(digitos: string, produtos: P[]): ResolucaoCodigo<P> {
    const numero = parseInt(digitos, 10);
    if (!(numero >= 100)) return { tipo: 'esperar' };
    const txt = String(numero);
    const ambiguo = produtos.some(p => p.codigo != null && String(p.codigo) !== txt && String(p.codigo).startsWith(txt));
    if (ambiguo) return { tipo: 'esperar' };
    const produto = produtos.find(p => p.codigo === numero);
    if (produto) return produto.isAvailable === false ? { tipo: 'indisponivel', produto } : { tipo: 'lancar', produto };
    return digitos.length >= 3 ? { tipo: 'nao-encontrado', numero } : { tipo: 'esperar' };
}
