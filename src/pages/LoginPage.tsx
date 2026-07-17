import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { supabase } from '../services/supabaseService';

const ArrowLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" /></svg>;

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { storeSlug } = useParams();

  // Default to store admin if no state, or just / if no storeSlug (shouldn't happen)
  const defaultRedirect = storeSlug ? `/${storeSlug}/admin` : '/';
  const from = (location.state as any)?.from?.pathname || defaultRedirect;

  // Auto-fill logic
  useEffect(() => {
    const checkSavedCredentials = async () => {
      try {
        // Use Electron storage if available
        const savedEmail = await (window as any).electron?.storage?.getItem('saved_email');
        const savedPassword = await (window as any).electron?.storage?.getItem('saved_password');
        const remember = await (window as any).electron?.storage?.getItem('remember_me');

        if (savedEmail) setEmail(savedEmail);
        if (savedPassword) setPassword(savedPassword);
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

      // Persistence
      if (rememberMe) {
          await (window as any).electron?.storage?.setItem('saved_email', email);
          await (window as any).electron?.storage?.setItem('saved_password', password);
          await (window as any).electron?.storage?.setItem('remember_me', 'true');
      } else {
          await (window as any).electron?.storage?.removeItem('saved_email');
          await (window as any).electron?.storage?.removeItem('saved_password');
          await (window as any).electron?.storage?.setItem('remember_me', 'false');
      }

      navigate(from, { replace: true });
    } catch (error: any) {
      setError(error.error_description || error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full bg-surface p-8 rounded-lg shadow-lg">
        <div className="flex justify-center mb-6">
          <img src="file:///C:/Users/icaro/.gemini/antigravity/brain/0fce70ac-0a53-42b4-852f-d72b7809b058/papaleguas_logo_mascot_1768403002040.png" alt="Papaleguas Mascot" className="w-24 h-24 rounded-full border-4 border-primary" />
        </div>
        <h2 className="text-3xl font-display text-center text-primary mb-6">Painel Administrativo</h2>
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text-dark">Email</label>
            <input id="email" name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-background border border-gray-600 rounded-md text-white shadow-sm focus:outline-none focus:ring-primary" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-text-dark">Senha</label>
            <input id="password" name="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-background border border-gray-600 rounded-md text-white shadow-sm focus:outline-none focus:ring-primary" />
          </div>
          <div className="flex items-center">
            <input
              id="remember_me"
              name="remember_me"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 text-primary focus:ring-primary border-gray-600 rounded bg-background"
            />
            <label htmlFor="remember_me" className="ml-2 block text-sm text-text-dark">
              Lembrar meu usuário e senha
            </label>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div>
            <button type="submit" disabled={loading} className="w-full flex justify-center py-2 px-4 border rounded-md shadow-sm text-sm font-medium text-background bg-primary hover:bg-primary-dark disabled:bg-gray-500">
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </div>
        </form>
        <div className="mt-6 text-center">
          <button onClick={() => navigate(storeSlug ? `/${storeSlug}` : '/')} className="inline-flex items-center text-text-dark hover:text-primary font-medium transition-colors">
            <ArrowLeftIcon />
            Voltar ao Cardápio
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;