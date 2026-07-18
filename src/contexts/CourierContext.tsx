import React, { createContext, useContext, useEffect, useState } from 'react';
import { Courier } from '../types';
import { verifyCourierLogin } from '../services/supabaseService';
import { useStore } from './StoreContext';

interface CourierContextData {
    courier: Courier | null;
    firstName: string;
    loading: boolean;
    login: (phone: string, password: string) => Promise<boolean>;
    logout: () => void;
}

const CourierContext = createContext<CourierContextData>({} as CourierContextData);

export const CourierProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [courier, setCourier] = useState<Courier | null>(null);
    const [loading, setLoading] = useState(true);
    const { currentStore } = useStore();

    useEffect(() => {
        // Load from LocalStorage on mount
        const stored = localStorage.getItem('acaidodudu_courier_session');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                // Simple validation: Check if store matches current context (if we want to restrict)
                // or just load it. The phone/password logic is implicit if we trust local storage.
                // For better security, we could re-verify, but for "keeps logged in", this is fine.
                if (currentStore && parsed.store_id !== currentStore.id) {
                    // Different store? Logout.
                    logout();
                } else {
                    setCourier(parsed);
                }
            } catch (e) {
                console.error("Invalid courier session", e);
                localStorage.removeItem('acaidodudu_courier_session');
            }
        }
        setLoading(false);
    }, [currentStore]);

    const login = async (phone: string, password: string) => {
        if (!currentStore) return false;
        
        try {
            const data = await verifyCourierLogin(phone, password, currentStore.id);
            if (data) {
                const courierData: Courier = data;
                setCourier(courierData);
                localStorage.setItem('acaidodudu_courier_session', JSON.stringify(courierData));
                return true;
            }
        } catch (error) {
            console.error(error);
        }
        return false;
    };

    const logout = () => {
        setCourier(null);
        localStorage.removeItem('acaidodudu_courier_session');
    };

    const firstName = courier?.name.split(' ')[0] || '';

    return (
        <CourierContext.Provider value={{ courier, firstName, loading, login, logout }}>
            {children}
        </CourierContext.Provider>
    );
};

export const useCourier = () => useContext(CourierContext);
