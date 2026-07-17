import React, { memo } from 'react';
import { MenuItem } from '../types';
import { Plus, Search } from 'lucide-react';

interface CounterMenuGridProps {
    items: MenuItem[];
    onAdd: (item: MenuItem) => void;
}

const CounterMenuGrid: React.FC<CounterMenuGridProps> = ({ items, onAdd }) => {
    // console.log("Rendering Menu Grid"); // Debug check
    return (
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 lg:grid-cols-3 gap-3 content-start scrollbar-hide">
            {items.map(item => (
                <button 
                    key={item.id} 
                    onClick={() => onAdd(item)} 
                    className="group flex flex-col justify-between p-4 bg-white dark:bg-gray-700/30 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 rounded-2xl transition-all text-left min-h-[100px] shadow-sm hover:shadow-md h-full"
                >
                    <span className="font-black text-gray-800 dark:text-gray-100 text-sm leading-tight uppercase tracking-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{item.name}</span>
                    <div className="flex justify-between items-end mt-2 w-full">
                        <span className="font-black text-blue-600 dark:text-blue-400 text-base">R$ {item.price.toFixed(2)}</span>
                        <div className="p-1.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg opacity-0 group-hover:opacity-100 transition-all transform scale-75 group-hover:scale-100">
                            <Plus size={16} strokeWidth={3} />
                        </div>
                    </div>
                </button>
            ))}
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
