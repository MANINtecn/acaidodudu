import React from 'react';
import { useStore } from '../contexts/StoreContext';

const CustomerPageModern: React.FC = () => {
    const { currentStore, loading } = useStore();

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="w-16 h-16 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 text-white font-sans">
            <header className="p-4 bg-gray-800/50 backdrop-blur-md sticky top-0 z-50 border-b border-white/10">
                <h1 className="text-xl font-bold text-center text-red-500">
                    {currentStore?.name || 'Açaí do Dudu'} (Novo Tema)
                </h1>
            </header>
            
            <main className="p-6">
                <div className="bg-gray-800/80 p-8 rounded-3xl border border-white/5 shadow-2xl text-center">
                    <div className="w-20 h-20 mx-auto bg-gray-700 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
                        <span className="text-3xl">🚀</span>
                    </div>
                    <h2 className="text-2xl font-black mb-3">Versão Moderna em Construção</h2>
                    <p className="text-gray-400 max-w-sm mx-auto">
                        Este é o espaço para o novo design focado em mobile, imagens grandes e responsividade premium.
                    </p>
                </div>
            </main>
        </div>
    );
};

export default CustomerPageModern;
