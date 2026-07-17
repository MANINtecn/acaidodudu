import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../contexts/StoreContext';
import { fetchCouriers, updateCourier, registerCourier, fetchCourierHistoryByRange } from '../services/supabaseService';
import { Courier, Order } from '../types';
import { Plus, Edit, Trash2, History, X, ChevronLeft, Bike } from 'lucide-react';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

interface CouriersTabProps {
    // onClose?: () => void; // Unused
}

export const CouriersTab: React.FC<CouriersTabProps> = () => {
    const { currentStore } = useStore();
    const [couriers, setCouriers] = useState<Courier[]>([]);
    const [viewMode, setViewMode] = useState<'list' | 'history'>('list');
    
    // Form State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCourier, setEditingCourier] = useState<Courier | null>(null);
    const [formData, setFormData] = useState({ name: '', phone: '', password: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // History State
    const [selectedCourier, setSelectedCourier] = useState<Courier | null>(null);
    const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
    const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'custom'>('today');
    const [customStartDate, setCustomStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [customEndDate, setCustomEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [loadingHistory, setLoadingHistory] = useState(false);

    useEffect(() => {
        if (currentStore) loadCouriers();
    }, [currentStore]);

    const loadCouriers = async () => {
        if (!currentStore) return;
        // setLoading(true);
        try {
            const data = await fetchCouriers(currentStore.id);
            setCouriers(data);
        } catch (error) {
            console.error('Error loading couriers:', error);
            alert('Erro ao carregar entregadores');
        } finally {
            // setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentStore) return;
        setIsSubmitting(true);
        try {
            if (editingCourier) {
                await updateCourier(editingCourier.id, formData);
                alert('Entregador atualizado com sucesso!');
            } else {
                await registerCourier(formData.name, formData.phone, formData.password, currentStore.id);
                alert('Entregador cadastrado com sucesso!');
            }
            closeModal();
            loadCouriers();
        } catch (error) {
            console.error(error);
            alert('Erro ao salvar entregador.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleToggleStatus = async (courier: Courier) => {
        if (!confirm(`Deseja ${courier.is_active ? 'desativar' : 'ativar'} este entregador?`)) return;
        try {
            await updateCourier(courier.id, { is_active: !courier.is_active });
            loadCouriers();
        } catch (error) {
            console.error(error);
            alert('Erro ao atualizar status.');
        }
    };

    const openModal = (courier?: Courier) => {
        if (courier) {
            setEditingCourier(courier);
            setFormData({ name: courier.name, phone: courier.phone, password: courier.password || '' });
        } else {
            setEditingCourier(null);
            setFormData({ name: '', phone: '', password: '' });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingCourier(null);
        setFormData({ name: '', phone: '', password: '' });
    };

    // History Logic
    const viewHistory = (courier: Courier) => {
        setSelectedCourier(courier);
        setViewMode('history');
        setDateRange('today');
    };

    useEffect(() => {
        if (viewMode === 'history' && selectedCourier) {
            loadHistory();
        }
    }, [viewMode, selectedCourier, dateRange, customStartDate, customEndDate]);

    const loadHistory = async () => {
        if (!selectedCourier) return;
        setLoadingHistory(true);
        try {
            let start = new Date();
            let end = new Date();

            if (dateRange === 'today') {
                start = startOfDay(new Date());
                end = endOfDay(new Date());
            } else if (dateRange === 'week') {
                start = startOfWeek(new Date(), { weekStartsOn: 0 }); // Sunday
                end = endOfWeek(new Date(), { weekStartsOn: 0 });
            } else if (dateRange === 'month') {
                start = startOfMonth(new Date());
                end = endOfMonth(new Date());
            } else {
                start = startOfDay(new Date(customStartDate));
                end = endOfDay(new Date(customEndDate));
            }

            const orders = await fetchCourierHistoryByRange(selectedCourier.id, start, end);
            setHistoryOrders(orders);
        } catch (error) {
            console.error(error);
            alert('Erro ao carregar histórico.');
        } finally {
            setLoadingHistory(false);
        }
    };

    const stats = useMemo(() => {
        const totalDeliveries = historyOrders.length;
        // Assuming delivery fee is part of order total or separate. 
        // Logic: if order has deliveryFee, sum it. Or just sum total order value.
        // User asked for "entregas vinculadas" context implies maybe paying the courier?
        // Let's sum deliveryFee explicitly if available, else maybe a standard rate?
        // For now, let's show Total Order Value and Total Delivery Fees.
        const totalValue = historyOrders.reduce((acc, order) => acc + (order.total || 0), 0);
        const totalFees = historyOrders.reduce((acc, order) => acc + (order.deliveryFee || 0), 0);
        
        return { totalDeliveries, totalValue, totalFees };
    }, [historyOrders]);

    if (viewMode === 'history' && selectedCourier) {
        return (
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm min-h-[600px] animate-fade-in">
                <div className="flex items-center gap-4 mb-8">
                    <button onClick={() => setViewMode('list')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                        <ChevronLeft size={24} className="text-gray-500" />
                    </button>
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                            <History size={24} className="text-primary" />
                            Histórico: {selectedCourier.name}
                        </h2>
                        <p className="text-gray-500 text-sm">Visualize as entregas e ganhos</p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-4 mb-8">
                    {(['today', 'week', 'month', 'custom'] as const).map(range => (
                        <button
                            key={range}
                            onClick={() => setDateRange(range)}
                            className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors ${dateRange === range ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}
                        >
                            {range === 'today' && 'Hoje'}
                            {range === 'week' && 'Esta Semana'}
                            {range === 'month' && 'Este Mês'}
                            {range === 'custom' && 'Período'}
                        </button>
                    ))}
                </div>

                {dateRange === 'custom' && (
                    <div className="flex gap-4 mb-8 items-center bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl">
                        <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-sm" />
                        <span className="text-gray-400">até</span>
                        <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-sm" />
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-2xl border border-blue-100 dark:border-blue-800">
                        <p className="text-blue-500 dark:text-blue-400 font-bold uppercase text-xs mb-1">Entregas Realizadas</p>
                        <p className="text-3xl font-black text-blue-700 dark:text-blue-300">{stats.totalDeliveries}</p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/20 p-6 rounded-2xl border border-green-100 dark:border-green-800">
                        <p className="text-green-500 dark:text-green-400 font-bold uppercase text-xs mb-1">Total em Taxas</p>
                        <p className="text-3xl font-black text-green-700 dark:text-green-300">R$ {stats.totalFees.toFixed(2)}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700">
                        <p className="text-gray-500 dark:text-gray-400 font-bold uppercase text-xs mb-1">Valor Total Movimentado</p>
                        <p className="text-3xl font-black text-gray-700 dark:text-gray-300">R$ {stats.totalValue.toFixed(2)}</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 uppercase text-xs font-bold">
                            <tr>
                                <th className="p-4">Data/Hora</th>
                                <th className="p-4">Pedido</th>
                                <th className="p-4">Endereço</th>
                                <th className="p-4">Taxa</th>
                                <th className="p-4">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {loadingHistory ? (
                                <tr><td colSpan={5} className="p-8 text-center text-gray-500">Carregando...</td></tr>
                            ) : historyOrders.length === 0 ? (
                                <tr><td colSpan={5} className="p-8 text-center text-gray-500">Nenhuma entrega encontrada neste período.</td></tr>
                            ) : (
                                historyOrders.map(order => (
                                    <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                        <td className="p-4 text-sm text-gray-600 dark:text-gray-300">
                                            {format(new Date(order.timestamp || ''), 'dd/MM/yyyy HH:mm')}
                                        </td>
                                        <td className="p-4 font-bold text-gray-900 dark:text-white">#{order.dailyOrderNumber}</td>
                                        <td className="p-4 text-sm text-gray-600 dark:text-gray-300 max-w-xs truncate">{order.address}</td>
                                        <td className="p-4 font-bold text-green-600 dark:text-green-400">
                                            {order.deliveryFee ? `R$ ${Number(order.deliveryFee).toFixed(2)}` : '-'}
                                        </td>
                                        <td className="p-4 font-bold text-gray-900 dark:text-white">R$ {order.total.toFixed(2)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm min-h-[600px] animate-fade-in">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                        <Bike size={24} className="text-primary" />
                        Gestão de Entregadores
                    </h2>
                    <p className="text-gray-500 text-sm">Gerencie sua frota e visualize o desempenho</p>
                </div>
                <button 
                    onClick={() => openModal()}
                    className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl font-bold hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/20"
                >
                    <Plus size={20} />
                    Novo Entregador
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {couriers.map(courier => (
                    <div key={courier.id} className={`p-6 rounded-2xl border-2 transition-all ${courier.is_active ? 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950' : 'border-red-100 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10 opacity-75'}`}>
                        <div className="flex justify-between items-start mb-4">
                            <div className="bg-orange-100 dark:bg-orange-900/30 p-3 rounded-full text-orange-600 dark:text-orange-400">
                                <Bike size={24} />
                            </div>
                            <span className={`px-2 py-1 rounded text-xs font-black uppercase ${courier.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                {courier.is_active ? 'Ativo' : 'Inativo'}
                            </span>
                        </div>
                        <h3 className="text-lg font-black text-gray-900 dark:text-white mb-1">{courier.name}</h3>
                        <p className="text-gray-500 text-sm font-medium mb-4">{courier.phone}</p>
                        
                        <div className="flex gap-2 pt-4 border-t border-gray-100 dark:border-gray-800">
                            <button onClick={() => viewHistory(courier)} className="flex-1 py-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg text-sm font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2">
                                <History size={16} /> Histórico
                            </button>
                            <button onClick={() => openModal(courier)} className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors">
                                <Edit size={16} />
                            </button>
                            <button onClick={() => handleToggleStatus(courier)} className="p-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl p-6 shadow-2xl border border-gray-200 dark:border-gray-800 animate-scale-in">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase">
                                {editingCourier ? 'Editar Entregador' : 'Novo Entregador'}
                            </h3>
                            <button onClick={closeModal} className="text-gray-400 hover:text-red-500"><X size={24} /></button>
                        </div>
                        <form onSubmit={handleSave} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome Completo</label>
                                <input 
                                    type="text" 
                                    required 
                                    className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-3 outline-none focus:border-primary text-gray-900 dark:text-white"
                                    value={formData.name}
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Telefone (Login)</label>
                                <input 
                                    type="tel" 
                                    required 
                                    className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-3 outline-none focus:border-primary text-gray-900 dark:text-white"
                                    value={formData.phone}
                                    onChange={e => setFormData({...formData, phone: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Senha de Acesso</label>
                                <input 
                                    type="text" 
                                    required 
                                    className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-3 outline-none focus:border-primary text-gray-900 dark:text-white"
                                    value={formData.password}
                                    onChange={e => setFormData({...formData, password: e.target.value})}
                                />
                            </div>
                            <button 
                                type="submit" 
                                disabled={isSubmitting}
                                className="w-full py-4 bg-primary text-white font-black rounded-xl uppercase shadow-lg hover:bg-orange-600 transition-colors mt-4"
                            >
                                {isSubmitting ? 'Salvando...' : 'Salvar Dados'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
