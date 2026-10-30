import React, { useEffect } from 'react';

const XIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>;

interface Props {
    titulo: string;
    onFechar: () => void;
    /** Botões do rodapé, sempre visíveis (o corpo é que rola). */
    rodape?: React.ReactNode;
    /** Janela estreita (avisos) ou larga (formulários em duas colunas no computador). */
    larga?: boolean;
    children: React.ReactNode;
}

/**
 * Janela do Super Admin. No computador é larga e o formulário se divide em colunas, então não precisa rolar
 * para chegar no botão de salvar; o rodapé com os botões fica sempre à vista. Fecha com o X, com Esc ou
 * clicando fora, sem salvar. No celular vira uma coluna só e o corpo rola.
 */
export const Janela: React.FC<Props> = ({ titulo, onFechar, rodape, larga, children }) => {
    useEffect(() => {
        const aoTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
        window.addEventListener('keydown', aoTecla);
        return () => window.removeEventListener('keydown', aoTecla);
    }, [onFechar]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            // mouseDown (e não click): selecionar texto e soltar fora da janela não fecha.
            onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
        >
            <div className={`flex max-h-[92vh] w-full flex-col rounded-xl border border-gray-700 bg-gray-800 shadow-2xl ${larga ? 'max-w-4xl' : 'max-w-md'}`}>
                <header className="flex shrink-0 items-center justify-between border-b border-gray-700 px-6 py-4">
                    <h2 className="text-xl font-bold text-white">{titulo}</h2>
                    <button onClick={onFechar} className="text-gray-400 hover:text-white" aria-label="Fechar"><XIcon /></button>
                </header>
                <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
                {rodape && <footer className="flex shrink-0 justify-end gap-3 border-t border-gray-700 px-6 py-4">{rodape}</footer>}
            </div>
        </div>
    );
};

export const BotaoCancelar: React.FC<{ onClick: () => void; rotulo?: string }> = ({ onClick, rotulo = 'Cancelar' }) => (
    <button onClick={onClick} className="rounded-lg bg-gray-700 px-5 py-2.5 font-bold text-gray-200 transition hover:bg-gray-600">{rotulo}</button>
);

export const BotaoPrincipal: React.FC<{ onClick: () => void; rotulo: string }> = ({ onClick, rotulo }) => (
    <button onClick={onClick} className="rounded-lg bg-blue-600 px-6 py-2.5 font-bold text-white transition hover:bg-blue-700">{rotulo}</button>
);
