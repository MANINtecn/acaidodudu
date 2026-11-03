import React, { useEffect, useState } from 'react';
import { useStore } from '../contexts/StoreContext';
import CustomerPageClassic from './CustomerPageClassic';
import CustomerPageModern from './CustomerPageModern';
import { fetchPublicSettings } from '../services/supabaseService';
import { Settings } from '../types';
import { AceiteDeTermos } from '../components/AceiteDeTermos';

const CustomerPage: React.FC = () => {
    const { currentStore, loading } = useStore();
    const [settings, setSettings] = useState<Partial<Settings> | null>(null);
    const [fetchingSettings, setFetchingSettings] = useState(true);

    useEffect(() => {
        if (!loading && currentStore) {
            fetchPublicSettings(currentStore.id)
                .then(data => setSettings(data))
                .finally(() => setFetchingSettings(false));
        } else if (!loading && !currentStore) {
            setFetchingSettings(false);
        }
    }, [currentStore, loading]);

    if (loading || fetchingSettings) {
        return (
            <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col items-center justify-center">
                <div className="w-16 h-16 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    // O Açaí do Dudu é uma loja antiga com marca própria: o aceite da plataforma vale para as lojas do Pede Aqui.
    const aceite = currentStore && currentStore.slug !== 'acaidodudu' ? <AceiteDeTermos /> : null;

    if (settings?.storefrontTheme === 'modern') {
        return <>{aceite}<CustomerPageModern /></>;
    }

    return <>{aceite}<CustomerPageClassic /></>;
};

export default CustomerPage;
