import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { DATA_TERMOS, PRODUTO } from './empresa';

export type SecaoLegal = { titulo: string; paragrafos?: string[]; itens?: string[]; depois?: string[] };

/** Página de texto legal: leitura confortável no celular, claro e escuro. */
export const LegalLayout: React.FC<{ titulo: string; resumo: string; secoes: SecaoLegal[]; outra: { para: string; rotulo: string } }> = ({ titulo, resumo, secoes, outra }) => {
    useEffect(() => { window.scrollTo(0, 0); }, []);
    return (
        <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200">
            <header className="border-b border-gray-200 dark:border-gray-800">
                <div className="mx-auto max-w-3xl px-5 h-14 flex items-center justify-between text-sm font-bold">
                    <Link to="/" className="text-gray-900 dark:text-white">{PRODUTO}</Link>
                    <Link to={outra.para} className="text-orange-600 dark:text-orange-400 hover:underline">{outra.rotulo}</Link>
                </div>
            </header>
            <main className="mx-auto max-w-3xl px-5 py-8 pb-16">
                <h1 className="text-3xl font-black text-gray-900 dark:text-white">{titulo}</h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Atualizado em {DATA_TERMOS}</p>
                <p className="mt-4 rounded-xl bg-orange-50 dark:bg-gray-800 border border-orange-100 dark:border-gray-700 p-4 text-sm">{resumo}</p>
                {secoes.map((s, i) => (
                    <section key={s.titulo} className="mt-8">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">{i + 1}. {s.titulo}</h2>
                        {s.paragrafos?.map((p, k) => <p key={k} className="mt-2 leading-relaxed">{p}</p>)}
                        {s.itens && <ul className="mt-2 list-disc pl-6 space-y-1 leading-relaxed">{s.itens.map((it, k) => <li key={k}>{it}</li>)}</ul>}
                        {s.depois?.map((p, k) => <p key={k} className="mt-2 leading-relaxed">{p}</p>)}
                    </section>
                ))}
            </main>
        </div>
    );
};
