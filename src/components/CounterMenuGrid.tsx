import React, { memo } from 'react';
import { MenuItem } from '../types';
import { Plus, Search } from 'lucide-react';
import { precoParaExibir } from './PrecoDoItem';

interface CounterMenuGridProps {
    items: MenuItem[];
    onAdd: (item: MenuItem) => void;
}

const CounterMenuGrid: React.FC<CounterMenuGridProps> = ({ items, onAdd }) => {
    // console.log("Rendering Menu Grid"); // Debug check
    // Colunas AUTOMÁTICAS (cada card com no mínimo 130 px): com 2/3 colunas fixas, nomes
    // longos ("TRADICIONAIS", "CASQUINHA") estouravam o card e empurravam o código do
    // produto para fora da tela (05/10/2026, print do Ikarus).
    return (
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 grid [grid-template-columns:repeat(auto-fill,minmax(130px,1fr))] gap-3 content-start scrollbar-hide">
            {items.map(item => {
                const preco = precoParaExibir(item);
                return (
                <button
                    key={item.id}
                    onClick={() => onAdd(item)}
                    className="group relative flex flex-col justify-between min-w-0 overflow-hidden p-3 bg-white dark:bg-gray-700/30 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 rounded-2xl transition-all text-left min-h-[100px] shadow-sm hover:shadow-md h-full"
                >
                    <span className="font-black text-gray-800 dark:text-gray-100 text-[13px] leading-tight uppercase tracking-tight break-words [overflow-wrap:anywhere] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{item.name}</span>
                    <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1 mt-2 w-full min-w-0">
                        <span className="font-black text-blue-600 dark:text-blue-400 text-base leading-none whitespace-nowrap">
                            {preco.aPartirDe && <span className="block text-[9px] font-bold uppercase tracking-wide opacity-70 mb-0.5">a partir de</span>}
                            R$ {preco.valor.toFixed(2)}
                        </span>
                        {/* Código do produto -- pedido do Ikarus 02/10/2026:
                            "vamos mostrar o código do produto pra ajudar ele a
                            gravar" (o atendente lança por código de cabeça, no
                            dia a dia; ver o código no card ajuda a aprender).
                            Fica na linha do PREÇO (não ao lado do nome): nomes
                            longos não conseguem mais empurrá-lo para fora do card. */}
                        {item.codigo != null && (
                            <span className="shrink-0 font-mono font-black text-[11px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                                {item.codigo}
                            </span>
                        )}
                    </div>
                    {/* "+" só aparece no hover e NÃO ocupa espaço (antes tomava ~28 px da linha do preço). */}
                    <div className="absolute top-2 right-2 p-1 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg opacity-0 group-hover:opacity-100 transition-all transform scale-75 group-hover:scale-100 pointer-events-none">
                        <Plus size={14} strokeWidth={3} />
                    </div>
                </button>
                );
            })}
            {items.length === 0 && (
                <div className="col-span-full py-20 text-center text-gray-400">
                    <Search className="mx-auto mb-3 opacity-20" size={48} />
                    <p className="font-medium">Nenhum produto encontrado</p>
                </div>
            )}
        </div>
    );
};

export default memo(CounterMenuGrid);
