/**
 * Histórico em duas camadas (28/10/2026, desenho do Ikarus).
 *
 * Lado esquerdo: o que ESTE computador vendeu no Balcão (o livro do PC: fila + enviadas dos últimos 30 dias).
 * Lado direito: o que a nuvem (banco) tem de Balcão. Dia a dia, lado a lado, com a situação de cada dia.
 *
 * Regras que fazem as duas colunas igualarem quando tudo foi enviado:
 * - Compara só o BALCÃO. Pedido do site e do robô existem só na nuvem e vão numa linha à parte.
 * - Venda do PC que consta como ENVIADA mas não está mais na nuvem foi cancelada/apagada lá: sai da conta
 *   do PC (senão a coluna do PC ficaria maior para sempre). Sem resposta da nuvem não dá para saber, então entra.
 * - Venda na fila ou recusada pelo banco nunca está na nuvem: conta como "só neste computador".
 *
 * Tudo aqui é função pura (sem tela, sem rede), para poder ser testada com números.
 */
import type { Order } from '../types';
import { vendaComoPedido, type Venda } from './armazemBalcao';

export interface LivroDoPc { fila: Venda[]; enviadas: Venda[]; problemas: Venda[] }

/** Resumo de um dia como a nuvem respondeu, guardado para mostrar quando a nuvem não responder. */
export interface ResumoDiaNuvem { bq: number; bv: number; oq: number; ov: number; em: number }

export type Situacao = 'sincronizado' | 'aguardando' | 'diferenca' | 'so_nuvem' | 'sem_conexao';

export interface LinhaDia {
    dia: string;
    pcDisponivel: boolean;
    pcQtd: number;
    pcValor: number;
    nuvemQtd: number | null;
    nuvemValor: number | null;
    nuvemDeCache: boolean;
    soNoPcQtd: number;
    soNoPcValor: number;
    soNaNuvemQtd: number;
    soNaNuvemValor: number;
    uniaoQtd: number;
    uniaoValor: number;
    situacao: Situacao;
}

export interface ComparacaoPeriodo {
    linhas: LinhaDia[];
    bancoDisponivel: boolean;
    totais: {
        pcQtd: number; pcValor: number;
        nuvemQtd: number | null; nuvemValor: number | null;
        soNoPcQtd: number; soNoPcValor: number;
        uniaoQtd: number; uniaoValor: number;
    };
    /** Pedidos do site/robô/outros (não são do Balcão do PC): só se conhecem pela nuvem. */
    site: { qtd: number; valor: number; deCache: boolean } | null;
    canceladasNaNuvem: number;
    recusadas: { qtd: number; valor: number };
    /** Hora (ms) da consulta mais antiga usada do cache, quando a nuvem não respondeu. */
    cacheEm: number | null;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Dia no fuso do computador (YYYY-MM-DD). É o mesmo recorte do filtro de datas do Histórico. */
export const diaLocal = (t: string | number | Date): string => {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const ehBalcao = (o: Order) => (o.origin || '') === 'BALCÃO';

/** Resumo por dia do que a nuvem respondeu (para o cache de "último valor conhecido"). */
export function resumirNuvem(orders: Order[], agora: number): Record<string, ResumoDiaNuvem> {
    const out: Record<string, ResumoDiaNuvem> = {};
    for (const o of orders) {
        const dia = diaLocal(o.timestamp as any);
        const r = out[dia] || (out[dia] = { bq: 0, bv: 0, oq: 0, ov: 0, em: agora });
        if (ehBalcao(o)) { r.bq += 1; r.bv = r2(r.bv + o.total); } else { r.oq += 1; r.ov = r2(r.ov + o.total); }
    }
    return out;
}

const diasDoPeriodo = (inicio: string, fim: string): string[] => {
    const dias: string[] = [];
    const d = new Date(inicio + 'T12:00:00');
    const f = new Date(fim + 'T12:00:00');
    for (let guard = 0; d <= f && guard < 800; guard++) { dias.push(diaLocal(d)); d.setDate(d.getDate() + 1); }
    return dias;
};

export function compararPorDia(args: {
    livro: LivroDoPc | null;
    banco: Order[] | null;
    cache?: Record<string, ResumoDiaNuvem> | null;
    inicio: string;
    fim: string;
    agora: number;
    diasGuardando: number;
}): ComparacaoPeriodo {
    const { livro, banco, cache, inicio, fim, agora, diasGuardando } = args;
    const bancoDisponivel = banco !== null;
    const iniMs = new Date(inicio + 'T00:00:00').getTime();
    const fimMs = new Date(fim + 'T23:59:59.999').getTime();
    const retencaoDesde = agora - diasGuardando * 86400000;

    const idsBancoBalcao = new Set((banco || []).filter(ehBalcao).map(o => o.id));
    const idsPc = new Set<string>();
    if (livro) [...livro.fila, ...livro.enviadas, ...livro.problemas].forEach(v => idsPc.add(v.id));

    const linhas = new Map<string, LinhaDia>();
    const linha = (dia: string): LinhaDia => {
        let l = linhas.get(dia);
        if (!l) {
            l = {
                dia, pcDisponivel: livro !== null && new Date(dia + 'T23:59:59.999').getTime() >= retencaoDesde,
                pcQtd: 0, pcValor: 0, nuvemQtd: bancoDisponivel ? 0 : null, nuvemValor: bancoDisponivel ? 0 : null, nuvemDeCache: false,
                soNoPcQtd: 0, soNoPcValor: 0, soNaNuvemQtd: 0, soNaNuvemValor: 0, uniaoQtd: 0, uniaoValor: 0, situacao: 'sincronizado',
            };
            linhas.set(dia, l);
        }
        return l;
    };

    let canceladasNaNuvem = 0;
    const recusadas = { qtd: 0, valor: 0 };

    // --- Lado do PC ---
    if (livro) {
        const naFaixa = (v: Venda) => { const t = new Date(v.fechadaEm).getTime(); return t >= iniMs && t <= fimMs; };
        for (const v of livro.fila.filter(naFaixa)) {
            if (idsBancoBalcao.has(v.id)) { somaPc(linha(diaLocal(v.fechadaEm)), v.total); continue; } // acabou de subir
            const l = linha(diaLocal(v.fechadaEm)); somaPc(l, v.total); l.soNoPcQtd += 1; l.soNoPcValor = r2(l.soNoPcValor + v.total);
        }
        for (const v of livro.problemas.filter(naFaixa)) {
            if (idsBancoBalcao.has(v.id)) { somaPc(linha(diaLocal(v.fechadaEm)), v.total); continue; }
            const l = linha(diaLocal(v.fechadaEm)); somaPc(l, v.total); l.soNoPcQtd += 1; l.soNoPcValor = r2(l.soNoPcValor + v.total);
            recusadas.qtd += 1; recusadas.valor = r2(recusadas.valor + v.total);
        }
        for (const v of livro.enviadas.filter(naFaixa)) {
            if (bancoDisponivel && !idsBancoBalcao.has(v.id)) { canceladasNaNuvem += 1; continue; } // cancelada/apagada na nuvem
            somaPc(linha(diaLocal(v.fechadaEm)), v.total);
        }
    }
    function somaPc(l: LinhaDia, total: number) { l.pcQtd += 1; l.pcValor = r2(l.pcValor + total); }

    // --- Lado da nuvem ---
    let site: ComparacaoPeriodo['site'] = null;
    let cacheEm: number | null = null;
    if (bancoDisponivel) {
        let sq = 0, sv = 0;
        for (const o of banco!) {
            if (ehBalcao(o)) {
                const l = linha(diaLocal(o.timestamp as any));
                l.nuvemQtd = (l.nuvemQtd || 0) + 1; l.nuvemValor = r2((l.nuvemValor || 0) + o.total);
                if (l.pcDisponivel && !idsPc.has(o.id as string)) { l.soNaNuvemQtd += 1; l.soNaNuvemValor = r2(l.soNaNuvemValor + o.total); }
            } else { sq += 1; sv = r2(sv + o.total); }
        }
        site = { qtd: sq, valor: sv, deCache: false };
    } else if (cache) {
        let sq = 0, sv = 0, achou = false;
        for (const dia of diasDoPeriodo(inicio, fim)) {
            const c = cache[dia];
            if (!c) continue;
            achou = true;
            cacheEm = cacheEm === null ? c.em : Math.min(cacheEm, c.em);
            const l = linha(dia);
            l.nuvemQtd = c.bq; l.nuvemValor = c.bv; l.nuvemDeCache = true;
            sq += c.oq; sv = r2(sv + c.ov);
        }
        if (achou) site = { qtd: sq, valor: sv, deCache: true };
    }

    // --- Situação e união de cada dia ---
    const lista = Array.from(linhas.values()).sort((a, b) => a.dia.localeCompare(b.dia));
    for (const l of lista) {
        if (bancoDisponivel) {
            l.uniaoQtd = (l.nuvemQtd || 0) + l.soNoPcQtd;
            l.uniaoValor = r2((l.nuvemValor || 0) + l.soNoPcValor);
            l.situacao = !l.pcDisponivel ? 'so_nuvem' : l.soNoPcQtd > 0 ? 'aguardando' : l.soNaNuvemQtd > 0 ? 'diferenca' : 'sincronizado';
        } else {
            // Sem resposta da nuvem: vale o que o PC tem; dia fora dos 30 dias vale o último valor conhecido.
            l.uniaoQtd = l.pcDisponivel ? l.pcQtd : (l.nuvemQtd || 0);
            l.uniaoValor = l.pcDisponivel ? l.pcValor : (l.nuvemValor || 0);
            l.situacao = l.soNoPcQtd > 0 ? 'aguardando' : 'sem_conexao';
        }
    }

    const soma = (f: (l: LinhaDia) => number) => r2(lista.reduce((s, l) => s + f(l), 0));
    const temNuvem = bancoDisponivel || lista.some(l => l.nuvemQtd !== null);
    return {
        linhas: lista,
        bancoDisponivel,
        totais: {
            pcQtd: lista.reduce((s, l) => s + (l.pcDisponivel ? l.pcQtd : 0), 0),
            pcValor: soma(l => (l.pcDisponivel ? l.pcValor : 0)),
            nuvemQtd: temNuvem ? lista.reduce((s, l) => s + (l.nuvemQtd || 0), 0) : null,
            nuvemValor: temNuvem ? soma(l => l.nuvemValor || 0) : null,
            soNoPcQtd: lista.reduce((s, l) => s + l.soNoPcQtd, 0),
            soNoPcValor: soma(l => l.soNoPcValor),
            uniaoQtd: lista.reduce((s, l) => s + l.uniaoQtd, 0),
            uniaoValor: soma(l => l.uniaoValor),
        },
        site,
        canceladasNaNuvem,
        recusadas,
        cacheEm,
    };
}

/**
 * Lista de vendas do período, unindo nuvem e livro do PC sem duplicar (pelo id).
 * Venda na fila/recusada entra marcada como pendente. Sem resposta da nuvem, as já enviadas
 * entram também (vindas do livro do PC), para o Histórico nunca ficar vazio por falta de internet.
 */
export function montarListaUnificada(args: { banco: Order[] | null; livro: LivroDoPc | null; inicio: string; fim: string }): Order[] {
    const { banco, livro, inicio, fim } = args;
    const iniMs = new Date(inicio + 'T00:00:00').getTime();
    const fimMs = new Date(fim + 'T23:59:59.999').getTime();
    const naFaixa = (v: Venda) => { const t = new Date(v.fechadaEm).getTime(); return t >= iniMs && t <= fimMs; };
    const ids = new Set((banco || []).map(o => o.id));
    const doPc: Order[] = [];
    if (livro) {
        for (const v of [...livro.fila, ...livro.problemas].filter(naFaixa)) if (!ids.has(v.id)) doPc.push(vendaComoPedido(v));
        if (banco === null) {
            for (const v of livro.enviadas.filter(naFaixa)) doPc.push({ ...vendaComoPedido(v), pendenteEnvio: false, viaLivroDoPc: true });
        }
    }
    doPc.sort((a, b) => new Date(b.timestamp as any).getTime() - new Date(a.timestamp as any).getTime());
    return [...doPc, ...(banco || [])];
}

// ---------------- Cache do "último valor conhecido da nuvem" ----------------
const CHAVE = (storeId: string) => `historico_nuvem_v1:${storeId}`;
const DIAS_NO_CACHE = 90;

export interface ArmazemSimples { getItem(k: string): string | null; setItem(k: string, v: string): void }

export function lerCacheNuvem(storeId: string, st: ArmazemSimples | null): Record<string, ResumoDiaNuvem> | null {
    try {
        const t = st?.getItem(CHAVE(storeId));
        return t ? JSON.parse(t) : null;
    } catch (_) { return null; }
}

export function gravarCacheNuvem(storeId: string, resumos: Record<string, ResumoDiaNuvem>, inicio: string, fim: string, agora: number, st: ArmazemSimples | null) {
    try {
        if (!st) return;
        const atual = lerCacheNuvem(storeId, st) || {};
        // Os dias consultados valem pela resposta de agora (inclusive os que vieram vazios).
        for (const dia of diasDoPeriodo(inicio, fim)) delete atual[dia];
        Object.assign(atual, resumos);
        const corte = diaLocal(agora - DIAS_NO_CACHE * 86400000);
        for (const dia of Object.keys(atual)) if (dia < corte) delete atual[dia];
        st.setItem(CHAVE(storeId), JSON.stringify(atual));
    } catch (_) { /* sem storage: só perde o "último valor conhecido" */ }
}
