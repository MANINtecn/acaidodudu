
import React, { useState, useEffect } from 'react';
import { supabase, isPlatformAdmin } from '../services/supabaseService';
import { useAuth } from '../auth/AuthContext';
import { CentralDeGestao } from './superadmin/CentralDeGestao';

const Carregando = () => <div className="flex items-center justify-center h-screen bg-gray-900 text-white">Carregando...</div>;

/** Só entra quem está na tabela platform_admins. O RLS do banco é quem realmente protege; isto é a porta. */
const SuperAdminPage: React.FC = () => {
    const { session, loading } = useAuth();
    const [admin, setAdmin] = useState<boolean | null | undefined>(undefined);
    const [email, setEmail] = useState('');
    const [senha, setSenha] = useState('');
    const [erro, setErro] = useState<string | null>(null);
    const [entrando, setEntrando] = useState(false);
    const [aviso, setAviso] = useState<string | null>(null);

    useEffect(() => {
        if (!session) { setAdmin(undefined); return; }
        let vivo = true;
        isPlatformAdmin().then(v => { if (vivo) setAdmin(v); });
        return () => { vivo = false; };
    }, [session?.user?.id]);

    const entrar = async (e: React.FormEvent) => {
        e.preventDefault();
        setEntrando(true);
        setErro(null);
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) setErro(error.message || 'Falha ao entrar.');
        setEntrando(false);
    };

    const esqueci = async () => {
        setErro(null); setAviso(null);
        if (!email.trim()) return setErro('Digite seu e-mail acima e clique de novo.');
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/redefinir_senha` });
        if (error) return setErro(error.message);
        setAviso('Se este e-mail tiver conta, enviamos um link para criar a nova senha.');
    };

    if (loading) return <Carregando />;

    if (!session) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
                <form onSubmit={entrar} className="w-full max-w-sm bg-gray-800 border border-gray-700 rounded-2xl p-8 space-y-4">
                    <h1 className="text-2xl font-black text-blue-500">Super Admin</h1>
                    <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mail" className="w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white" />
                    <input type="password" required value={senha} onChange={e => setSenha(e.target.value)} placeholder="Senha" className="w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white" />
                    {erro && <p className="text-red-400 text-sm">{erro}</p>}
                    {aviso && <p className="text-green-400 text-sm">{aviso}</p>}
                    <button disabled={entrando} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-lg">{entrando ? 'Entrando...' : 'Entrar'}</button>
                    <button type="button" onClick={esqueci} className="w-full text-sm text-gray-400 hover:text-white">Esqueci minha senha</button>
                </form>
            </div>
        );
    }

    if (admin === undefined) return <Carregando />;

    if (admin !== true) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
                <div className="max-w-md w-full bg-gray-800 border border-gray-700 rounded-2xl p-8 text-center space-y-4">
                    <h1 className="text-2xl font-black text-white">Sem permissão</h1>
                    <p className="text-gray-300">{admin === null ? 'Não foi possível confirmar sua permissão (sem conexão?).' : 'Este login não é administrador da plataforma.'}</p>
                    <button onClick={() => supabase.auth.signOut()} className="bg-gray-700 hover:bg-gray-600 text-white font-bold px-5 py-2 rounded-lg">Sair</button>
                </div>
            </div>
        );
    }

    return <CentralDeGestao />;
};

export default SuperAdminPage;
