
import React, { useState, useEffect } from 'react';
import { fetchAllStores, createStore, updateStoreSubscription, getGlobalStats, supabase, isPlatformAdmin } from '../services/supabaseService';
import { useAuth } from '../auth/AuthContext';
import { Store } from '../types';

// Icons (Simple SVG placeholders)
const PlusIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>;
const EditIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>;

const XIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>;

type Plano = 'basico' | 'avancado';
const VALOR_PADRAO: Record<Plano, number> = { basico: 199, avancado: 499 };
const CATEGORIAS_LOJA = ['Lanchonete', 'Sorveteria / Açaí', 'Pizzaria', 'Restaurante', 'Padaria', 'Agropecuária', 'Outros'];
const NOME_PLANO: Record<Plano, string> = { basico: 'Básico', avancado: 'Avançado' };
// Endereços que já são rotas do app: não podem virar link de loja.
const SLUGS_RESERVADOS = ['admin', 'login', 'super-admin', 'staff', 'acesso', 'hub-equipe', 'portal-equipe', 'garcom', 'waiter', 'entregador', 'tv', 'cadastro', 'shopping', 'assets', 'public'];

const limparSlug = (texto: string) =>
    texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');

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

    return <PainelSuperAdmin />;
};

const PainelSuperAdmin: React.FC = () => {
    const [stores, setStores] = useState<Store[]>([]);
    const [stats, setStats] = useState({ totalStores: 0, activeStores: 0, mrr: 0 });
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingStore, setEditingStore] = useState<Store | null>(null);
    const [criada, setCriada] = useState<{ nome: string; slug: string; email: string } | null>(null);

    // Form States
    const [newStore, setNewStore] = useState<{ name: string; slug: string; owner_email: string; plan: Plano; plan_value: number; categoria: string; cidade: string; aparecer_no_shopping: boolean }>({ name: '', slug: '', owner_email: '', plan: 'basico', plan_value: VALOR_PADRAO.basico, categoria: '', cidade: '', aparecer_no_shopping: false });
    const [editForm, setEditForm] = useState<{ plan: Plano; plan_value: number; subscription_end_date: string; is_active: boolean; categoria: string; cidade: string; aparecer_no_shopping: boolean }>({ plan: 'basico', plan_value: 0, subscription_end_date: '', is_active: true, categoria: '', cidade: '', aparecer_no_shopping: false });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [storesData, statsData] = await Promise.all([
                fetchAllStores(),
                getGlobalStats()
            ]);
            setStores(storesData);
            setStats(statsData);
        } catch (error) {
            console.error("Error loading super admin data:", error);
            alert("Erro ao carregar dados.");
        } finally {
            setLoading(false);
        }
    };

    const handleCreateStore = async () => {
        const slug = limparSlug(newStore.slug || newStore.name);
        const email = newStore.owner_email.trim().toLowerCase();
        if (!newStore.name.trim()) return alert('Informe o nome da loja.');
        if (!slug) return alert('Informe um link (slug) válido.');
        if (SLUGS_RESERVADOS.includes(slug)) return alert(`"${slug}" é um endereço reservado do sistema. Escolha outro.`);
        if (stores.some(s => s.slug === slug)) return alert(`Já existe uma loja com o link "${slug}".`);
        if (!email) return alert('Informe o e-mail do dono: é ele que dá acesso ao painel da loja.');
        try {
            // Vencimento padrão: 30 dias (período de teste)
            const expirationDate = new Date();
            expirationDate.setDate(expirationDate.getDate() + 30);

            await createStore({
                name: newStore.name.trim(),
                slug,
                owner_email: email,
                plan: newStore.plan,
                plan_value: newStore.plan_value || 0,
                subscription_end_date: expirationDate.toISOString(),
                is_active: true,
                // Campos do shopping só vão se preenchidos (o painel segue funcionando sem o SQL 3).
                ...(newStore.categoria ? { categoria: newStore.categoria } : {}),
                ...(newStore.cidade.trim() ? { cidade: newStore.cidade.trim() } : {}),
                ...(newStore.aparecer_no_shopping ? { aparecer_no_shopping: true } : {}),
            });
            setShowCreateModal(false);
            setCriada({ nome: newStore.name.trim(), slug, email });
            setNewStore({ name: '', slug: '', owner_email: '', plan: 'basico', plan_value: VALOR_PADRAO.basico, categoria: '', cidade: '', aparecer_no_shopping: false });
            loadData();
        } catch (error: any) {
            console.error(error);
            alert(`Erro ao criar loja: ${error?.message || error}`);
        }
    };

    const handleUpdateStore = async () => {
        if (!editingStore) return;
        try {
            await updateStoreSubscription(editingStore.id, {
                plan: editForm.plan,
                plan_value: editForm.plan_value,
                is_active: editForm.is_active,
                categoria: editForm.categoria || null,
                cidade: editForm.cidade.trim() || null,
                aparecer_no_shopping: editForm.aparecer_no_shopping,
                subscription_end_date: editForm.subscription_end_date ? new Date(editForm.subscription_end_date + 'T23:59:59').toISOString() : null,
            });
            alert("Loja atualizada!");
            setEditingStore(null);
            loadData();
        } catch (error: any) {
            console.error(error);
            alert(`Erro ao atualizar loja: ${error?.message || error}`);
        }
    };

    const openEditModal = (store: Store) => {
        setEditingStore(store);
        setEditForm({
            plan: store.plan === 'avancado' ? 'avancado' : 'basico',
            plan_value: store.plan_value || 0,
            subscription_end_date: store.subscription_end_date ? new Date(store.subscription_end_date).toISOString().split('T')[0] : '',
            is_active: store.is_active ?? true,
            categoria: store.categoria || '',
            cidade: store.cidade || '',
            aparecer_no_shopping: store.aparecer_no_shopping ?? false,
        });
    };

    const linkDaLoja = (slug: string) => `${window.location.origin}/${slug}`;

    if (loading) return <Carregando />;

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-4xl font-bold text-blue-500">Super Admin Dashboard</h1>
                    <div className="flex items-center gap-3">
                        <button onClick={() => supabase.auth.signOut()} className="text-gray-400 hover:text-white text-sm font-bold">Sair</button>
                        <button onClick={() => setShowCreateModal(true)} className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-bold transition">
                            <PlusIcon /> <span>Nova Loja</span>
                        </button>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
                        <h3 className="text-gray-400 text-sm font-bold uppercase">Total de Lojas</h3>
                        <p className="text-4xl font-bold text-white mt-2">{stats.totalStores}</p>
                    </div>
                    <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
                        <h3 className="text-gray-400 text-sm font-bold uppercase">Lojas Ativas</h3>
                        <p className="text-4xl font-bold text-green-400 mt-2">{stats.activeStores}</p>
                    </div>
                    <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
                        <h3 className="text-gray-400 text-sm font-bold uppercase">MRR (Mensal)</h3>
                        <p className="text-4xl font-bold text-blue-400 mt-2">R$ {stats.mrr.toFixed(2)}</p>
                    </div>
                </div>

                {/* Stores Table */}
                <div className="bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-700">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-700 text-gray-300 uppercase text-sm">
                                <tr>
                                    <th className="p-4">Nome</th>
                                    <th className="p-4">Link</th>
                                    <th className="p-4">Email Dono</th>
                                    <th className="p-4">Plano</th>
                                    <th className="p-4">Vencimento</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {stores.map(store => {
                                    const daysRemaining = store.subscription_end_date
                                        ? Math.ceil((new Date(store.subscription_end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                                        : 0;

                                    return (
                                        <tr key={store.id} className="hover:bg-gray-750 transition">
                                            <td className="p-4 font-bold text-white">
                                                {store.name}
                                                {(store.categoria || store.cidade) && <span className="block text-xs font-normal text-gray-400">{[store.categoria, store.cidade].filter(Boolean).join(' · ')}{store.aparecer_no_shopping ? ' · no shopping' : ''}</span>}
                                            </td>
                                            <td className="p-4 text-blue-400 space-x-3 whitespace-nowrap">
                                                <a href={`/${store.slug}`} target="_blank" rel="noreferrer">/{store.slug}</a>
                                                <a href={`/${store.slug}/admin`} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-gray-200">admin</a>
                                            </td>
                                            <td className="p-4 text-gray-300">
                                                {store.owner_email || '-'}
                                                {store.owner_email && !store.owner_id && <span className="ml-2 px-2 py-0.5 rounded text-xs font-bold bg-yellow-900 text-yellow-200" title="O dono ainda não criou/recebeu o login com este e-mail">sem login</span>}
                                            </td>
                                            <td className="p-4 text-gray-300">
                                                {NOME_PLANO[store.plan === 'avancado' ? 'avancado' : 'basico']}
                                                <span className="block text-green-400 font-mono text-xs">R$ {(store.plan_value || 0).toFixed(2)}</span>
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${daysRemaining < 7 ? 'bg-red-900 text-red-200' : 'bg-gray-700 text-gray-300'}`}>
                                                    {store.subscription_end_date ? new Date(store.subscription_end_date).toLocaleDateString() : '-'}
                                                    {store.subscription_end_date && ` (${daysRemaining} dias)`}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${store.is_active ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'}`}>
                                                    {store.is_active ? 'ATIVO' : 'SUSPENSO'}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right">
                                                <button onClick={() => openEditModal(store)} className="text-blue-400 hover:text-blue-300 p-2 rounded hover:bg-gray-700">
                                                    <EditIcon />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Loja criada: o que falta fazer */}
            {criada && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
                    <div className="bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-md border border-gray-700 space-y-3">
                        <h2 className="text-2xl font-bold text-white">Loja criada</h2>
                        <p className="text-gray-300"><b>{criada.nome}</b></p>
                        <p className="text-sm text-gray-400">Link da loja (cardápio): <span className="text-blue-400 break-all">{linkDaLoja(criada.slug)}</span></p>
                        <p className="text-sm text-gray-400">Painel do dono: <span className="text-blue-400 break-all">{linkDaLoja(criada.slug)}/admin</span></p>
                        <p className="text-sm text-yellow-300">Falta o login: crie o usuário <b>{criada.email}</b> no Supabase (Authentication, Users, Add user, com "Auto Confirm User"). Ele é ligado a esta loja sozinho.</p>
                        <button onClick={() => navigator.clipboard?.writeText(linkDaLoja(criada.slug)).catch(() => {})} className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded-lg">Copiar link da loja</button>
                        <button onClick={() => setCriada(null)} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg">Ok</button>
                    </div>
                </div>
            )}

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
                    <div className="bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-md border border-gray-700">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-white">Nova Loja</h2>
                            <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-white"><XIcon /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Nome da Loja</label>
                                <input type="text" value={newStore.name} onChange={e => setNewStore({ ...newStore, name: e.target.value })} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500" placeholder="Ex: Lanchonete do João" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Link (slug)</label>
                                <input type="text" value={newStore.slug} onChange={e => setNewStore({ ...newStore, slug: e.target.value })} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500" placeholder={limparSlug(newStore.name) || 'lanchonetedojoao'} />
                                <p className="text-xs text-gray-500 mt-1">{window.location.origin}/{limparSlug(newStore.slug || newStore.name) || '...'}</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Email do Dono</label>
                                <input type="email" value={newStore.owner_email} onChange={e => setNewStore({ ...newStore, owner_email: e.target.value })} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500" placeholder="cliente@email.com" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Plano</label>
                                    <select value={newStore.plan} onChange={e => { const plan = e.target.value as Plano; setNewStore({ ...newStore, plan, plan_value: VALOR_PADRAO[plan] }); }} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white">
                                        <option value="basico">Básico</option>
                                        <option value="avancado">Avançado</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Valor (R$)</label>
                                    <input type="number" value={newStore.plan_value} onChange={e => setNewStore({ ...newStore, plan_value: parseFloat(e.target.value) || 0 })} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Categoria</label>
                                    <select value={newStore.categoria} onChange={e => setNewStore({ ...newStore, categoria: e.target.value })} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white">
                                        <option value="">Selecione</option>
                                        {CATEGORIAS_LOJA.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Cidade</label>
                                    <input type="text" value={newStore.cidade} onChange={e => setNewStore({ ...newStore, cidade: e.target.value })} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white" placeholder="Palmas" />
                                </div>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                                <input type="checkbox" checked={newStore.aparecer_no_shopping} onChange={e => setNewStore({ ...newStore, aparecer_no_shopping: e.target.checked })} className="h-4 w-4" />
                                Aparecer no shopping (Pede Aqui)
                            </label>
                            <p className="text-xs text-gray-500">Começa ativa, com 30 dias de teste. Categoria, cidade e shopping exigem o SQL 3 rodado.</p>
                            <button onClick={handleCreateStore} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg mt-4 transition">Criar Loja</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editingStore && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
                    <div className="bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-md border border-gray-700">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-white">Editar: {editingStore.name}</h2>
                            <button onClick={() => setEditingStore(null)} className="text-gray-400 hover:text-white"><XIcon /></button>
                        </div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Plano</label>
                                    <select value={editForm.plan} onChange={e => setEditForm({ ...editForm, plan: e.target.value as Plano })} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white">
                                        <option value="basico">Básico</option>
                                        <option value="avancado">Avançado</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Valor (R$)</label>
                                    <input type="number" value={editForm.plan_value} onChange={e => setEditForm({ ...editForm, plan_value: parseFloat(e.target.value) || 0 })} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Data de Vencimento</label>
                                <input type="date" value={editForm.subscription_end_date} onChange={e => setEditForm({ ...editForm, subscription_end_date: e.target.value })} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Categoria</label>
                                    <select value={editForm.categoria} onChange={e => setEditForm({ ...editForm, categoria: e.target.value })} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white">
                                        <option value="">Sem categoria</option>
                                        {CATEGORIAS_LOJA.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Cidade</label>
                                    <input type="text" value={editForm.cidade} onChange={e => setEditForm({ ...editForm, cidade: e.target.value })} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white" />
                                </div>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                                <input type="checkbox" checked={editForm.aparecer_no_shopping} onChange={e => setEditForm({ ...editForm, aparecer_no_shopping: e.target.checked })} className="h-4 w-4" />
                                Aparecer no shopping (Pede Aqui)
                            </label>
                            <div className="flex items-center space-x-3 bg-gray-700 p-3 rounded-lg">
                                <input type="checkbox" id="isActive" checked={editForm.is_active} onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })} className="h-5 w-5 rounded text-blue-500 bg-gray-600 border-gray-500 focus:ring-blue-500" />
                                <label htmlFor="isActive" className="text-white font-medium cursor-pointer">Loja Ativa</label>
                            </div>
                            <button onClick={handleUpdateStore} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg mt-2 transition">Salvar Alterações</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SuperAdminPage;
