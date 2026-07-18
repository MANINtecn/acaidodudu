import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCourier } from '../contexts/CourierContext';
import { useStore } from '../contexts/StoreContext';
import { Bike, LogIn, ChevronRight, Eye, EyeOff } from 'lucide-react';

const CourierLoginPage: React.FC = () => {
    const { login } = useCourier();
    const { currentStore } = useStore();
    const navigate = useNavigate();

    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const success = await login(phone, password);
        if (success) {
            navigate(`/${currentStore?.slug || 'acaidodudu'}/entregador/dashboard`);
        } else {
            setError('Credenciais inválidas. Verifique telefone e senha.');
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
                <div className="bg-red-600 p-6 flex flex-col items-center text-white">
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4">
                        <Bike size={32} />
                    </div>
                    <h1 className="text-2xl font-bold">Área do Entregador</h1>
                    <p className="text-red-100 text-sm">Acesse para ver suas entregas</p>
                </div>

                <div className="p-8">
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Celular</label>
                            <input 
                                type="tel" 
                                required
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                                placeholder="32999999999"
                                className="w-full px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all font-mono text-gray-900 dark:text-gray-100"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Senha</label>
                            <div className="relative">
                                <input 
                                    type={showPassword ? "text" : "password"}
                                    required
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="••••••"
                                    className="w-full px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all pr-10 text-gray-900 dark:text-gray-100"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 text-sm rounded-lg text-center font-medium animate-pulse">
                                {error}
                            </div>
                        )}

                        <button 
                            type="submit" 
                            disabled={loading}
                            className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-red-500/30 flex items-center justify-center gap-2 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Entrando...' : (
                                <>
                                    Entrar <LogIn size={20} />
                                </>
                            )}
                        </button>

                        <div className="border-t border-gray-100 dark:border-gray-700 pt-6 text-center">
                            <p className="text-gray-500 text-sm mb-3">Não tem cadastro?</p>
                            <button
                                type="button" 
                                onClick={() => navigate(`/${currentStore?.slug || 'acaidodudu'}/entregador/registro`)}
                                className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                            >
                                Criar Conta <ChevronRight size={16} />
                            </button>
                        </div>
                    </form>
                </div>
            </div>
            <p className="mt-8 text-gray-400 text-xs">Sistema Açaí do Dudu &copy; 2026</p>
        </div>
    );
};

export default CourierLoginPage;
