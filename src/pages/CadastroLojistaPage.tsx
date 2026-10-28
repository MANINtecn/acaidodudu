import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, fetchMinhaLoja, criarMinhaLoja } from '../services/supabaseService';
import { useAuth } from '../auth/AuthContext';

const CATEGORIAS = ['Lanchonete', 'Sorveteria / Açaí', 'Pizzaria', 'Restaurante', 'Padaria', 'Outros'];
const SLUGS_RESERVADOS = ['admin', 'login', 'super-admin', 'staff', 'acesso', 'hub-equipe', 'portal-equipe', 'garcom', 'waiter', 'entregador', 'tv', 'cadastro', 'assets', 'public'];

const limparSlug = (texto: string) =>
    texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');

/** Mensagem do banco (função criar_minha_loja) em português para o lojista. */
const traduzirErro = (msg: string) => {
    if (/link_em_uso/i.test(msg)) return 'Este link já está em uso. Escolha outro.';
    if (/link_invalido/i.test(msg)) return 'Link inválido. Use de 3 a 40 letras minúsculas, números ou hífen.';
    if (/ja_tem_loja/i.test(msg)) return 'Esta conta já tem uma loja.';
    if (/sem_login/i.test(msg)) return 'Entre na sua conta para criar a loja.';
    return msg;
};

const CadastroLojistaPage: React.FC = () => {
    const { session, loading } = useAuth();
    const navigate = useNavigate();
    const [modo, setModo] = useState<'entrar' | 'criar'>('criar');
    const [email, setEmail] = useState('');
    const [senha, setSenha] = useState('');
    const [aviso, setAviso] = useState<string | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);

    const [nome, setNome] = useState('');
    const [slug, setSlug] = useState('');
    const [categoria, setCategoria] = useState('');
    const [cidade, setCidade] = useState('');
    const [verificando, setVerificando] = useState(false);

    // Já logado e já com loja: vai direto para o painel dela.
    useEffect(() => {
        if (!session) return;
        let vivo = true;
        setVerificando(true);
        fetchMinhaLoja(session.user.id)
            .then(loja => { if (vivo && loja) navigate(`/${loja.slug}/admin`, { replace: true }); })
            .catch(() => { /* sem rede: mostra o formulário */ })
            .finally(() => { if (vivo) setVerificando(false); });
        return () => { vivo = false; };
    }, [session?.user?.id]);

    const enviarConta = async (e: React.FormEvent) => {
        e.preventDefault();
        setOcupado(true); setErro(null); setAviso(null);
        try {
            if (modo === 'entrar') {
                const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
                if (error) throw error;
            } else {
                if (senha.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
                const { data, error } = await supabase.auth.signUp({
                    email, password: senha, options: { emailRedirectTo: `${window.location.origin}/cadastro` },
                });
                if (error) throw error;
                // Com confirmação de e-mail ligada, não há sessão até o lojista clicar no link.
                if (!data.session) setAviso('Enviamos um link de confirmação para o seu e-mail. Clique nele e volte aqui para criar a sua loja.');
            }
        } catch (err: any) {
            setErro(err?.message || 'Não foi possível continuar.');
        } finally {
            setOcupado(false);
        }
    };

    const criarLoja = async (e: React.FormEvent) => {
        e.preventDefault();
        const link = limparSlug(slug || nome);
        setErro(null);
        if (!nome.trim()) return setErro('Informe o nome da loja.');
        if (link.length < 3 || SLUGS_RESERVADOS.includes(link)) return setErro('Escolha outro link para a loja.');
        setOcupado(true);
        try {
            const loja = await criarMinhaLoja({ nome: nome.trim(), slug: link, categoria, cidade: cidade.trim() });
            navigate(`/${loja.slug}/admin`, { replace: true });
        } catch (err: any) {
            setErro(traduzirErro(err?.message || String(err)));
        } finally {
            setOcupado(false);
        }
    };

    const campo = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2.5 text-gray-900 dark:text-white';
    const botao = 'w-full rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-bold py-3';

    return (
        <div className="min-h-screen bg-orange-50 dark:bg-gray-900 flex items-center justify-center p-6">
            <div className="w-full max-w-md bg-white dark:bg-gray-800 border border-orange-100 dark:border-gray-700 rounded-2xl shadow-lg p-8 space-y-5">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 dark:text-white">Cadastre sua loja</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">7 dias grátis para testar. Sem cartão.</p>
                </div>

                {loading || verificando ? (
                    <p className="text-gray-500">Carregando...</p>
                ) : !session ? (
                    <form onSubmit={enviarConta} className="space-y-4">
                        <div className="grid grid-cols-2 gap-2 text-sm font-bold">
                            <button type="button" onClick={() => setModo('criar')} className={`py-2 rounded-lg ${modo === 'criar' ? 'bg-orange-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>Criar conta</button>
                            <button type="button" onClick={() => setModo('entrar')} className={`py-2 rounded-lg ${modo === 'entrar' ? 'bg-orange-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>Já tenho conta</button>
                        </div>
                        <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Seu e-mail" className={campo} />
                        <input type="password" required value={senha} onChange={e => setSenha(e.target.value)} placeholder="Senha (mín. 8 caracteres)" className={campo} />
                        {aviso && <p className="text-sm text-green-700 dark:text-green-400">{aviso}</p>}
                        {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
                        <button disabled={ocupado} className={botao}>{ocupado ? 'Aguarde...' : modo === 'criar' ? 'Criar conta' : 'Entrar'}</button>
                    </form>
                ) : (
                    <form onSubmit={criarLoja} className="space-y-4">
                        <input type="text" required value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome da loja" className={campo} />
                        <div>
                            <input type="text" value={slug} onChange={e => setSlug(e.target.value)} placeholder={limparSlug(nome) || 'link-da-loja'} className={campo} />
                            <p className="text-xs text-gray-500 mt-1">{window.location.origin}/{limparSlug(slug || nome) || '...'}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <select value={categoria} onChange={e => setCategoria(e.target.value)} className={campo}>
                                <option value="">Categoria</option>
                                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <input type="text" value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Cidade" className={campo} />
                        </div>
                        {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
                        <button disabled={ocupado} className={botao}>{ocupado ? 'Criando...' : 'Criar minha loja'}</button>
                        <button type="button" onClick={() => supabase.auth.signOut()} className="w-full text-sm text-gray-500 hover:underline">Sair</button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default CadastroLojistaPage;
