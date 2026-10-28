/**
 * Teste rápido de "o sistema responde?" (28/10/2026).
 *
 * Por que existe: com o token de acesso vencido (vale 1 hora) e sem internet, o cliente do Supabase fica
 * até ~25 segundos tentando renovar o token, e cada pedido ao banco espera na fila dessa tentativa.
 * O app parecia travado ao abrir sem internet. Antes de renovar, a gente pergunta ao servidor com um
 * toque leve (sem token, sem fila): se não responde em 2,5 s, o app usa a sessão que já está guardada.
 *
 * O resultado vale por 10 segundos, para não testar a cada pedido.
 */
let url = '';
let chave = '';
let ultimo = { em: 0, ok: true };
let testando: Promise<boolean> | null = null;

const VALE_MS = 10_000;
const LIMITE_MS = 2_500;

export const configurarRadar = (supabaseUrl: string, supabaseChave: string) => { url = supabaseUrl; chave = supabaseChave; };

async function sonda(): Promise<boolean> {
    if (!url) return true; // sem configuração, não atrapalha: segue o caminho normal
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = setTimeout(() => ctl?.abort(), LIMITE_MS);
    try {
        // Qualquer resposta HTTP (até 401) prova que a internet chega ao servidor.
        await fetch(`${url.replace(/\/+$/, '')}/auth/v1/health`, { headers: chave ? { apikey: chave } : {}, cache: 'no-store', signal: ctl?.signal });
        return true;
    } catch (_) {
        return false;
    } finally {
        clearTimeout(t);
    }
}

/** O sistema responde agora? `false` = sem internet (ou sem rede) e o app deve usar o que tem guardado. */
export async function redeResponde(agora = Date.now()): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    if (agora - ultimo.em < VALE_MS) return ultimo.ok;
    if (testando) return testando;
    testando = sonda().then(ok => { ultimo = { em: agora, ok }; return ok; }).finally(() => { testando = null; });
    return testando;
}

/** Quem já sabe o resultado (um envio que acabou de funcionar, o evento "online") informa e evita um teste. */
export const informarRede = (ok: boolean) => { ultimo = { em: Date.now(), ok }; };

/** Só para os testes. */
export const __zerarRadarParaTeste = () => { ultimo = { em: 0, ok: true }; testando = null; url = ''; chave = ''; };
