import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseService';
import { useAuth } from '../auth/AuthContext';

/**
 * Destino do link "redefinir senha" do e-mail. O link já traz uma sessão temporária:
 * o cliente do Supabase a lê da URL e esta tela só pede a senha nova.
 */
const NovaSenhaPage: React.FC = () => {
    const { session, loading } = useAuth();
    const navigate = useNavigate();
    const [senha, setSenha] = useState('');
    const [confirma, setConfirma] = useState('');
    const [erro, setErro] = useState<string | null>(null);
    const [pronto, setPronto] = useState(false);
    const [ocupado, setOcupado] = useState(false);

    // O Supabase devolve o motivo no # quando o link não vale (ex.: otp_expired).
    const motivoDoLink = useMemo(() => {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const codigo = hash.get('error_code');
        if (!codigo) return null;
        return codigo === 'otp_expired'
            ? 'O link expirou ou foi aberto antes por um leitor automático do e-mail (comum no Gmail e Outlook). Peça um novo e abra logo.'
            : (hash.get('error_description') || 'Link inválido.').replace(/\+/g, ' ');
    }, []);

    const salvar = async (e: React.FormEvent) => {
        e.preventDefault();
        setErro(null);
        if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.');
        if (senha !== confirma) return setErro('As duas senhas não são iguais.');
        setOcupado(true);
        const { error } = await supabase.auth.updateUser({ password: senha });
        setOcupado(false);
        if (error) return setErro(error.message || 'Não foi possível salvar a senha.');
        setPronto(true);
        setTimeout(() => navigate('/', { replace: true }), 1800);
    };

    const campo = 'w-full rounded-lg border border-gray-600 bg-gray-700 p-2.5 text-white';

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
            <div className="w-full max-w-sm bg-gray-800 border border-gray-700 rounded-2xl p-8 space-y-4">
                <h1 className="text-2xl font-black text-white">Nova senha</h1>
                {loading ? (
                    <p className="text-gray-400">Carregando...</p>
                ) : !session ? (
                    <>
                        <p className="text-gray-300">{motivoDoLink || 'Este link venceu ou já foi usado. Peça um novo link de redefinição.'}</p>
                        <Link to="/super-admin" className="block text-center text-blue-400 hover:underline">Voltar ao login</Link>
                    </>
                ) : pronto ? (
                    <p className="text-green-400">Senha alterada. Redirecionando...</p>
                ) : (
                    <form onSubmit={salvar} className="space-y-4">
                        <input type="password" required value={senha} onChange={e => setSenha(e.target.value)} placeholder="Nova senha (mín. 8 caracteres)" className={campo} autoFocus />
                        <input type="password" required value={confirma} onChange={e => setConfirma(e.target.value)} placeholder="Repita a nova senha" className={campo} />
                        {erro && <p className="text-sm text-red-400">{erro}</p>}
                        <button disabled={ocupado} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-lg">{ocupado ? 'Salvando...' : 'Salvar nova senha'}</button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default NovaSenhaPage;
