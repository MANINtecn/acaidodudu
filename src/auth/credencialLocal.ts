/**
 * Ponte para o login offline do app de PC (impressão da senha guardada no computador).
 * A conferência roda no processo principal do Electron (credencial-local.js). No navegador não existe:
 * quem usa a versão web continua entrando só com internet, como sempre.
 */
export interface RespostaConferir {
    ok: boolean;
    motivo?: 'sem-credencial' | 'senha' | 'travado' | 'invalido' | 'erro';
    userId?: string | null;
    esperaMs?: number;
    restantes?: number;
    travado?: boolean;
}

const api = (): { salvar: Function; conferir: Function; existe: Function } | null =>
    (typeof window !== 'undefined' && (window as any).electron?.credencial) || null;

export const credencialDisponivel = (): boolean => !!api();

/** Depois de um login COM internet: guarda (ou renova) a impressão da senha neste computador. */
export async function salvarCredencial(email: string, senha: string, userId?: string | null): Promise<void> {
    try { await api()?.salvar(email, senha, userId || null); } catch (_) { /* sem isso só perde o login offline */ }
}

/** Login sem internet: confere a senha digitada contra a impressão guardada. */
export async function conferirCredencial(email: string, senha: string): Promise<RespostaConferir> {
    try {
        const a = api();
        if (!a) return { ok: false, motivo: 'sem-credencial' };
        return (await a.conferir(email, senha)) as RespostaConferir;
    } catch (_) { return { ok: false, motivo: 'erro' }; }
}

/** Sessão sem token, para o PC que entrou offline e não tem sessão do Supabase guardada. Só serve à tela: nada sobe com ela. */
export const sessaoLocalMinima = (email: string, userId?: string | null): any => ({
    access_token: '', refresh_token: '', token_type: 'bearer', expires_in: 0, expires_at: 0, __local: true,
    user: { id: userId || 'local', email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
});
