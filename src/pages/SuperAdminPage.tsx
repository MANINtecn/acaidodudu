
import React, { useState, useEffect } from 'react';
import { fetchAllStores, createStore, updateStoreSubscription, getGlobalStats } from '../services/supabaseService';
import { Store } from '../types';

// Icons (Simple SVG placeholders)
const PlusIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>;
const EditIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>;

const XIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>;

const SuperAdminPage: React.FC = () => {
    // const navigate = useNavigate();
    const [stores, setStores] = useState<Store[]>([]);
    const [stats, setStats] = useState({ totalStores: 0, activeStores: 0, mrr: 0 });
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingStore, setEditingStore] = useState<Store | null>(null);

    // Form States
    const [newStore, setNewStore] = useState({ name: '', slug: '', owner_email: '', plan_value: 0 });
    const [editForm, setEditForm] = useState({ plan_value: 0, subscription_end_date: '', is_active: true });

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
        try {
            // Calculate default expiration (30 days from now)
            const expirationDate = new Date();
            expirationDate.setDate(expirationDate.getDate() + 30);

            await createStore({
                ...newStore,
                subscription_end_date: expirationDate.toISOString(),
                is_active: true
            });
            alert("Loja criada com sucesso!");
            setShowCreateModal(false);
            setNewStore({ name: '', slug: '', owner_email: '', plan_value: 0 });
            loadData();
        } catch (error) {
            console.error(error);
            alert("Erro ao criar loja.");
        }
    };

    const handleUpdateStore = async () => {
        if (!editingStore) return;
        try {
            await updateStoreSubscription(editingStore.id, editForm);
            alert("Loja atualizada!");
            setEditingStore(null);
            loadData();
        } catch (error) {
            console.error(error);
            alert("Erro ao atualizar loja.");
        }
    };

    const openEditModal = (store: Store) => {
        setEditingStore(store);
        setEditForm({
            plan_value: store.plan_value || 0,
            subscription_end_date: store.subscription_end_date ? new Date(store.subscription_end_date).toISOString().split('T')[0] : '',
            is_active: store.is_active ?? true
        });
    };

    if (loading) return <div className="flex items-center justify-center h-screen bg-gray-900 text-white">Carregando...</div>;

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-4xl font-bold text-blue-500">Super Admin Dashboard</h1>
                    <button onClick={() => setShowCreateModal(true)} className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-bold transition">
                        <PlusIcon /> <span>Nova Loja</span>
                    </button>
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
                                    <th className="p-4">Slug (URL)</th>
                                    <th className="p-4">Email Dono</th>
                                    <th className="p-4">Valor Plano</th>
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
                                            <td className="p-4 font-bold text-white">{store.name}</td>
                                            <td className="p-4 text-blue-400"><a href={`/${store.slug}`} target="_blank" rel="noreferrer">{store.slug}</a></td>
                                            <td className="p-4 text-gray-300">{store.owner_email || '-'}</td>
                                            <td className="p-4 text-green-400 font-mono">R$ {store.plan_value?.toFixed(2)}</td>
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
                                <input type="text" value={newStore.name} onChange={e => setNewStore({ ...newStore, name: e.target.value })} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500" placeholder="Ex: Açaí do Dudu" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Slug (URL)</label>
                                <input type="text" value={newStore.slug} onChange={e => setNewStore({ ...newStore, slug: e.target.value })} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500" placeholder="Ex: acaidodudu" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Email do Dono</label>
                                <input type="email" value={newStore.owner_email} onChange={e => setNewStore({ ...newStore, owner_email: e.target.value })} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500" placeholder="cliente@email.com" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Valor do Plano (R$)</label>
                                <input type="number" value={newStore.plan_value} onChange={e => setNewStore({ ...newStore, plan_value: parseFloat(e.target.value) })} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500" />
                            </div>
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
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Valor do Plano (R$)</label>
                                <input type="number" value={editForm.plan_value} onChange={e => setEditForm({ ...editForm, plan_value: parseFloat(e.target.value) })} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Data de Vencimento</label>
                                <input type="date" value={editForm.subscription_end_date} onChange={e => setEditForm({ ...editForm, subscription_end_date: e.target.value })} className="w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div className="flex items-center space-x-3 bg-gray-700 p-3 rounded-lg">
                                <input type="checkbox" id="isActive" checked={editForm.is_active} onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })} className="h-5 w-5 rounded text-blue-500 bg-gray-600 border-gray-500 focus:ring-blue-500" />
                                <label htmlFor="isActive" className="text-white font-medium cursor-pointer">Loja Ativa</label>
                            </div>
                            <div className="pt-4 border-t border-gray-700">
                                <p className="text-sm text-gray-400 mb-2">Ações de Conta</p>
                                <button onClick={() => alert("Funcionalidade de reset de senha via email será implementada via Supabase Auth API.")} className="w-full bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 rounded-lg text-sm mb-2">
                                    Enviar Email de Redefinição de Senha
                                </button>
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
