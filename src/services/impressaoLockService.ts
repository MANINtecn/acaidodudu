/**
 * impressaoLockService — trava de impressão duplicada, garantida pelo BANCO.
 *
 * POR QUE EXISTE:
 * O pedido saía 2x mesmo com UMA só máquina. O realtime e o polling disparam o
 * mesmo pedido, e as travas em memória do AdminPage têm uma janela entre
 * "checar" e "marcar" — o segundo gatilho passa por ela. Memória também não
 * atravessa máquinas.
 *
 * COMO FUNCIONA:
 * Antes de imprimir, tentamos INSERIR uma linha em `impressoes`. A constraint
 * UNIQUE (order_id, estacao, tipo_via) faz o Postgres RECUSAR a segunda
 * inserção — de forma atômica, sem depender de timing.
 *
 *   INSERT deu certo  -> ninguém imprimiu ainda, siga
 *   INSERT recusado   -> outro gatilho já pegou, aborte em silêncio
 *
 * Se a impressão falhar, a linha é removida para permitir nova tentativa.
 */

import { supabase } from './supabaseService';
import { getConfigEstacao } from './estacaoService';

export type TipoVia = 'principal' | 'cozinha' | 'bar' | 'entregador';

/** Código do Postgres para violação de chave única. */
const VIOLACAO_UNIQUE = '23505';

/** Identifica esta máquina. Sem estação configurada, todas usam 'default'. */
function nomeDaEstacao(): string {
    const cfg = getConfigEstacao();
    const nome = (cfg?.ativo && cfg.nome?.trim()) ? cfg.nome.trim() : 'default';
    return nome.toLowerCase();
}

/**
 * Tenta reservar a impressão. Retorna true se ESTA chamada pode imprimir.
 *
 * false = outro gatilho (ou outra máquina) já reservou. Não é erro: é
 * exatamente a duplicidade sendo evitada.
 */
export async function reservarImpressao(
    orderId: string,
    storeId: string,
    tipoVia: TipoVia = 'principal'
): Promise<boolean> {
    if (!orderId || !storeId) return true;   // sem dados, não bloqueia

    try {
        const { error } = await supabase
            .from('impressoes')
            .insert({
                order_id: orderId,
                store_id: storeId,
                estacao: nomeDaEstacao(),
                tipo_via: tipoVia,
            });

        if (!error) return true;

        if (error.code === VIOLACAO_UNIQUE) {
            console.log(`[ImpressaoLock] Pedido ${orderId} (${tipoVia}) já reservado nesta estação. Ignorando gatilho duplicado.`);
            return false;
        }

        // Tabela ausente (migração não rodada) ou erro de rede: NÃO travar a
        // operação da loja por causa disso — imprimir a mais é melhor que não
        // imprimir. O log avisa que a trava não está ativa.
        console.warn('[ImpressaoLock] Trava indisponível, seguindo sem ela:', error.message);
        return true;
    } catch (err) {
        console.warn('[ImpressaoLock] Falha inesperada, seguindo sem a trava:', err);
        return true;
    }
}

/** Libera a reserva quando a impressão falha, permitindo nova tentativa. */
export async function liberarImpressao(
    orderId: string,
    tipoVia: TipoVia = 'principal'
): Promise<void> {
    if (!orderId) return;
    try {
        await supabase
            .from('impressoes')
            .delete()
            .eq('order_id', orderId)
            .eq('estacao', nomeDaEstacao())
            .eq('tipo_via', tipoVia);
    } catch (err) {
        console.warn('[ImpressaoLock] Não foi possível liberar a reserva:', err);
    }
}

/**
 * Remove todas as reservas de um pedido nesta estação.
 * Usado na reimpressão manual, que deve sempre funcionar.
 */
export async function liberarTodasAsVias(orderId: string): Promise<void> {
    if (!orderId) return;
    try {
        await supabase
            .from('impressoes')
            .delete()
            .eq('order_id', orderId)
            .eq('estacao', nomeDaEstacao());
    } catch (err) {
        console.warn('[ImpressaoLock] Não foi possível liberar as vias:', err);
    }
}
