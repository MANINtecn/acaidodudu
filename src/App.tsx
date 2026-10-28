// Deploy trigger: fix bot visibility and auth
import React, { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { isSupabaseConfigured, supabase, ownsStore, isPlatformAdmin } from './services/supabaseService';
import CustomerPage from './pages/CustomerPage';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { StoreProvider, useStore } from './contexts/StoreContext';
import { CourierProvider } from './contexts/CourierContext';
import BootCheckModal from './components/BootCheckModal';

const AdminPage = lazy(() => import('./pages/AdminPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const CourierPage = lazy(() => import('./pages/CourierPage'));
const CourierLoginPage = lazy(() => import('./pages/CourierLoginPage'));
const CourierRegisterPage = lazy(() => import('./pages/CourierRegisterPage'));
const SuperAdminPage = lazy(() => import('./pages/SuperAdminPage'));
const CadastroLojistaPage = lazy(() => import('./pages/CadastroLojistaPage'));
const ShoppingHomePage = lazy(() => import('./pages/ShoppingHomePage'));
const NovaSenhaPage = lazy(() => import('./pages/NovaSenhaPage'));
const WaiterPage = lazy(() => import('./pages/WaiterPage'));
const StaffSelectionPage = lazy(() => import('./pages/StaffSelectionPage'));
const StaffPortalPage = lazy(() => import('./pages/StaffPortalPage'));
const TvOverlayPage = lazy(() => import('./pages/TvOverlayPage'));

const AvisoDeAcesso: React.FC<{ titulo: string; texto: string }> = ({ titulo, texto }) => (
  <div className="flex items-center justify-center min-h-screen bg-gray-900 p-6">
    <div className="max-w-md w-full bg-gray-800 border border-gray-700 rounded-2xl p-8 text-center space-y-4">
      <h1 className="text-2xl font-black text-white">{titulo}</h1>
      <p className="text-gray-300">{texto}</p>
      <button onClick={() => supabase.auth.signOut()} className="bg-gray-700 hover:bg-gray-600 text-white font-bold px-5 py-2 rounded-lg">Sair</button>
    </div>
  </div>
);

type EstadoAcesso = 'checando' | 'ok' | 'negado' | 'bloqueada';

const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, loading } = useAuth();
  const { currentStore, loading: storeLoading } = useStore();
  const location = useLocation();
  const { storeSlug } = useParams();
  const [estado, setEstado] = useState<EstadoAcesso>('checando');

  // Só o dono da loja (ou o administrador da plataforma) entra no admin dela.
  // Erro de rede NÃO bloqueia (o PDV precisa abrir sem internet); quem protege os dados é o RLS.
  useEffect(() => {
    if (!session || storeLoading) return;
    // Sem loja carregada pode ser internet fora (o fetch da loja não distingue): não bloquear, como antes.
    if (!currentStore) { setEstado('ok'); return; }
    let vivo = true;
    (async () => {
      const [dono, admin] = await Promise.all([ownsStore(currentStore.id), isPlatformAdmin()]);
      if (!vivo) return;
      if (admin === true) return setEstado('ok');
      if (dono === false) return setEstado('negado');
      // Dado de cópia local (sem internet) pode estar velho: a data de vencimento só vale com dado fresco.
      const vencida = !currentStore.deCopiaLocal && currentStore.subscription_end_date && new Date(currentStore.subscription_end_date).getTime() < Date.now();
      setEstado(currentStore.is_active === false || vencida ? 'bloqueada' : 'ok');
    })();
    return () => { vivo = false; };
  }, [session?.user?.id, currentStore?.id, storeLoading]);

  if (loading) {
    return <div className="flex items-center justify-center h-screen bg-background"><div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }

  if (!session) {
    if (storeSlug) {
      return <Navigate to={`/${storeSlug}/login`} state={{ from: location }} replace />;
    }
    return <Navigate to="/" replace />;
  }

  if (estado === 'ok') return <>{children}</>;
  if (estado === 'negado') return <AvisoDeAcesso titulo="Sem permissão" texto="Este login não é o dono desta loja. Entre com a conta correta." />;
  if (estado === 'bloqueada') return <AvisoDeAcesso titulo="Assinatura inativa" texto="O acesso desta loja está suspenso ou vencido. Fale com o suporte para regularizar." />;
  return <div className="flex items-center justify-center h-screen bg-background"><div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
};

const SupabaseConfigWarning = () => (
  <div className="bg-background text-text-light min-h-screen flex items-center justify-center p-4">
    <div className="bg-surface rounded-lg shadow-2xl p-8 max-w-2xl text-center">
      <h1 className="font-display text-4xl text-secondary mb-4">Configuração Necessária</h1>
      <p className="text-lg mb-2">
        Para conectar o aplicativo ao seu banco de dados, adicione suas credenciais do Supabase.
      </p>
      <div className="text-left space-y-4 text-text-dark mt-6 bg-background p-6 rounded-lg">
        <div>
          <h2 className="font-bold text-text-light text-xl mb-3">Instruções:</h2>
          <p className="mb-2">
            1. No menu à esquerda, clique no ícone de <strong>chave (🔑) "Secrets"</strong>.
          </p>
          <p>
            2. Crie duas novas "secrets" com os seguintes nomes e cole os valores do seu projeto Supabase:
          </p>
          <ul className="list-disc list-inside mt-4 space-y-2">
            <li>Nome: <code className="bg-surface px-2 py-1 rounded-md text-primary">VITE_SUPABASE_URL</code></li>
            <li>Nome: <code className="bg-surface px-2 py-1 rounded-md text-primary">VITE_SUPABASE_ANON_KEY</code></li>
          </ul>
        </div>
      </div>
    </div>
  </div>
);

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error in React Component:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-6 text-center">
          <div className="bg-gray-800 p-8 rounded-2xl border border-gray-700 shadow-2xl max-w-md w-full flex flex-col items-center">
            <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-4 text-2xl font-black">
            </div>
            <h1 className="text-xl font-extrabold text-white mb-2">Ops! Ocorreu um Erro de Interface</h1>
            <p className="text-xs text-gray-400 mb-6 bg-gray-900/80 p-3 rounded-lg w-full text-left font-mono break-all max-h-32 overflow-y-auto border border-gray-700">
              {this.state.error?.message || String(this.state.error || 'Erro desconhecido')}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-bold rounded-xl shadow-lg transition-all text-sm uppercase tracking-wider flex items-center justify-center gap-2"
            >
              Recarregar Sistema
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// detect if we are running in Electron
const isElectron = /Electron/i.test(navigator.userAgent);

// Le direto do localStorage (sincrono, sem esperar o Supabase) para o
// BootCheckModal poder testar a balanca sem atrasar ainda mais o boot.
// Mesmo fallback usado em supabaseService.ts (getDefaultSettings).
const lerConfigBalancaLocal = (): { isScaleEnabled: boolean; scaleBaudRate: number } => {
  try {
    const local = JSON.parse(localStorage.getItem('acai_scale_settings') || '{}');
    return {
      isScaleEnabled: !!local.isScaleEnabled,
      scaleBaudRate: Number(local.scaleBaudRate) || 9600,
    };
  } catch (e) {
    return { isScaleEnabled: false, scaleBaudRate: 9600 };
  }
};

const App: React.FC = () => {
  if (!isSupabaseConfigured) {
    return <SupabaseConfigWarning />;
  }

  const loadingSpinner = <div className="flex items-center justify-center h-screen bg-background"><div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;

  const Router = isElectron ? HashRouter : BrowserRouter;
  const scaleConfigLocal = isElectron ? lerConfigBalancaLocal() : null;

  return (
    <ErrorBoundary>
      {isElectron && (
        <BootCheckModal
          isScaleEnabled={scaleConfigLocal?.isScaleEnabled}
          scaleBaudRate={scaleConfigLocal?.scaleBaudRate}
        />
      )}
      <AuthProvider>
        <Router>
          <StoreProvider>
            <Suspense fallback={loadingSpinner}>
              <Routes>
                {/* 
                  If accessed via subdomain (e.g. acaidodudu.domain.com), the store is loaded in context.
                  We render CustomerPage at root '/'.
                  If accessed via path (e.g. domain.com/acaidodudu), we render CustomerPage at '/:storeSlug'.
                */}
                <Route path="/" element={<RootRoute />} />
                <Route path="/super-admin" element={<SuperAdminPage />} />
                <Route path="/cadastro" element={<CadastroLojistaPage />} />
                <Route path="/shopping" element={<ShoppingHomePage />} />
                <Route path="/redefinir_senha" element={<NovaSenhaPage />} />

                {/* HIGH PRIORITY ROUTES - Independent of Store Context */}
                <Route path="/portal-equipe" element={<StaffSelectionPage />} />
                <Route path="/acesso" element={<StaffSelectionPage />} />
                <Route path="/hub-equipe" element={<StaffSelectionPage />} />

                {/* Specific Global Routes */}
                <Route path="/staff" element={<StaffPortalPage />} />
                <Route path="/entregador" element={<CourierPage />} />
                <Route path="/waiter" element={<WaiterPage />} />
                <Route path="/garcom" element={<WaiterPage />} />
                <Route path="/tv" element={<TvOverlayPage />} />

                {/* Path-based routing with slug */}
                <Route path="/:storeSlug/staff" element={<StaffPortalPage />} />
                <Route path="/:storeSlug/admin" element={<AuthGuard><AdminPage /></AuthGuard>} />
                <Route path="/:storeSlug/entregador" element={<CourierProvider><CourierPage /></CourierProvider>} />
                <Route path="/:storeSlug/entregador/login" element={<CourierProvider><CourierLoginPage /></CourierProvider>} />
                <Route path="/:storeSlug/entregador/registro" element={<CourierProvider><CourierRegisterPage /></CourierProvider>} />
                <Route path="/:storeSlug/entregador/dashboard" element={<CourierProvider><CourierPage /></CourierProvider>} />
                <Route path="/:storeSlug/garcom" element={<WaiterPage />} />
                <Route path="/:storeSlug/login" element={<LoginPage />} />
                
                {/* Generic Slug Route last */}
                <Route path="/:storeSlug/tv" element={<TvOverlayPage />} />
                <Route path="/:storeSlug" element={<CustomerPage />} />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </Suspense>
          </StoreProvider>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
};

// Helper component to decide what to render at root '/'
const veioDeRecuperacao = typeof window !== 'undefined' && /type=recovery/.test(window.location.hash);

const RootRoute: React.FC = () => {
  const { currentStore, loading: storeLoading } = useStore();
  const { session, loading: authLoading } = useAuth();
  const isElectron = /Electron/i.test(navigator.userAgent);

  if (veioDeRecuperacao) return <Navigate to={{ pathname: '/redefinir_senha', hash: window.location.hash }} replace />;

  if (storeLoading || authLoading) return <div className="flex items-center justify-center h-screen bg-background"><div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;

  // If in Electron, check if user is already authenticated
  if (isElectron) {
    if (session) {
      return <Navigate to="/acaidodudu/admin" replace />;
    }
    return <Navigate to="/acaidodudu/login" replace />;
  }

  // If store is loaded (via subdomain), show CustomerPage
  if (currentStore) {
    return <CustomerPage />;
  }

  // Sem loja na raiz: é a página do shopping (Pede Aqui)
  return <ShoppingHomePage />;
};

export default App;