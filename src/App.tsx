// Deploy trigger: fix bot visibility and auth
import React, { lazy, Suspense } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { isSupabaseConfigured } from './services/supabaseService';
import CustomerPage from './pages/CustomerPage';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { StoreProvider, useStore } from './contexts/StoreContext';
import { CourierProvider } from './contexts/CourierContext';

const AdminPage = lazy(() => import('./pages/AdminPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const CourierPage = lazy(() => import('./pages/CourierPage'));
const CourierLoginPage = lazy(() => import('./pages/CourierLoginPage'));
const CourierRegisterPage = lazy(() => import('./pages/CourierRegisterPage'));
const SuperAdminPage = lazy(() => import('./pages/SuperAdminPage'));
const WaiterPage = lazy(() => import('./pages/WaiterPage'));
const StaffSelectionPage = lazy(() => import('./pages/StaffSelectionPage'));
const StaffPortalPage = lazy(() => import('./pages/StaffPortalPage'));
const TvOverlayPage = lazy(() => import('./pages/TvOverlayPage'));

const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, loading } = useAuth();
  const location = useLocation();
  const { storeSlug } = useParams();

  if (loading) {
    return <div className="flex items-center justify-center h-screen bg-background"><div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }

  if (!session) {
    if (storeSlug) {
      return <Navigate to={`/${storeSlug}/login`} state={{ from: location }} replace />;
    }
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
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
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: any) {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <div className="flex items-center justify-center h-screen bg-background text-text-light"><h1>Algo deu errado.</h1></div>;
    }

    return this.props.children;
  }
}

// detect if we are running in Electron
const isElectron = /Electron/i.test(navigator.userAgent);

const App: React.FC = () => {
  if (!isSupabaseConfigured) {
    return <SupabaseConfigWarning />;
  }

  const loadingSpinner = <div className="flex items-center justify-center h-screen bg-background"><div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;

  const Router = isElectron ? HashRouter : BrowserRouter;

  return (
    <ErrorBoundary>
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
const RootRoute: React.FC = () => {
  const { currentStore, loading } = useStore();
  const isElectron = /Electron/i.test(navigator.userAgent);

  if (loading) return <div className="flex items-center justify-center h-screen bg-background"><div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;

  // If in Electron, always redirect to admin login
  if (isElectron) {
    return <Navigate to="/acaidodudu/login" replace />;
  }

  // If store is loaded (via subdomain), show CustomerPage
  if (currentStore) {
    return <CustomerPage />;
  }

  // If no store loaded at root, redirect to default path-based store
  // In a real SaaS, this would be the Landing Page
  return <Navigate to="/acaidodudu" replace />;
};

export default App;