/**
 * Trava da tela de redefinir senha (28/10/2026).
 *
 * A tela /redefinir_senha só pode trocar a senha por quem chegou pelo LINK do e-mail de recuperação.
 * Antes ela abria o formulário para qualquer pessoa já logada, e continuava aberta depois de trocar:
 * quem pegasse um navegador logado e sem ninguém por perto trocava a senha sem saber a atual.
 *
 * Este arquivo é importado no início do app (index.tsx), ANTES de qualquer coisa limpar o endereço:
 * se a URL traz type=recovery, marca a abertura (sessionStorage, some ao fechar a aba). O marcador
 * vale 15 minutos e é apagado assim que a senha é trocada.
 */
const CHAVE = 'pedeaki_recuperacao';
const VALE_MS = 15 * 60 * 1000;

try {
    if (typeof window !== 'undefined' && /type=recovery/.test(window.location.hash)) {
        sessionStorage.setItem(CHAVE, String(Date.now()));
    }
} catch (_) { /* sem sessionStorage: o formulário simplesmente não abre */ }

/** Esta aba chegou por um link de recuperação ainda válido? */
export const recuperacaoValida = (agora = Date.now()): boolean => {
    try {
        const t = Number(sessionStorage.getItem(CHAVE));
        return t > 0 && agora - t < VALE_MS;
    } catch (_) { return false; }
};

export const encerrarRecuperacao = () => { try { sessionStorage.removeItem(CHAVE); } catch (_) { /* segue */ } };
