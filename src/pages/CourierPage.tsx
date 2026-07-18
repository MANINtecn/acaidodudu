import React, { useEffect, useState } from 'react';
import { useCourier } from '../contexts/CourierContext';
import { useStore } from '../contexts/StoreContext';
import { fetchReadyOrdersForCourier, fetchCourierActiveDeliveries, assignOrderToCourier, updateOrderDeliveryStatus, supabase } from '../services/supabaseService';
import { Order } from '../types';
import { Bike, MapPin, Package, ArrowRight, RefreshCw, Phone, Home, CheckCheck, User, LogOut, Calendar, Search, Sun, Moon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const CourierPage: React.FC = () => {
    const { courier, firstName, loading: authLoading, logout } = useCourier();
    const { currentStore } = useStore();
    const navigate = useNavigate();
    
    // Theme Logic
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
            root.classList.remove('light-mode');
        } else {
            root.classList.remove('dark');
            root.classList.add('light-mode');
        }
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    const [readyOrders, setReadyOrders] = useState<Order[]>([]);
    const [myDeliveries, setMyDeliveries] = useState<Order[]>([]);
    const [historyOrders, setHistoryOrders] = useState<Order[]>([]); // New state for history
    const [totalDeliveriesCount, setTotalDeliveriesCount] = useState(0);
    const [historyDate, setHistoryDate] = useState<string>(new Date().toLocaleDateString('en-CA')); // YYYY-MM-DD local
    const [isSearchingHistory, setIsSearchingHistory] = useState(false);

    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'available' | 'mine' | 'profile'>('available'); // Added profile tab

    // Redirect if not logged in
    useEffect(() => {
        if (!authLoading && !courier) {
            navigate(`/${currentStore?.slug || 'acaidodudu'}/entregador/login`);
        }
    }, [authLoading, courier, currentStore, navigate]);

    const loadData = async () => {
        if (!currentStore || !courier) return;
        setLoading(true);
        try {
            // Updated to import fetchCourierHistory inside the component only when needed? 
            // Better to load it here or in a separate effect when tab changes.
            // For simplicity, let's load basic data here.
            
            const [ready, mine] = await Promise.all([
                fetchReadyOrdersForCourier(currentStore.id),
                fetchCourierActiveDeliveries(courier.id)
            ]);
            setReadyOrders(ready);
            setMyDeliveries(mine);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    // Load History & Stats
    useEffect(() => {
        const loadProfileData = async () => {
            if (activeTab === 'profile' && courier) {
                setIsSearchingHistory(true);
                try {
                     const { fetchCourierHistoryByDate, fetchCourierTotalDeliveries } = await import('../services/supabaseService');
                     
                     // Fetch total count (career)
                     const total = await fetchCourierTotalDeliveries(courier.id);
                     setTotalDeliveriesCount(total);

                     // Fetch history for selected date
                     const dateObj = new Date(historyDate + 'T12:00:00'); // Ensure mid-day to avoid timezone shifting on simple date strings
                     const history = await fetchCourierHistoryByDate(courier.id, dateObj);
                     setHistoryOrders(history);
                } catch (e) {
                    console.error("Error loading history", e);
                } finally {
                    setIsSearchingHistory(false);
                }
            }
        };
        loadProfileData();
    }, [activeTab, courier, historyDate]);


    useEffect(() => {
        if (courier) {
            loadData();
            // Auto refresh every 30s
            const interval = setInterval(loadData, 30000);
            return () => clearInterval(interval);
        }
    }, [courier, currentStore]);

    const [confirmModalOpen, setConfirmModalOpen] = useState(false);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [modalAction, setModalAction] = useState<'take' | 'update'>('take');
    const [targetStatus, setTargetStatus] = useState('');

    const handleTakeOrderClick = (orderId: string) => {
        setSelectedOrderId(orderId);
        setModalAction('take');
        setConfirmModalOpen(true);
    };

    const handleStatusUpdateClick = (orderId: string, newStatus: string) => {
        setSelectedOrderId(orderId);
        setModalAction('update');
        setTargetStatus(newStatus);
        setConfirmModalOpen(true);
    };

    const confirmAction = async () => {
        if (!courier || !selectedOrderId) return;
        setConfirmModalOpen(false);
        
        // Find order data for notification
        const orderToNotify = modalAction === 'take' 
            ? readyOrders.find(o => o.id === selectedOrderId)
            : myDeliveries.find(o => o.id === selectedOrderId);

        try {
            if (modalAction === 'take') {
                await assignOrderToCourier(selectedOrderId, courier.id, courier.name);
                setActiveTab('mine');
            } else {
                await updateOrderDeliveryStatus(selectedOrderId, targetStatus);
            }
            loadData();
        } catch (error) {
            console.error(error);
            alert('Erro ao processar ação.');
        } finally {
            setSelectedOrderId(null);
        }
    };

    if (authLoading) return <div className="p-10 flex justify-center"><div className="animate-spin w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full"></div></div>;
    if (!courier) return null;

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 font-sans pb-20">
            {/* Header */}
            <div className="bg-orange-600 text-white p-6 rounded-b-3xl shadow-lg relative overflow-hidden transition-all duration-300">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Bike size={120} />
                </div>
                <div className="relative z-10 flex justify-between items-center">
                    <div>
                        <p className="text-orange-200 text-sm mb-1">Olá, parceiro</p>
                        <h1 className="text-3xl font-bold">{firstName}</h1>
                    </div>
                    
                    {/* Replaced Logout with Profile Icon & Theme Toggle */}
                    <div className="flex gap-2">
                         <button 
                            onClick={toggleTheme} 
                            className="p-2 rounded-full bg-orange-700/50 text-white hover:bg-orange-700 transition-all"
                            title={theme === 'light' ? 'Mudar para Escuro' : 'Mudar para Claro'}
                        >
                            {theme === 'light' ? <Moon size={24} /> : <Sun size={24} />}
                        </button>
                        <button 
                            onClick={() => setActiveTab('profile')} 
                            className={`p-2 rounded-full transition-all ${activeTab === 'profile' ? 'bg-white text-orange-600' : 'bg-orange-700/50 text-white hover:bg-orange-700'}`}
                        >
                            <User size={24} />
                        </button>
                    </div>
                </div>
                
                {/* Stats / Tabs */}
                {activeTab !== 'profile' && (
                    <div className="flex mt-8 gap-2 animate-fade-in">
                        <button 
                            onClick={() => setActiveTab('available')}
                            className={`flex-1 p-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                                activeTab === 'available' 
                                ? 'bg-white text-orange-600 shadow-md transform scale-105 font-bold' 
                                : 'bg-orange-700/30 text-orange-100 hover:bg-orange-700/50'
                            }`}
                        >
                            <span className="text-2xl">{readyOrders.length}</span>
                            <span className="text-[10px] uppercase tracking-wide">Disponíveis</span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('mine')}
                            className={`flex-1 p-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${
                                activeTab === 'mine' 
                                ? 'bg-white text-orange-600 shadow-md transform scale-105 font-bold' 
                                : 'bg-orange-700/30 text-orange-100 hover:bg-orange-700/50'
                            }`}
                        >
                            <span className="text-2xl">{myDeliveries.length}</span>
                            <span className="text-[10px] uppercase tracking-wide">Minhas Entregas</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Refresh Button - Only for main lists */}
            {activeTab !== 'profile' && (
                <div className="px-4 py-4 flex justify-end">
                    <button onClick={loadData} disabled={loading} className="flex items-center gap-1 text-gray-500 text-xs font-bold uppercase hover:text-orange-500 transition-colors disabled:opacity-50">
                        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Atualizar
                    </button>
                </div>
            )}

            {/* Main Content Area */}
            <div className="px-4 space-y-4 pt-4">
                
                {/* AVAILABLE ORDERS TAB */}
                {activeTab === 'available' && (
                    <>
                        {readyOrders.length === 0 ? (
                            <div className="text-center py-20 text-gray-400">
                                <Package size={48} className="mx-auto mb-2 opacity-20" />
                                <p>Nenhum pedido aguardando retirada</p>
                            </div>
                        ) : (
                            readyOrders.map(order => (
                                <div key={order.id} className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 animate-fade-in relative overflow-hidden group">
                                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-green-500"></div>
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider mb-2 inline-block">
                                                Pedido #{order.dailyOrderNumber}
                                            </span>
                                            <h3 className="font-bold text-gray-800 dark:text-gray-100 text-lg leading-tight">{order.customerName}</h3>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs text-gray-400 font-mono">{new Date(order.timestamp || '').toLocaleTimeString().slice(0,5)}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-2 mb-4">
                                        <div className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                                            <MapPin size={16} className="mt-0.5 text-orange-500 shrink-0" />
                                            <p className="text-sm leading-tight">{order.address}</p>
                                        </div>
                                        {order.referencePoint && (
                                            <p className="text-xs text-gray-400 ml-6 italic">Ref: {order.referencePoint}</p>
                                        )}
                                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300 ml-6">
                                            <Phone size={14} className="text-gray-400" />
                                            <p className="text-xs">{order.phone || 'Sem telefone'}</p>
                                        </div>
                                    </div>

                                    {/* Order Items Summary */}
                                    <div className="pl-6 mb-4 pr-2">
                                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-2">
                                            {order.items?.map((item, idx) => (
                                                <div key={idx} className="text-xs text-gray-700 dark:text-gray-300">
                                                    <div className="font-bold">
                                                        {item.quantity}x {item.name}
                                                    </div>
                                                    {item.selectedAddons?.length > 0 && (
                                                        <div className="text-gray-500 pl-4">
                                                            + {item.selectedAddons.map(a => a.name).join(', ')}
                                                        </div>
                                                    )}
                                                    {item.notes && (
                                                        <div className="text-orange-500 pl-4 italic">
                                                            "{item.notes}"
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                                        <button 
                                            onClick={() => handleTakeOrderClick(order.id!)}
                                            className="w-full py-3 bg-gray-900 dark:bg-black text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-gray-900/20 active:scale-95 transition-all"
                                        >
                                            <Bike size={18} /> Assumir Entrega
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </>
                )}

                {/* MY DELIVERIES TAB */}
                {activeTab === 'mine' && (
                    <>
                        {myDeliveries.length === 0 ? (
                            <div className="text-center py-20 text-gray-400">
                                <Bike size={48} className="mx-auto mb-2 opacity-20" />
                                <p>Você não tem entregas ativas</p>
                            </div>
                        ) : (
                            myDeliveries.map(order => (
                                <div key={order.id} className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-orange-100 dark:border-orange-900/30 animate-fade-in relative overflow-hidden">
                                     <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-orange-500"></div>
                                     <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider mb-2 inline-block">
                                                Em Rota
                                            </span>
                                            <h3 className="font-bold text-gray-800 dark:text-gray-100 text-lg leading-tight">{order.customerName}</h3>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs text-gray-400 font-mono">#{order.dailyOrderNumber}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-2 mb-4">
                                        <div className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                                            <MapPin size={16} className="mt-0.5 text-orange-500 shrink-0" />
                                            <p className="text-sm leading-tight flex-1">{order.address}</p>
                                            <button onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(order.address || '')}`, '_blank')} className="p-1.5 text-blue-500 bg-blue-50 rounded-lg">
                                                <ArrowRight size={14} />
                                            </button>
                                        </div>
                                        {order.referencePoint && (
                                            <p className="text-xs text-gray-400 ml-6 italic">Ref: {order.referencePoint}</p>
                                        )}
                                        {order.phone && (
                                            <div className="flex items-center gap-2 ml-6">
                                                <a href={`tel:${order.phone}`} className="flex items-center gap-1 px-3 py-1 bg-green-50 text-green-600 rounded-lg text-xs font-bold">
                                                    <Phone size={12} /> Ligar
                                                </a>
                                                <a href={`https://wa.me/55${order.phone.replace(/\D/g, '')}`} target="_blank" className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-bold">
                                                    WhatsApp
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Order Items */}
                                    <div className="pl-6 mb-4 pr-2">
                                        <div className="bg-orange-50 dark:bg-orange-900/10 rounded-lg p-3 space-y-2 border border-orange-100 dark:border-orange-900/20">
                                            {order.items?.map((item, idx) => (
                                                <div key={idx} className="text-xs text-gray-800 dark:text-gray-200">
                                                    <div className="font-bold">
                                                        {item.quantity}x {item.name}
                                                    </div>
                                                    {item.selectedAddons?.length > 0 && (
                                                        <div className="text-gray-500 dark:text-gray-400 pl-4">
                                                            + {item.selectedAddons.map(a => a.name).join(', ')}
                                                        </div>
                                                    )}
                                                    {item.notes && (
                                                        <div className="text-orange-600 dark:text-orange-400 pl-4 italic">
                                                            "{item.notes}"
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            {order.observation && (
                                                <div className="pt-2 border-t border-orange-200/50 dark:border-orange-800/30 text-xs text-gray-600 dark:text-gray-400 italic">
                                                    <span className="font-bold">Obs Geral:</span> {order.observation}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="bg-orange-50 dark:bg-orange-900/10 p-3 rounded-xl border border-orange-100 dark:border-orange-900/20 text-orange-800 dark:text-orange-200 text-xs font-medium text-center">
                                        Finalize a entrega e receba o pagamento
                                        <div className="font-bold text-lg mt-1">
                                            R$ {order.total.toFixed(2)}
                                            <span className="text-[10px] font-normal opacity-70 ml-1">({order.paymentMethod})</span>
                                        </div>
                                        {order.changeFor && <div className="text-[10px]">Troco para: {order.changeFor}</div>}
                                    </div>
                                    
                                    <div className="mt-3 flex gap-2">
                                        {/* Status: A Caminho -> Show both 'No Portão' and 'Entregue' */}
                                        {order.status === 'A Caminho' && (
                                            <>
                                                <button 
                                                    onClick={() => handleStatusUpdateClick(order.id!, 'No Portão')}
                                                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
                                                >
                                                    <Home size={18} /> Portão
                                                </button>
                                                <button 
                                                    onClick={() => handleStatusUpdateClick(order.id!, 'Entregue')}
                                                    className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-green-500/20 active:scale-95 transition-all"
                                                >
                                                    <CheckCheck size={18} /> Entregue
                                                </button>
                                            </>
                                        )}

                                        {/* Status: No Portão -> Show only 'Entregue' */}
                                        {order.status === 'No Portão' && (
                                            <button 
                                                onClick={() => handleStatusUpdateClick(order.id!, 'Entregue')}
                                                className="w-full py-3 bg-green-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-green-500/20 active:scale-95 transition-all"
                                            >
                                                <CheckCheck size={18} /> Finalizar Entrega
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </>
                )}

                 {/* PROFILE TAB */}
                 {activeTab === 'profile' && (
                    <div className="animate-fade-in space-y-6">
                        
                        {/* Profile Info Card with Total Stats */}
                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 text-center relative overflow-hidden">
                            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-orange-400 to-orange-600"></div>
                            <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full mx-auto mb-4 flex items-center justify-center text-gray-400">
                                <User size={40} />
                            </div>
                            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">{courier.name}</h2>
                            <p className="text-gray-500 text-sm mb-4">{courier.phone}</p>
                            
                            <div className="grid grid-cols-1 gap-2">
                                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                                    <div className="text-3xl font-black text-orange-600">{totalDeliveriesCount}</div>
                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total de Entregas</div>
                                </div>
                            </div>
                        </div>

                        {/* History Search & List */}
                        <div>
                             <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest ml-1">
                                    {historyDate === new Date().toISOString().split('T')[0] ? 'Histórico de Hoje' : `Histórico: ${new Date(historyDate + 'T12:00:00').toLocaleDateString('pt-BR')}`}
                                </h3>
                             </div>

                             {/* Date Picker */}
                             <div className="bg-white dark:bg-gray-800 p-2 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm mb-4 flex gap-2">
                                <div className="relative flex-1">
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                        <Calendar size={16} />
                                    </div>
                                    <input 
                                        type="date" 
                                        value={historyDate}
                                        onChange={(e) => setHistoryDate(e.target.value)}
                                        className="w-full bg-transparent pl-10 pr-4 py-2 text-sm font-bold text-gray-700 dark:text-gray-200 outline-none"
                                    />
                                </div>
                                <div className="flex items-center justify-center px-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-gray-400">
                                    <Search size={16} />
                                </div>
                             </div>

                             {/* List */}
                             <div className="space-y-3">
                                {isSearchingHistory ? (
                                    <div className="py-10 text-center text-gray-400 animate-pulse">
                                        Carregando...
                                    </div>
                                ) : historyOrders.length === 0 ? (
                                     <div className="text-center py-10 text-gray-400 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
                                         Nenhuma entrega nesta data
                                     </div>
                                ) : (
                                    historyOrders.map(order => (
                                        <div key={order.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 flex justify-between items-center opacity-75 grayscale hover:grayscale-0 transition-all">
                                            <div>
                                                <p className="font-bold text-gray-800 dark:text-gray-200 text-sm">{order.customerName}</p>
                                                <p className="text-xs text-gray-500">{new Date(order.timestamp || '').toLocaleTimeString().slice(0,5)} • #{order.dailyOrderNumber}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-green-600 text-sm">R$ {order.total.toFixed(2)}</p>
                                                <p className="text-[10px] text-gray-400 uppercase">Entregue</p>
                                            </div>
                                        </div>
                                    ))
                                )}
                             </div>
                        </div>

                        {/* Back Buttons */}
                        <div className="pt-8 space-y-3">
                            <button onClick={() => setActiveTab('available')} className="w-full py-4 text-gray-500 text-xs font-bold uppercase tracking-widest hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-colors">
                                Voltar ao Início
                            </button>
                            <button onClick={logout} className="w-full py-4 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2">
                                <LogOut size={16} /> Sair da Conta
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Confirmation Modal */}
            {confirmModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-bounce-in">
                        <div className={`p-4 flex justify-center text-white ${modalAction === 'take' ? 'bg-orange-600' : 'bg-blue-600'}`}>
                            {modalAction === 'take' ? <Bike size={40} /> : <Home size={40} />}
                        </div>
                        <div className="p-6 text-center">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                                {modalAction === 'take' ? 'Confirmar Entrega?' : 'Atualizar Status?'}
                            </h3>
                            <p className="text-gray-600 dark:text-gray-300 mb-6">
                                {modalAction === 'take' 
                                    ? 'Você está assumindo a responsabilidade por este pedido. Deseja iniciar a entrega agora?' 
                                    : `Deseja marcar este pedido como "${targetStatus}"?`
                                }
                            </p>
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => setConfirmModalOpen(false)}
                                    className="flex-1 py-3 text-gray-700 dark:text-gray-300 font-bold hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    onClick={confirmAction}
                                    className={`flex-1 py-3 text-white font-bold rounded-xl shadow-lg transition-colors ${modalAction === 'take' ? 'bg-orange-600 shadow-orange-500/30 hover:bg-orange-700' : 'bg-blue-600 shadow-blue-500/30 hover:bg-blue-700'}`}
                                >
                                    Confirmar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CourierPage;
