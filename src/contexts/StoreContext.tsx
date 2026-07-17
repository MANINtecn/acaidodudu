import React, { createContext, useContext, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchStoreBySlug } from '../services/supabaseService';
import { Store } from '../types';

interface StoreContextType {
    currentStore: Store | null;
    loading: boolean;
    error: string | null;
    refreshStore: () => Promise<void>;
}

const StoreContext = createContext<StoreContextType>({
    currentStore: null,
    loading: true,
    error: null,
    refreshStore: async () => { },
});

export const useStore = () => useContext(StoreContext);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [currentStore, setCurrentStore] = useState<Store | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const location = useLocation();

    const fetchStore = async () => {
        let slug: string | null = null;

        // console.log("StoreContext: Starting fetchStore logic. Hostname:", window.location.hostname);

        // 1. Try to get slug from Subdomain
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        const parts = hostname.split('.');

        // 0. Detect Electron (file protocol)
        if (protocol === 'file:') {
            slug = 'papaleguastocmg';
            // console.log("StoreContext: Electron/File protocol detected, using default slug:", slug);
        } else if (hostname === 'localhost' || hostname === '127.0.0.1') {
            slug = 'papaleguastocmg';
            // console.log("StoreContext: Localhost detected, using default slug:", slug);
        }

        // Logic: 
        // localhost:3000 -> ['localhost'] (len 1) -> No subdomain
        // sub.localhost:3000 -> ['sub', 'localhost'] (len 2) -> Subdomain 'sub'
        // domain.com -> ['domain', 'com'] (len 2) -> No subdomain
        // sub.domain.com -> ['sub', 'domain', 'com'] (len 3) -> Subdomain 'sub'

        const isLocalhost = hostname.includes('localhost');
        const minParts = isLocalhost ? 2 : 3;

        if (parts.length >= minParts && parts[0] !== 'www') {
            slug = parts[0];
            // console.log("StoreContext: Identified slug from subdomain:", slug);
        }

        // QUICK EXIT FOR STAFF ROUTES - No loading, no fetching, instantly clean.
        // We only do this if there is NO subdomain slug. If there IS a subdomain, we want to load the store context even on /admin.
        const reservedPaths = ['/admin', '/login', '/super-admin', '/staff', '/acesso', '/hub-equipe', '/portal-equipe', '/garcom', '/entregador'];
        const isReserved = reservedPaths.some(p => location.pathname.toLowerCase().startsWith(p)) && !slug;
        
        if (isReserved) {
            // console.log("StoreContext: Reserved path detected without subdomain, skipping store fetch.");
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        if (!slug) {
            // No store identified. 
            console.warn("StoreContext: No slug found.");
            setLoading(false);
            return;
        }

        try {
            // console.log("StoreContext: Fetching store by slug:", slug);

            const store = await fetchStoreBySlug(slug);

            if (!store) {
                console.error("Store not found for slug:", slug);
                setError("Loja não encontrada");
                setCurrentStore(null);
            } else {
                // console.log("StoreContext: Store found:", store.name);
                setCurrentStore(store);
            }
        } catch (err) {
            console.error("Unexpected error:", err);
            setError("Erro ao carregar loja");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStore();
    }, [location.pathname]);

    return (
        <StoreContext.Provider value={{ currentStore, loading, error, refreshStore: fetchStore }}>
            {children}
        </StoreContext.Provider>
    );
};
