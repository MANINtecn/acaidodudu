import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerCourier, fetchPublicSettings } from '../services/supabaseService';
import { useStore } from '../contexts/StoreContext';
import { UserPlus, ArrowLeft, Eye, EyeOff } from 'lucide-react';

const CourierRegisterPage: React.FC = () => {
    const { currentStore } = useStore();
    const navigate = useNavigate();

    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [storeCode, setStoreCode] = useState(''); // User input
    const [requiredCode, setRequiredCode] = useState<string | null>(null); // From settings
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    React.useEffect(() => {
        if (currentStore?.id) {
            fetchPublicSettings(currentStore.id).then(settings => {
                setRequiredCode(settings.courier_access_code || null);
            });
        }
    }, [currentStore]);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        
        if (password !== confirmPassword) {
            setError('As senhas não coincidem.');
            return;
        }

        if (password.length < 4) {
            setError('A senha deve ter pelo menos 4 caracteres.');
            return;
        }

        // Security Check
        if (requiredCode && storeCode !== requiredCode) {
            setError('Código da Loja incorreto. Peça ao gerente.');
            return;
        }

        if (!currentStore) return;

        setLoading(true);

        try {
            await registerCourier(name, phone, password, currentStore.id);
            setSuccess(true);
            setTimeout(() => {
                navigate(`/${currentStore.slug}/entregador/login`);
            }, 2000);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Erro ao criar conta. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
                <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-sm w-full animate-bounce-in">
                    <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <UserPlus size={40} />
                    </div>
                    <h2 className="text-2xl font-bold text-green-800 mb-2">Conta Criada!</h2>
                    <p className="text-green-600">Redirecionando para o login...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
                <div className="bg-gray-900 p-6 flex items-center gap-4 text-white">
                    <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <ArrowLeft size={24} />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold">Criar Conta</h1>
                        <p className="text-gray-400 text-xs">Entregador Parceiro</p>
                    </div>
                </div>

                <div className="p-8">
                    <form onSubmit={handleRegister} className="space-y-4">
                         <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome Completo</label>
                            <input 
                                type="text" 
                                required
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Seu nome"
                                className="w-full px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all text-gray-900 dark:text-gray-100"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Celular (WhatsApp)</label>
                            <input 
                                type="tel" 
                                required
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                                placeholder="32999999999"
                                className="w-full px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all font-mono text-gray-900 dark:text-gray-100"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
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
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirmar</label>
                                <div className="relative">
                                    <input 
                                        type={showPassword ? "text" : "password"}
                                        required
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        placeholder="••••••"
                                        className="w-full px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all pr-10 text-gray-900 dark:text-gray-100"
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Código da Loja (Segurança)</label>
                            <input 
                                type="text" 
                                required
                                value={storeCode}
                                onChange={e => setStoreCode(e.target.value)}
                                placeholder="Código de 6 dígitos fornecido pela loja"
                                maxLength={6}
                                className="w-full px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-700 border border-orange-200 dark:border-orange-500/30 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all text-center tracking-widest font-mono text-lg text-gray-900 dark:text-gray-100"
                            />
                        </div>

                        {error && (
                            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 text-sm rounded-lg text-center font-medium animate-pulse">
                                {error}
                            </div>
                        )}

                        <button 
                            type="submit" 
                            disabled={loading}
                            className="w-full py-3.5 bg-gray-900 hover:bg-black text-white rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 transition-all mt-4 disabled:opacity-70"
                        >
                            {loading ? 'Criando...' : (
                                <>
                                    Registrar <UserPlus size={20} />
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default CourierRegisterPage;
