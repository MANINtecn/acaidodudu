import React, { useEffect, useState } from 'react';
import { useStore } from '../contexts/StoreContext';
import CustomerPageClassic from './CustomerPageClassic';
import CustomerPageModern from './CustomerPageModern';
import { fetchPublicSettings } from '../services/supabaseService';
import { Settings } from '../types';

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

    if (settings?.storefrontTheme === 'modern') {
        return <CustomerPageModern />;
    }

    return <CustomerPageClassic />;
};

export default CustomerPage;
