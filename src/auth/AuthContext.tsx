import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase, isSupabaseConfigured, lerSessaoGuardada } from '../services/supabaseService';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';

interface AuthContextType {
  session: Session | null;
  loading: boolean;
  /** No app de PC, o programa SEMPRE pede e-mail e senha ao abrir: só é true depois de entrar nesta abertura. */
  desbloqueado: boolean;
  desbloquear: () => void;
  /** Volta para a tela de login sem apagar a sessão (as vendas continuam subindo em segundo plano). */
  bloquear: () => void;
  /** Entrada sem internet: a senha foi conferida neste computador. */
  aceitarSessaoLocal: (s: Session) => void;
}

const exigeLogin = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);
const CHAVE_DESBLOQUEIO = 'pdv_desbloqueado';
const lerDesbloqueio = () => { try { return sessionStorage.getItem(CHAVE_DESBLOQUEIO) === '1'; } catch (_) { return false; } };

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
  const sessaoAtual = useRef<Session | null>(null);
  // sessionStorage: sobrevive a recarregar a tela, mas some quando o programa é fechado.
  const [desbloqueadoFlag, setDesbloqueadoFlag] = useState<boolean>(() => lerDesbloqueio());
  const desbloquear = () => { try { sessionStorage.setItem(CHAVE_DESBLOQUEIO, '1'); } catch (_) { /* segue */ } setDesbloqueadoFlag(true); };
  const bloquear = () => { try { sessionStorage.removeItem(CHAVE_DESBLOQUEIO); } catch (_) { /* segue */ } setDesbloqueadoFlag(false); };
  const aceitarSessaoLocal = (s: Session) => { sessaoOffline.current = true; sessaoAtual.current = s; setSession(s); };

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
        sessaoAtual.current = session;
        setSession(session);
      } else {
        // Sem internet e com o token de acesso vencido (vale 1 hora), o Supabase devolve "sem sessão".
        // Mas o PC já entrou antes: a sessão continua guardada e o app a aceita, para abrir e vender
        // sem internet. Quando a rede volta, o próprio Supabase renova o token (ver o listener abaixo).
        const guardada = error && isAuthRetryableFetchError(error) ? await lerSessaoGuardada() : null;
        if (guardada) { sessaoOffline.current = true; sessaoAtual.current = guardada as Session; setSession(guardada as Session); } else { setSession(null); }
      }
      setLoading(false);
    };
    iniciar();

    const aoVoltarInternet = () => {
      if (!sessaoOffline.current) return;
      supabase.auth.getSession().then(({ data }) => {
        // Só troca pela sessão real se for da MESMA pessoa que entrou offline (a guardada pode ser de outro login).
        const atual = sessaoAtual.current;
        if (data.session && (!atual || (atual as any).__local === undefined || data.session.user.id === atual.user.id)) {
          sessaoOffline.current = false; sessaoAtual.current = data.session; setSession(data.session);
        }
      });
    };
    window.addEventListener('online', aoVoltarInternet);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento, session) => {
      // Sessão nula por falha de rede não derruba a sessão offline; só sair de propósito derruba.
      if (!session && sessaoOffline.current && evento !== 'SIGNED_OUT') return;
      if (session) sessaoOffline.current = false;
      sessaoAtual.current = session;
      if (evento === 'SIGNED_OUT') bloquear();
      setSession(session);
    });

    return () => { subscription.unsubscribe(); window.removeEventListener('online', aoVoltarInternet); };
  }, []);

  const desbloqueado = !exigeLogin || desbloqueadoFlag;
  return <AuthContext.Provider value={{ session, loading, desbloqueado, desbloquear, bloquear, aceitarSessaoLocal }}>{children}</AuthContext.Provider>;
};

export const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { session, loading, desbloqueado } = useAuth();
    const location = useLocation();

    if (loading) return <div className="flex items-center justify-center h-screen bg-background"><div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
    if (!session || !desbloqueado) return <Navigate to="/login" state={{ from: location }} replace />;
    return <>{children}</>;
};