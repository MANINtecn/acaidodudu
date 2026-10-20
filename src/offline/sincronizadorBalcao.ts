/**
 * Sincronizador do Balcão V2 offline (15/10/2026).
 *
 * Sobe as vendas fechadas (fila do armazemBalcao) para o banco, UMA POR VEZ, NA ORDEM
 * em que foram fechadas -- o banco numera na chegada, nessa ordem.
 *
 * Nunca duplica: a venda tem um id gerado no PC (= orders.id) e a gravação é
 * `upsert ... ignoreDuplicates`. Se o banco gravou e a resposta se perdeu, a
 * tentativa seguinte é ignorada pelo banco e a venda é confirmada lendo pelo id.
 *
 * Quando roda: logo depois de fechar (dispararEnvio), quando a internet volta, a cada
 * 20 s e ao abrir o app. Ninguém espera por ele: a tela já fechou.
 *
 * Funciona com ou sem as mudanças de 15/10 no banco (coluna `pagamentos` e tabela
 * `pdv_heartbeat`): sem a coluna, grava sem ela; sem a tabela, o sinal de vida só falha
 * em silêncio.
 */
import {
    vendasNaFila, marcarVendaEnviada, registrarFalhaEnvio, marcarNotaDisparada, identificadorMaquina,
    vendasEnviadasRecentes, logBalcao, type Venda,
} from './armazemBalcao';

/** Cliente mínimo do supabase-js que o sincronizador usa (facilita o teste com banco falso). */
export interface ClienteBanco {
    from: (tabela: string) => any;
}

interface Opcoes {
    supabase: ClienteBanco;
    versaoApp?: string;
    /** Emite NFC-e depois que a venda chega (mesma regra do createOrder). Opcional. */
    emitirNota?: (vendaComoPedido: any, storeId: string) => Promise<void>;
    intervaloMs?: number;
    timeoutMs?: number;
}

let opcoes: Opcoes | null = null;
let rodando = false;
let pedidoDeNovo = false;
let proximaTentativaEm = 0;
let falhasSeguidas = 0;
/** Até quando enviar SEM a coluna `pagamentos` (banco ainda sem ela). Volta a tentar a cada 10 min:
 *  quem rodar o SQL com o app aberto não precisa reiniciar o app (achado no teste fila.ts). */
let semColunaPagamentosAte = 0;
const semColunaPagamentos = () => Date.now() < semColunaPagamentosAte;
export const __forcarRecheckColunaParaTeste = () => { semColunaPagamentosAte = 0; };
let timer: any = null;
let timerVida: any = null;
const ESPERAS = [2000, 5000, 15000, 30000, 60000];

export type EstadoEnvio = { naFila: number; valorNaFila: number; ultimoErro?: string; enviandoAgora: boolean };
export const estadoEnvio = (): EstadoEnvio => {
    const fila = vendasNaFila();
    return {
        naFila: fila.length,
        valorNaFila: Number(fila.reduce((s, v) => s + v.total, 0).toFixed(2)),
        ultimoErro: fila[0]?.ultimoErro,
        enviandoAgora: rodando,
    };
};

const comTempoLimite = <T,>(p: Promise<T>, ms: number): Promise<T> =>
    Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`sem resposta em ${ms / 1000}s`)), ms))]);

/** Erro que tentar de novo pode resolver (rede, servidor fora, sobrecarga)? */
function erroTemporario(e: any): boolean {
    if (!e) return true;
    const status = Number(e.status || e.statusCode || 0);
    if (status === 408 || status === 429 || status >= 500) return true;
    // Erro do banco (código do Postgres/PostgREST): tentar de novo não resolve -- EXCETO conexão,
    // conflito de transação, sobrecarga e tempo esgotado (classes 08, 40, 53, 57).
    // (O erro do PostgREST não traz status HTTP: tratar "sem status" como rede segurava a fila
    // inteira atrás de uma venda recusada -- achado no teste fila.ts, 15/10/2026.)
    const code = String(e.code || '');
    if (code) return /^(08|40|53|57)/.test(code);
    // Sem código: rede caiu, tempo esgotado, fetch falhou.
    return true;
}

const faltaColunaPagamentos = (e: any) => /pagamentos/i.test(String(e?.message || '')) && /(column|coluna|schema cache)/i.test(String(e?.message || ''));

export function formaPrincipal(v: Venda): string {
    const formas = Array.from(new Set(v.pagamentos.filter(p => p.valor > 0).map(p => p.forma)));
    return formas.length === 1 ? formas[0] : formas.length === 0 ? (v.pagamentos[0]?.forma || 'Dinheiro') : 'Misto';
}

/** A linha que vai para `orders` (mesmos campos que o app já grava; itens UMA vez só). */
export function linhaDoPedido(v: Venda, comPagamentos: boolean): any {
    const dinheiro = v.pagamentos.find(p => p.forma === 'Dinheiro' && p.recebido);
    const linha: any = {
        id: v.id,
        store_id: v.storeId,
        timestamp: v.fechadaEm,
        customer_name: v.nome,
        address: `Comanda ${v.comanda}`,
        order_type: 'Balcão',
        payment_method: formaPrincipal(v),
        status: 'Entregue',
        change_for: dinheiro ? String(dinheiro.recebido) : undefined,
        items: v.itens,
        total: v.total,
        printed: true,
        table_number: v.comanda,
        comanda_number: v.comanda,
        discount: v.desconto,
        tax: v.taxa,
        delivery_fee: 0,
        origin: 'BALCÃO',
        status_history: [
            { status: 'Novo', timestamp: v.abertaEm },
            { status: 'Entregue', timestamp: v.fechadaEm },
        ],
        is_loyalty_eligible: (v.total + (v.desconto || 0)) >= 35,
    };
    if (comPagamentos) linha.pagamentos = v.pagamentos;
    Object.keys(linha).forEach(k => linha[k] === undefined && delete linha[k]);
    return linha;
}

async function enviarUma(v: Venda): Promise<'ok' | 'temporario' | 'permanente'> {
    const sb = opcoes!.supabase;
    const timeout = opcoes!.timeoutMs ?? 15000;
    try {
        let r = await comTempoLimite<any>(sb.from('orders').upsert(linhaDoPedido(v, !semColunaPagamentos()), { onConflict: 'id', ignoreDuplicates: true }), timeout);
        if (r?.error && !semColunaPagamentos() && faltaColunaPagamentos(r.error)) {
            semColunaPagamentosAte = Date.now() + 10 * 60 * 1000;
            logBalcao('coluna orders.pagamentos nao existe ainda: enviando sem ela');
            r = await comTempoLimite<any>(sb.from('orders').upsert(linhaDoPedido(v, false), { onConflict: 'id', ignoreDuplicates: true }), timeout);
        }
        if (r?.error) throw r.error;
        // Confirma pelo id (cobre "gravou mas a resposta se perdeu" e o caso ignorado por já existir)
        const c = await comTempoLimite<any>(sb.from('orders').select('id,daily_order_number').eq('id', v.id).maybeSingle(), timeout);
        if (c?.error) throw c.error;
        if (!c?.data) throw new Error('banco nao confirmou a venda');
        const jaTinhaNota = v.notaDisparada;
        await marcarVendaEnviada(v.id, c.data.daily_order_number || undefined);
        if (!jaTinhaNota && opcoes!.emitirNota) {
            await marcarNotaDisparada(v.id); // marca ANTES: nunca emite duas vezes
            emitirNotaDaVenda(v).catch(e => logBalcao(`NFC-e nao disparada (venda segue normal): ${e?.message || e}`));
        }
        return 'ok';
    } catch (e: any) {
        const temporario = erroTemporario(e);
        await registrarFalhaEnvio(v.id, String(e?.message || e), !temporario);
        return temporario ? 'temporario' : 'permanente';
    }
}

/** Mesma regra de sempre: só PIX e cartão emitem nota. Venda mista: só a parte PIX/cartão. */
async function emitirNotaDaVenda(v: Venda) {
    const comNota = v.pagamentos.filter(p => ['PIX', 'Cartão', 'Cartao'].includes(p.forma));
    const valor = Number(comNota.reduce((s, p) => s + p.valor, 0).toFixed(2));
    if (valor <= 0) return;
    const forma = comNota.length === 1 || new Set(comNota.map(p => p.forma)).size === 1 ? comNota[0].forma : 'Cartão';
    await opcoes!.emitirNota!({ id: v.id, total: valor, paymentMethod: forma, origin: 'BALCÃO' }, v.storeId);
}

/** Roda a fila até esvaziar ou até a primeira falha temporária. */
export async function processarFila(): Promise<void> {
    if (!opcoes) return;
    if (rodando) { pedidoDeNovo = true; return; }
    if (Date.now() < proximaTentativaEm) return;
    rodando = true;
    try {
        do {
            pedidoDeNovo = false;
            for (const v of vendasNaFila()) {
                const r = await enviarUma(v);
                if (r === 'temporario') {
                    proximaTentativaEm = Date.now() + ESPERAS[Math.min(falhasSeguidas, ESPERAS.length - 1)];
                    falhasSeguidas++;
                    return;
                }
                if (r === 'ok') falhasSeguidas = 0;
            }
        } while (pedidoDeNovo);
    } finally {
        rodando = false;
    }
}

/** Chamado logo depois de fechar uma venda: tenta já, ignorando a espera de falha anterior. */
export function dispararEnvio(): void {
    proximaTentativaEm = 0;
    processarFila().catch(() => {});
}

async function sinalDeVida() {
    if (!opcoes) return;
    const fila = vendasNaFila();
    const enviadas = vendasEnviadasRecentes();
    const ultima = enviadas.map(v => v.enviadaEm || '').sort().pop();
    const storeId = fila[0]?.storeId || enviadas[enviadas.length - 1]?.storeId || (opcoes as any).storeId;
    if (!storeId) return;
    try {
        await comTempoLimite<any>(opcoes.supabase.from('pdv_heartbeat').upsert({
            store_id: storeId,
            maquina: identificadorMaquina(),
            versao: opcoes.versaoApp || null,
            ultimo_contato: new Date().toISOString(),
            vendas_na_fila: fila.length,
            valor_na_fila: Number(fila.reduce((s, v) => s + v.total, 0).toFixed(2)),
            ultima_venda_enviada_em: ultima || null,
        }, { onConflict: 'store_id,maquina' }), 10000);
    } catch (_) { /* sinal de vida nunca atrapalha venda */ }
}

export function iniciarSincronizador(o: Opcoes & { storeId?: string }): () => void {
    opcoes = o;
    const intervalo = o.intervaloMs ?? 20000;
    const aoVoltarInternet = () => dispararEnvio();
    window.addEventListener('online', aoVoltarInternet);
    timer = setInterval(() => processarFila().catch(() => {}), intervalo);
    timerVida = setInterval(() => sinalDeVida(), 60000);
    dispararEnvio();
    sinalDeVida();
    logBalcao('sincronizador iniciado');
    return () => {
        window.removeEventListener('online', aoVoltarInternet);
        clearInterval(timer); clearInterval(timerVida);
        opcoes = null;
    };
}

/** Só para os testes. */
export function __reiniciarSincronizadorParaTeste() {
    rodando = false; pedidoDeNovo = false; proximaTentativaEm = 0; falhasSeguidas = 0; semColunaPagamentosAte = 0;
}
