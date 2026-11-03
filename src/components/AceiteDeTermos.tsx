import React, { useState } from 'react';
import { VERSAO_TERMOS, PRODUTO } from '../legal/empresa';

const CHAVE = 'pedeaqui_aceite_termos';

const jaAceitou = (): boolean => {
    try { return localStorage.getItem(CHAVE) === VERSAO_TERMOS; } catch (_) { return true; /* sem storage: não prende o cliente */ }
};

/**
 * Aceite na primeira visita (e quando a versão dos textos muda). Aparece por cima do cardápio do cliente.
 * Os links abrem em outra aba para o cliente não perder a página nem o carrinho.
 */
export const AceiteDeTermos: React.FC = () => {
    const [visivel, setVisivel] = useState(() => !jaAceitou());
    if (!visivel) return null;

    const aceitar = () => {
        try { localStorage.setItem(CHAVE, VERSAO_TERMOS); } catch (_) { /* tudo bem */ }
        setVisivel(false);
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="aceite-titulo">
            <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-2xl">
                <h2 id="aceite-titulo" className="text-lg font-black text-gray-900 dark:text-white">Antes de continuar</h2>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                    Para fazer pedidos usamos o seu nome, telefone e endereço, apenas para a loja entregar o seu pedido. Leia os{' '}
                    <a href="/termos" target="_blank" rel="noopener noreferrer" className="font-bold text-orange-600 dark:text-orange-400 underline">Termos de Uso</a>{' '}e a{' '}
                    <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="font-bold text-orange-600 dark:text-orange-400 underline">Política de Privacidade</a>{' '}
                    do {PRODUTO}.
                </p>
                <button onClick={aceitar} className="mt-5 w-full rounded-xl bg-orange-600 hover:bg-orange-700 py-3 font-bold text-white">Li e aceito</button>
            </div>
        </div>
    );
};
