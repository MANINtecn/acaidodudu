import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { MARCA } from '../services/marcaService';
import { supabase } from '../services/supabaseService';
import { useStore } from '../contexts/StoreContext';
import { useAuth } from '../auth/AuthContext';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import logoImg from '../../public/icon.png';
import bgHero from '../../public/acai_boat_hero.jpg';
import { Lock, Mail, ArrowLeft, LogIn } from 'lucide-react';

const LoginPage: React.FC = () => {
  const { currentStore } = useStore();
  const { session, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [semInternet, setSemInternet] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  const navigate = useNavigate();
  const location = useLocation();
  const { storeSlug } = useParams();

  const storeLogo = currentStore?.logo_url || (currentStore as any)?.logoUrl || logoImg;

  const targetSlug = storeSlug || 'acaidodudu';
  const defaultRedirect = `/${targetSlug}/admin`;
  const rawFrom = (location.state as any)?.from?.pathname;
  const from = (rawFrom && rawFrom !== '/' && !rawFrom.endsWith('/login')) ? rawFrom : defaultRedirect;

  useEffect(() => {
    const cai = () => setSemInternet(true);
    const volta = () => { setSemInternet(false); setError(null); };
    window.addEventListener('offline', cai);
    window.addEventListener('online', volta);
    return () => { window.removeEventListener('offline', cai); window.removeEventListener('online', volta); };
  }, []);

  // Auto-redirect if user already has an active session
  useEffect(() => {
    if (session && !authLoading) {
      navigate(from, { replace: true });
    }
  }, [session, authLoading, navigate, from]);

  useEffect(() => {
    const checkSavedCredentials = async () => {
      try {
        const savedEmail = await (window as any).electron?.storage?.getItem('saved_email');
        const remember = await (window as any).electron?.storage?.getItem('remember_me');
        // A senha NÃO é mais guardada (ficava em texto puro no disco). Quem já tinha salvo tem apagado agora:
        // o token da sessão basta para o PC entrar sozinho.
        await (window as any).electron?.storage?.removeItem('saved_password');

        if (savedEmail) setEmail(savedEmail);
        if (remember !== undefined) setRememberMe(remember === 'true');
      } catch (e) {
        console.warn("Error loading saved credentials:", e);
      }
    };
    checkSavedCredentials();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      if (rememberMe) {
          await (window as any).electron?.storage?.setItem('saved_email', email);
          await (window as any).electron?.storage?.setItem('remember_me', 'true');
      } else {
          await (window as any).electron?.storage?.removeItem('saved_email');
          await (window as any).electron?.storage?.setItem('remember_me', 'false');
      }

      navigate(from, { replace: true });
    } catch (error: any) {
      // Primeiro acesso sem internet: não existe como conferir a senha sem o servidor. Explica o que fazer.
      setError(isAuthRetryableFetchError(error) || !navigator.onLine
        ? 'Sem internet. Para ativar este computador, conecte-o à internet uma vez e entre. Depois disso ele abre e vende mesmo sem internet.'
        : (error.error_description || error.message || 'Falha ao autenticar.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-cover bg-center"
      style={{ backgroundImage: `url(${bgHero})` }}
    >
      {/* Dark overlay with dynamic purple glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-black/90 via-purple-950/80 to-black/95 backdrop-blur-sm"></div>

      {/* Ambient background lights */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-600/30 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-red-600/20 rounded-full blur-3xl pointer-events-none"></div>

      {/* Main Glassmorphic Card */}
      <div className="relative z-10 max-w-md w-full bg-gray-950/70 border border-purple-500/30 backdrop-blur-xl p-8 rounded-3xl shadow-2xl shadow-purple-950/50 flex flex-col items-center">
        
        {/* Logo Container */}
        <div className="relative mb-6 group">
          <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-red-600 rounded-full blur opacity-75 group-hover:opacity-100 transition duration-500"></div>
          <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-white/20 bg-gray-900 flex items-center justify-center p-1 shadow-inner">
            <img 
              src={storeLogo} 
              alt={currentStore?.name || MARCA.produto} 
              className="w-full h-full object-cover rounded-full"
              onError={(e) => {
                // Fallback to logoImg if store logo fails to load
                (e.target as HTMLImageElement).src = logoImg;
              }}
            />
          </div>
        </div>

        <div className="text-center mb-8">
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center justify-center gap-2">
            Painel Administrativo
          </h2>
          <p className="text-xs font-semibold text-purple-300 uppercase tracking-widest mt-1">
            {currentStore?.name || MARCA.produto} • Sistema PDV
          </p>
        </div>

        {semInternet && (
          <div className="w-full mb-5 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-100 px-4 py-3 text-sm">
            <p className="font-bold">Este computador está sem internet.</p>
            <p className="mt-1 text-amber-100/90">Na primeira vez é preciso entrar com internet. Depois disso o programa abre e vende sem internet. Quando a internet voltar, esta tela libera sozinha.</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="w-full space-y-5">
          <div>
            <label htmlFor="email" className="block text-xs font-bold uppercase tracking-wider text-purple-200 mb-1.5">
              E-mail de Acesso
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-400" />
              <input
                id="email"
                name="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@exemplo.com"
                className="w-full pl-11 pr-4 py-3 bg-gray-900/90 border border-purple-500/30 rounded-xl text-white placeholder-gray-500 shadow-inner focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-bold uppercase tracking-wider text-purple-200 mb-1.5">
              Senha
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-400" />
              <input 
                id="password" 
                name="password" 
                type="password" 
                required 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="••••••••"
                className="w-full pl-11 pr-4 py-3 bg-gray-900/90 border border-purple-500/30 rounded-xl text-white placeholder-gray-500 shadow-inner focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm" 
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label htmlFor="remember_me" className="flex items-center gap-2.5 cursor-pointer text-xs text-gray-300 select-none">
              <input
                id="remember_me"
                name="remember_me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 text-purple-600 focus:ring-purple-500 border-gray-700 rounded bg-gray-900 accent-purple-600"
              />
              Lembrar meu usuário
            </label>
          </div>

          {error && (
            <div className="p-3 bg-red-900/30 border border-red-500/40 rounded-xl text-red-400 text-xs font-medium text-center animate-shake">
              {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading} 
            className="w-full py-3.5 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-98 font-bold text-white rounded-xl shadow-lg shadow-purple-900/50 flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm tracking-wider uppercase"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Autenticando...
              </span>
            ) : (
              <>
                Entrar no Sistema <LogIn className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-4 border-t border-purple-900/30 w-full text-center">
          <button 
            onClick={() => navigate(storeSlug ? `/${storeSlug}` : '/')} 
            className="inline-flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao Cardápio Principal
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;