import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase, isSupabaseConfigured, lerSessaoGuardada } from '../services/supabaseService';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';

interface AuthContextType {
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // true enquanto a tela roda com a sessão guardada porque a internet não deixou renovar o token.
  const sessaoOffline = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
        setLoading(false);
        return;
    }
    // O cliente do Supabase foi criado com detectSessionInUrl desligado (Electron usa # para rotas).
    // Os links de e-mail (redefinir senha, confirmar cadastro) trazem a sessão no #access_token,
    // então é aqui que ela é lida. Sem isso o link sempre parecia "vencido".
    const iniciar = async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const access = hash.get('access_token');
      const refresh = hash.get('refresh_token');
      if (access && refresh) {
        await supabase.auth.setSession({ access_token: access, refresh_token: refresh }).catch(() => {});
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      const { data: { session }, error } = await supabase.auth.getSession();
      if (session) {
        // Vinda do "getSession sem internet" (supabaseService): vale como entrada, e o Supabase renova quando a rede voltar.
        if ((session as any).__offline) sessaoOffline.current = true;
        setSession(session);
      } else {
        // Sem internet e com o token de acesso vencido (vale 1 hora), o Supabase devolve "sem sessão".
        // Mas o PC já entrou antes: a sessão continua guardada e o app a aceita, para abrir e vender
        // sem internet. Quando a rede volta, o próprio Supabase renova o token (ver o listener abaixo).
        const guardada = error && isAuthRetryableFetchError(error) ? await lerSessaoGuardada() : null;
        if (guardada) { sessaoOffline.current = true; setSession(guardada as Session); } else { setSession(null); }
      }
      setLoading(false);
    };
    iniciar();

    const aoVoltarInternet = () => {
      if (!sessaoOffline.current) return;
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) { sessaoOffline.current = false; setSession(data.session); }
      });
    };
    window.addEventListener('online', aoVoltarInternet);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento, session) => {
      // Sessão nula por falha de rede não derruba a sessão offline; só sair de propósito derruba.
      if (!session && sessaoOffline.current && evento !== 'SIGNED_OUT') return;
      if (session) sessaoOffline.current = false;
      setSession(session);
    });

    return () => { subscription.unsubscribe(); window.removeEventListener('online', aoVoltarInternet); };
  }, []);

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>;
};

export const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { session, loading } = useAuth();
    const location = useLocation();

    if (loading) return <div className="flex items-center justify-center h-screen bg-background"><div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
    if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
    return <>{children}</>;
};