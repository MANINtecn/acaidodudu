
import React, { useState, useEffect } from 'react';
import {
    fetchAllStores, criarLojaCompleta, updateStoreSubscription, getGlobalStats, supabase, isPlatformAdmin,
    fetchFinanceiroDeTodas, salvarFinanceiro, fetchPadroesPlataforma, salvarPadroesPlataforma,
} from '../services/supabaseService';
import { useAuth } from '../auth/AuthContext';
import { Store, LojaFinanceiro, PadroesPlataforma } from '../types';
import { tipoDaLoja, ROTULO_DO_TIPO, type TipoDeLoja } from '../services/recursos';

// Icons (Simple SVG placeholders)
const PlusIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>;
const EditIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>;

const XIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>;

/** Valor mensal sugerido de cada PDV (editável na criação). A loja de comissão não tem mensalidade. */
const VALOR_PADRAO: Record<'pdv_basico' | 'pdv_avancado', number> = { pdv_basico: 199, pdv_avancado: 499 };
const CATEGORIAS_LOJA = ['Lanchonete', 'Sorveteria / Açaí', 'Pizzaria', 'Restaurante', 'Padaria', 'Agropecuária', 'Outros'];
// Endereços que já são rotas do app: não podem virar link de loja.
const SLUGS_RESERVADOS = ['admin', 'login', 'super-admin', 'staff', 'acesso', 'hub-equipe', 'portal-equipe', 'garcom', 'waiter', 'entregador', 'tv', 'cadastro', 'shopping', 'redefinir_senha', 'assets', 'public'];

/** Condições financeiras em edição (números simples para os campos do formulário). */
interface FormFinanceiro {
    comissao_pct_propria: number;
    comissao_pct_app: number;
    comissao_fixa: number;
    repassa_taxa_pagamento: boolean;
    limite_debito: number;
    debito_dinheiro: number;
}
const FIN_PADRAO: FormFinanceiro = { comissao_pct_propria: 8, comissao_pct_app: 20, comissao_fixa: 0.99, repassa_taxa_pagamento: true, limite_debito: 100, debito_dinheiro: 0 };

const limparSlug = (texto: string) =>
    texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');

const brl = (v: number) => `R$ ${(Number(v) || 0).toFixed(2).replace('.', ',')}`;
const pct = (v: number) => `${String(Number(v) || 0).replace('.', ',')}%`;

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

/** Campos das condições financeiras da loja de comissão (usados na criação, na edição e nos padrões da plataforma). */
const CamposFinanceiros: React.FC<{ v: FormFinanceiro; onChange: (v: FormFinanceiro) => void; comDebito?: boolean }> = ({ v, onChange, comDebito }) => {
    const campo = 'w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500';
    const num = (k: keyof FormFinanceiro) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...v, [k]: parseFloat(e.target.value) || 0 });
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Comissão, entrega do lojista (%)</label>
                    <input type="number" step="0.5" min="0" max="100" value={v.comissao_pct_propria} onChange={num('comissao_pct_propria')} className={campo} />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Comissão, entrega do app (%)</label>
                    <input type="number" step="0.5" min="0" max="100" value={v.comissao_pct_app} onChange={num('comissao_pct_app')} className={campo} />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Parte fixa por pedido (R$)</label>
                    <input type="number" step="0.01" min="0" value={v.comissao_fixa} onChange={num('comissao_fixa')} className={campo} />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Limite de débito do dinheiro (R$)</label>
                    <input type="number" step="1" min="0" value={v.limite_debito} onChange={num('limite_debito')} className={campo} />
                </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={v.repassa_taxa_pagamento} onChange={e => onChange({ ...v, repassa_taxa_pagamento: e.target.checked })} className="h-4 w-4" />
                Repassar ao lojista a taxa do pagamento online (cartão e PIX)
            </label>
            {comDebito && (
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Débito atual do dinheiro (R$): ajuste manual depois que o lojista pagar</label>
                    <input type="number" step="0.01" min="0" value={v.debito_dinheiro} onChange={num('debito_dinheiro')} className={campo} />
                </div>
            )}
            <p className="text-xs text-gray-500">Pedidos pagos em dinheiro viram débito de comissão. Quando o débito chega ao limite, a opção Dinheiro some do checkout daquela loja.</p>
        </div>
    );
};

const PainelSuperAdmin: React.FC = () => {
    const [stores, setStores] = useState<Store[]>([]);
    const [financeiros, setFinanceiros] = useState<Record<string, LojaFinanceiro>>({});
    const [padroes, setPadroes] = useState<PadroesPlataforma | null | undefined>(undefined);
    const [stats, setStats] = useState({ totalStores: 0, activeStores: 0, lojasDeComissao: 0, mrr: 0 });
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingStore, setEditingStore] = useState<Store | null>(null);
    const [criada, setCriada] = useState<{ nome: string; slug: string; email: string } | null>(null);
    const [mostrarPadroes, setMostrarPadroes] = useState(false);
    const [formPadroes, setFormPadroes] = useState<FormFinanceiro>(FIN_PADRAO);

    // Form States
    const novoFormulario = (fin: FormFinanceiro = FIN_PADRAO) => ({
        name: '', slug: '', owner_email: '', tipo: 'comissao' as TipoDeLoja, plan_value: VALOR_PADRAO.pdv_basico,
        categoria: '', cidade: '', aparecer_no_shopping: false, fin,
    });
    const [newStore, setNewStore] = useState(novoFormulario());
    const [editForm, setEditForm] = useState<{ tipo: TipoDeLoja; plan_value: number; subscription_end_date: string; is_active: boolean; categoria: string; cidade: string; aparecer_no_shopping: boolean; aceita_dinheiro: boolean; fin: FormFinanceiro }>({
        tipo: 'pdv_avancado', plan_value: 0, subscription_end_date: '', is_active: true, categoria: '', cidade: '', aparecer_no_shopping: false, aceita_dinheiro: true, fin: FIN_PADRAO,
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [storesData, statsData, fins, pad] = await Promise.all([
                fetchAllStores(),
                getGlobalStats(),
                fetchFinanceiroDeTodas(),
                fetchPadroesPlataforma(),
            ]);
            setStores(storesData);
            setStats(statsData);
            setFinanceiros(Object.fromEntries(fins.map(f => [f.store_id, f])));
            setPadroes(pad);
            if (pad) setFormPadroes({ ...FIN_PADRAO, ...pad });
        } catch (error) {
            console.error("Error loading super admin data:", error);
            alert("Erro ao carregar dados.");
        } finally {
            setLoading(false);
        }
    };

    const finPadroes = (): FormFinanceiro => ({ ...FIN_PADRAO, ...(padroes || {}) });

    const handleCreateStore = async () => {
        const slug = limparSlug(newStore.slug || newStore.name);
        const email = newStore.owner_email.trim().toLowerCase();
        if (!newStore.name.trim()) return alert('Informe o nome da loja.');
        if (!slug) return alert('Informe um link (slug) válido.');
        if (SLUGS_RESERVADOS.includes(slug)) return alert(`"${slug}" é um endereço reservado do sistema. Escolha outro.`);
        if (stores.some(s => s.slug === slug)) return alert(`Já existe uma loja com o link "${slug}".`);
        if (!email) return alert('Informe o e-mail do dono: é ele que dá acesso ao painel da loja.');
        const comissao = newStore.tipo === 'comissao';
        if (comissao && padroes === null) return alert('As condições de comissão ainda não existem no banco. Rode o SQL 4 no Supabase antes de criar lojas.');
        try {
            // PDV: 30 dias de teste. Comissão não tem mensalidade nem vencimento.
            const expirationDate = new Date();
            expirationDate.setDate(expirationDate.getDate() + 30);
            const { debito_dinheiro: _d, ...condicoes } = newStore.fin;

            await criarLojaCompleta({
                name: newStore.name.trim(),
                slug,
                owner_email: email,
                modelo: comissao ? 'comissao' : 'pdv',
                plan: comissao ? null : (newStore.tipo === 'pdv_basico' ? 'basico' : 'avancado'),
                plan_value: comissao ? 0 : (newStore.plan_value || 0),
                is_active: true,
                ...(comissao ? {} : { subscription_end_date: expirationDate.toISOString() }),
                // Campos do shopping só vão se preenchidos.
                ...(newStore.categoria ? { categoria: newStore.categoria } : {}),
                ...(newStore.cidade.trim() ? { cidade: newStore.cidade.trim() } : {}),
                ...(newStore.aparecer_no_shopping ? { aparecer_no_shopping: true } : {}),
            }, comissao ? condicoes : undefined);
            setShowCreateModal(false);
            setCriada({ nome: newStore.name.trim(), slug, email });
            setNewStore(novoFormulario(finPadroes()));
            loadData();
        } catch (error: any) {
            console.error(error);
            alert(`Erro ao criar loja: ${error?.message || error}`);
        }
    };

    const handleUpdateStore = async () => {
        if (!editingStore) return;
        const comissao = editForm.tipo === 'comissao';
        try {
            await updateStoreSubscription(editingStore.id, {
                modelo: comissao ? 'comissao' : 'pdv',
                plan: comissao ? null : (editForm.tipo === 'pdv_basico' ? 'basico' : 'avancado'),
                plan_value: comissao ? 0 : editForm.plan_value,
                is_active: editForm.is_active,
                categoria: editForm.categoria || null,
                cidade: editForm.cidade.trim() || null,
                aparecer_no_shopping: editForm.aparecer_no_shopping,
                aceita_dinheiro: comissao ? editForm.aceita_dinheiro : true,
                subscription_end_date: comissao ? null : (editForm.subscription_end_date ? new Date(editForm.subscription_end_date + 'T23:59:59').toISOString() : null),
            });
            if (comissao) await salvarFinanceiro(editingStore.id, editForm.fin);
            alert("Loja atualizada!");
            setEditingStore(null);
            loadData();
        } catch (error: any) {
            console.error(error);
            alert(`Erro ao atualizar loja: ${error?.message || error}`);
        }
    };

    const handleSalvarPadroes = async () => {
        try {
            const { debito_dinheiro: _d, ...p } = formPadroes;
            await salvarPadroesPlataforma(p);
            setPadroes(p);
            alert('Padrões salvos. Valem para as lojas novas; as que já existem mantêm as condições delas.');
        } catch (error: any) {
            alert(`Erro ao salvar os padrões: ${error?.message || error}`);
        }
    };

    const openEditModal = (store: Store) => {
        const tipo = tipoDaLoja(store);
        setEditingStore(store);
        setEditForm({
            tipo,
            plan_value: store.plan_value || 0,
            subscription_end_date: store.subscription_end_date ? new Date(store.subscription_end_date).toISOString().split('T')[0] : '',
            is_active: store.is_active ?? true,
            categoria: store.categoria || '',
            cidade: store.cidade || '',
            aparecer_no_shopping: store.aparecer_no_shopping ?? false,
            aceita_dinheiro: store.aceita_dinheiro ?? true,
            fin: { ...finPadroes(), ...(financeiros[store.id] ? { ...financeiros[store.id] } : {}) } as FormFinanceiro,
        });
    };

    const linkDaLoja = (slug: string) => `${window.location.origin}/${slug}`;
    const campoBase = 'w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500';
    const seletorDeTipo = (valor: TipoDeLoja, aoMudar: (t: TipoDeLoja) => void) => (
        <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Modelo da loja</label>
            <select value={valor} onChange={e => aoMudar(e.target.value as TipoDeLoja)} className={campoBase}>
                <option value="comissao">Comissão (Pede Aqui, sem mensalidade)</option>
                <option value="pdv_basico">PDV Básico (mensalidade)</option>
                <option value="pdv_avancado">PDV Avançado (mensalidade)</option>
            </select>
        </div>
    );

    if (loading) return <Carregando />;

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-4xl font-bold text-blue-500">Super Admin Dashboard</h1>
                    <div className="flex items-center gap-3">
                        <button onClick={() => supabase.auth.signOut()} className="text-gray-400 hover:text-white text-sm font-bold">Sair</button>
                        <button onClick={() => { setNewStore(novoFormulario(finPadroes())); setShowCreateModal(true); }} className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-bold transition">
                            <PlusIcon /> <span>Nova Loja</span>
                        </button>
                    </div>
                </div>

                {padroes === null && (
                    <div className="mb-6 rounded-lg bg-yellow-900/40 border border-yellow-700 text-yellow-200 px-4 py-3 text-sm">
                        As tabelas de condições de comissão ainda não existem no banco. Rode o SQL 4 no Supabase. Enquanto isso só dá para criar lojas de PDV.
                    </div>
                )}

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
                        <h3 className="text-gray-400 text-sm font-bold uppercase">Total de Lojas</h3>
                        <p className="text-4xl font-bold text-white mt-2">{stats.totalStores}</p>
                    </div>
                    <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
                        <h3 className="text-gray-400 text-sm font-bold uppercase">Lojas Ativas</h3>
                        <p className="text-4xl font-bold text-green-400 mt-2">{stats.activeStores}</p>
                    </div>
                    <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
                        <h3 className="text-gray-400 text-sm font-bold uppercase">Lojas de Comissão</h3>
                        <p className="text-4xl font-bold text-orange-400 mt-2">{stats.lojasDeComissao}</p>
                    </div>
                    <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
                        <h3 className="text-gray-400 text-sm font-bold uppercase">Mensalidades (PDV)</h3>
                        <p className="text-4xl font-bold text-blue-400 mt-2">R$ {stats.mrr.toFixed(2)}</p>
                    </div>
                </div>

                {/* Padrões da plataforma */}
                <div className="mb-8 bg-gray-800 rounded-xl border border-gray-700">
                    <button onClick={() => setMostrarPadroes(v => !v)} className="w-full text-left px-6 py-4 font-bold text-gray-200 flex justify-between items-center">
                        <span>Padrões das lojas de comissão</span>
                        <span className="text-sm text-gray-400">{mostrarPadroes ? 'Fechar' : `${pct(formPadroes.comissao_pct_propria)} / ${pct(formPadroes.comissao_pct_app)} + ${brl(formPadroes.comissao_fixa)}`}</span>
                    </button>
                    {mostrarPadroes && (
                        <div className="px-6 pb-6 space-y-4">
                            <CamposFinanceiros v={formPadroes} onChange={setFormPadroes} />
                            <button onClick={handleSalvarPadroes} disabled={padroes === null} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 px-5 rounded-lg">Salvar padrões</button>
                        </div>
                    )}
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
                                    <th className="p-4">Modelo</th>
                                    <th className="p-4">Condições</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {stores.map(store => {
                                    const tipo = tipoDaLoja(store);
                                    const comissao = tipo === 'comissao';
                                    const fin = financeiros[store.id];
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
                                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${comissao ? 'bg-orange-900 text-orange-200' : 'bg-blue-900 text-blue-200'}`}>{ROTULO_DO_TIPO[tipo]}</span>
                                                {!comissao && <span className="block text-green-400 font-mono text-xs mt-1">{brl(store.plan_value || 0)}/mês</span>}
                                            </td>
                                            <td className="p-4 text-xs">
                                                {comissao ? (
                                                    fin ? (
                                                        <span className="text-gray-300">
                                                            {pct(fin.comissao_pct_propria)} / {pct(fin.comissao_pct_app)} + {brl(fin.comissao_fixa)}
                                                            <span className={`block ${fin.debito_dinheiro >= fin.limite_debito && fin.limite_debito > 0 ? 'text-red-400 font-bold' : 'text-gray-400'}`}>
                                                                débito {brl(fin.debito_dinheiro)} de {brl(fin.limite_debito)}{store.aceita_dinheiro === false ? ' (dinheiro bloqueado)' : ''}
                                                            </span>
                                                        </span>
                                                    ) : <span className="text-yellow-400">sem condições cadastradas</span>
                                                ) : (
                                                    <span className={`px-2 py-1 rounded font-bold ${daysRemaining < 7 ? 'bg-red-900 text-red-200' : 'bg-gray-700 text-gray-300'}`}>
                                                        {store.subscription_end_date ? new Date(store.subscription_end_date).toLocaleDateString() : '-'}
                                                        {store.subscription_end_date && ` (${daysRemaining} dias)`}
                                                    </span>
                                                )}
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
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50 overflow-y-auto">
                    <div className="bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-md border border-gray-700 my-8">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-white">Nova Loja</h2>
                            <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-white"><XIcon /></button>
                        </div>
                        <div className="space-y-4">
                            {seletorDeTipo(newStore.tipo, t => setNewStore({ ...newStore, tipo: t, plan_value: t === 'comissao' ? 0 : VALOR_PADRAO[t] }))}
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Nome da Loja</label>
                                <input type="text" value={newStore.name} onChange={e => setNewStore({ ...newStore, name: e.target.value })} className={campoBase} placeholder="Ex: Lanchonete do João" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Link (slug)</label>
                                <input type="text" value={newStore.slug} onChange={e => setNewStore({ ...newStore, slug: e.target.value })} className={campoBase} placeholder={limparSlug(newStore.name) || 'lanchonetedojoao'} />
                                <p className="text-xs text-gray-500 mt-1">{window.location.origin}/{limparSlug(newStore.slug || newStore.name) || '...'}</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Email do Dono</label>
                                <input type="email" value={newStore.owner_email} onChange={e => setNewStore({ ...newStore, owner_email: e.target.value })} className={campoBase} placeholder="cliente@email.com" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Categoria</label>
                                    <select value={newStore.categoria} onChange={e => setNewStore({ ...newStore, categoria: e.target.value })} className={campoBase}>
                                        <option value="">Selecione</option>
                                        {CATEGORIAS_LOJA.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Cidade</label>
                                    <input type="text" value={newStore.cidade} onChange={e => setNewStore({ ...newStore, cidade: e.target.value })} className={campoBase} placeholder="Palmas" />
                                </div>
                            </div>
                            {newStore.tipo === 'comissao' ? (
                                <div className="rounded-lg border border-gray-700 p-3">
                                    <p className="text-sm font-bold text-orange-300 mb-3">Condições de comissão (começam nos padrões)</p>
                                    <CamposFinanceiros v={newStore.fin} onChange={fin => setNewStore({ ...newStore, fin })} />
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Valor da mensalidade (R$)</label>
                                    <input type="number" value={newStore.plan_value} onChange={e => setNewStore({ ...newStore, plan_value: parseFloat(e.target.value) || 0 })} className={campoBase} />
                                    <p className="text-xs text-gray-500 mt-1">Começa ativa, com 30 dias de teste.</p>
                                </div>
                            )}
                            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                                <input type="checkbox" checked={newStore.aparecer_no_shopping} onChange={e => setNewStore({ ...newStore, aparecer_no_shopping: e.target.checked })} className="h-4 w-4" />
                                Aparecer no shopping (marque quando o cardápio estiver pronto)
                            </label>
                            <button onClick={handleCreateStore} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg mt-4 transition">Criar Loja</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editingStore && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50 overflow-y-auto">
                    <div className="bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-md border border-gray-700 my-8">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-white">Editar: {editingStore.name}</h2>
                            <button onClick={() => setEditingStore(null)} className="text-gray-400 hover:text-white"><XIcon /></button>
                        </div>
                        <div className="space-y-4">
                            {seletorDeTipo(editForm.tipo, t => setEditForm({ ...editForm, tipo: t, plan_value: t === 'comissao' ? 0 : (editForm.plan_value || VALOR_PADRAO[t]) }))}
                            {editForm.tipo !== tipoDaLoja(editingStore) && (
                                <p className="text-xs text-yellow-300">Mudar o modelo muda na hora o que o lojista enxerga no painel dele.</p>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Categoria</label>
                                    <select value={editForm.categoria} onChange={e => setEditForm({ ...editForm, categoria: e.target.value })} className={campoBase}>
                                        <option value="">Sem categoria</option>
                                        {CATEGORIAS_LOJA.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Cidade</label>
                                    <input type="text" value={editForm.cidade} onChange={e => setEditForm({ ...editForm, cidade: e.target.value })} className={campoBase} />
                                </div>
                            </div>
                            {editForm.tipo === 'comissao' ? (
                                <div className="rounded-lg border border-gray-700 p-3 space-y-3">
                                    <p className="text-sm font-bold text-orange-300">Condições de comissão</p>
                                    <CamposFinanceiros v={editForm.fin} onChange={fin => setEditForm({ ...editForm, fin })} comDebito />
                                    <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                                        <input type="checkbox" checked={editForm.aceita_dinheiro} onChange={e => setEditForm({ ...editForm, aceita_dinheiro: e.target.checked })} className="h-4 w-4" />
                                        Aceitar pagamento em dinheiro (desmarque para bloquear a opção Dinheiro no checkout)
                                    </label>
                                </div>
                            ) : (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Valor da mensalidade (R$)</label>
                                        <input type="number" value={editForm.plan_value} onChange={e => setEditForm({ ...editForm, plan_value: parseFloat(e.target.value) || 0 })} className={campoBase} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Data de Vencimento</label>
                                        <input type="date" value={editForm.subscription_end_date} onChange={e => setEditForm({ ...editForm, subscription_end_date: e.target.value })} className={campoBase} />
                                    </div>
                                </>
                            )}
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
