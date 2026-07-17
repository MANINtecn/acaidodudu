import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Truck, UtensilsCrossed } from 'lucide-react';
import { useStore } from '../contexts/StoreContext';

const StaffPortalPage: React.FC = () => {
    const navigate = useNavigate();
    const { storeSlug } = useParams();
    const { currentStore } = useStore();

    const slug = storeSlug || currentStore?.slug || 'papaleguastocmg';

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-8 text-center">
                <div className="space-y-2">
                    <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                        PORTAL DO STAFF
                    </h1>
                    <p className="text-red-600 dark:text-red-500 font-bold uppercase tracking-widest text-sm">
                        {currentStore?.name || 'PAPALEGUAS'}
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    <button
                        onClick={() => navigate(`/${slug}/garcom`)}
                        className="flex flex-col items-center justify-center gap-4 p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-red-500 transition-all group active:scale-95"
                    >
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-full group-hover:bg-red-100 dark:group-hover:bg-red-900/40 transition-colors">
                            <UtensilsCrossed size={48} className="text-red-600 dark:text-red-400" />
                        </div>
                        <span className="text-xl font-bold text-gray-800 dark:text-gray-100">Área do Garçom</span>
                    </button>

                    <button
                        onClick={() => navigate(`/${slug}/entregador`)}
                        className="flex flex-col items-center justify-center gap-4 p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border-2 border-transparent hover:border-red-500 transition-all group active:scale-95"
                    >
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-full group-hover:bg-red-100 dark:group-hover:bg-red-900/40 transition-colors">
                            <Truck size={48} className="text-red-600 dark:text-red-400" />
                        </div>
                        <span className="text-xl font-bold text-gray-800 dark:text-gray-100">Área do Entregador</span>
                    </button>
                </div>

                <p className="text-gray-500 dark:text-gray-400 text-xs">
                    Papaleguas PDV • Tecx Sistemas
                </p>
            </div>
        </div>
    );
};

export default StaffPortalPage;
