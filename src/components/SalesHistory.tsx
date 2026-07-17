import React, { useState, useEffect } from 'react';
import { Calendar, Search, Trash2, Trophy, Gift, DollarSign, ShoppingBag, TrendingUp, X, Bot, Smartphone, UtensilsCrossed } from 'lucide-react';
import { Order, Settings, Category } from '../types';
import { fetchSalesByDateRange, deleteOrdersByDateRange, fetchEligibleCustomersForRaffle, fetchPublicSettings, fetchMenuForAdmin } from '../services/supabaseService';

interface SalesHistoryProps {
    storeId: string;
    onClose: () => void;
}

const SalesHistory: React.FC<SalesHistoryProps> = ({ storeId, onClose }) => {
    const [startDate, setStartDate] = useState(() => {
        const date = new Date();
        date.setDate(date.getDate() - 7);
        return date.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(false);
    const [settings, setSettings] = useState<Partial<Settings>>({});

    // Raffle State
    const [showRaffleModal, setShowRaffleModal] = useState(false);
    const [eligibleCustomers, setEligibleCustomers] = useState<{ name: string, phone: string }[]>([]);
    const [raffleWinner, setRaffleWinner] = useState<{ name: string, phone: string } | null>(null);
    const [isRaffling, setIsRaffling] = useState(false);

    // New Data State
    const [categories, setCategories] = useState<Category[]>([]);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

    useEffect(() => {
        loadSettings();
        handleSearch();
        loadCategories();
    }, []);

    const loadCategories = async () => {
        try {
            const data = await fetchMenuForAdmin(storeId);
            setCategories(data?.categories || []);
        } catch (error) {
            console.error("Error loading categories:", error);
        }
    };

    const loadSettings = async () => {
        try {
            const s = await fetchPublicSettings(storeId);
            setSettings(s || {});
        } catch (error) {
            console.error("Error loading settings:", error);
        }
    };

    const handleSearch = async () => {
        setLoading(true);
        try {
            const data = await fetchSalesByDateRange(storeId, startDate, endDate);
            setOrders(data || []);
        } catch (error) {
            console.error("Error fetching sales:", error);
            alert("Erro ao buscar vendas.");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteHistory = async () => {
        if (!confirm(`ATENÇÃO: Isso excluirá PERMANENTEMENTE todos os pedidos de ${new Date(startDate).toLocaleDateString()} até ${new Date(endDate).toLocaleDateString()}. Deseja continuar?`)) return;

        try {
            await deleteOrdersByDateRange(storeId, startDate, endDate);
            alert("Histórico excluído com sucesso.");
            setOrders([]);
        } catch (error) {
            console.error("Error deleting history:", error);
            alert("Erro ao excluir histórico.");
        }
    };

    const handlePrepareRaffle = async () => {
        setLoading(true);
        try {
            const customers = await fetchEligibleCustomersForRaffle(storeId, startDate, endDate);
            setEligibleCustomers(customers || []);
            setShowRaffleModal(true);
            setRaffleWinner(null);
        } catch (error) {
            console.error("Error preparing raffle:", error);
            alert("Erro ao preparar sorteio.");
        } finally {
            setLoading(false);
        }
    };

    const executeRaffle = () => {
        if (eligibleCustomers.length === 0) return;
        setIsRaffling(true);

        let counter = 0;
        const interval = setInterval(() => {
            const randomIndex = Math.floor(Math.random() * eligibleCustomers.length);
            setRaffleWinner(eligibleCustomers[randomIndex]);
            counter++;

            if (counter > 20) {
                clearInterval(interval);
                setIsRaffling(false);
            }
        }, 100);
    };

    // Calculations
    const totalSales = orders.reduce((acc, o) => acc + o.total, 0);
    const totalOrders = orders.length;
    const ticketAverage = totalOrders > 0 ? totalSales / totalOrders : 0;

    // Top Products
    const productSales: Record<string, { qty: number, categoryId?: number }> = {};
    orders.forEach(order => {
        if (Array.isArray(order.items)) {
            order.items.forEach(item => {
                if (item && item.name) {
                    if (!productSales[item.name]) {
                        productSales[item.name] = { qty: 0, categoryId: item.categoryId };
                    }
                    productSales[item.name].qty += (item.quantity || 1);
                }
            });
        }
    });

    const getTopByCategoryName = (catNameMatches: string[]) => {
        const catIds = categories.filter(c => catNameMatches.some(m => c.name.toLowerCase().includes(m.toLowerCase()))).map(c => c.id);
        return Object.entries(productSales)
            .filter(([, data]) => data.categoryId && catIds.includes(data.categoryId))
            .sort(([, a], [, b]) => b.qty - a.qty)
            .slice(0, 5)
            .map(([name, data]) => ({ name, qty: data.qty }));
    };

    const topLanchesTradicionais = getTopByCategoryName(['tradicional', 'tradicionais']);
    const topLanchesArtesanais = getTopByCategoryName(['artesanal', 'artesanais']);
    const topPorcoes = getTopByCategoryName(['porç', 'porc']);

    // Fallback original se categorias não configuradas corretamente
    const topProductsOriginal = Object.entries(productSales)
        .sort(([, a], [, b]) => b.qty - a.qty)
        .slice(0, 5)
        .map(([name, data]) => ({ name, qty: data.qty }));

    // Payment Method Ranking
    const paymentStats: Record<string, number> = {};
    orders.forEach(order => {
        if (order.paymentMethod) {
            paymentStats[order.paymentMethod] = (paymentStats[order.paymentMethod] || 0) + 1;
        }
    });
    const rankedPayments = Object.entries(paymentStats)
        .sort(([, a], [, b]) => b - a);

    // Daily Stats for Candlestick Chart
    const dailyStats: Record<string, { total: number, min: number, max: number, count: number }> = {};
    orders.forEach(order => {
        if (order.timestamp) {
            const date = new Date(order.timestamp).toISOString().split('T')[0];
            if (!dailyStats[date]) {
                dailyStats[date] = { total: 0, min: order.total, max: order.total, count: 0 };
            }
            dailyStats[date].total += order.total;
            dailyStats[date].min = Math.min(dailyStats[date].min, order.total);
            dailyStats[date].max = Math.max(dailyStats[date].max, order.total);
            dailyStats[date].count += 1;
        }
    });

    // Origin Stats (App vs Bot)
    const appOrders = orders.filter(o => o.origin === 'APP');
    const botOrders = orders.filter(o => !o.origin || o.origin !== 'APP');

    const totalAppValue = appOrders.reduce((acc, o) => acc + o.total, 0);
    const totalBotValue = botOrders.reduce((acc, o) => acc + o.total, 0);

    // --- Status History Calculations ---
    const calculateAverageTime = (startStatus: string, endStatus: string, filterType?: 'Entrega' | 'Salão') => {
        let totalTime = 0;
        let count = 0;

        orders.forEach(order => {
            if (filterType) {
                const isEntrega = order.orderType === 'Entrega';
                if (filterType === 'Entrega' && !isEntrega) return;
                if (filterType === 'Salão' && isEntrega) return;
            }

            const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
            const startItem = history.find(h => h.status === startStatus);
            
            if (startItem) {
                const startTime = new Date(startItem.timestamp).getTime();
                let endItem = history.find(h => h.status === endStatus && new Date(h.timestamp).getTime() > startTime);
                
                // Fallback for 'Production' -> 'Delivery' transition if specific end status not found but later status exists
                if (startStatus === 'Em Produção' && !endItem) {
                     endItem = history.find(h => ['A Caminho', 'No Portão', 'Entregue'].includes(h.status) && new Date(h.timestamp).getTime() > startTime);
                }

                 // Fallback for 'Novo' -> 'In Production'
                if (startStatus === 'Novo' && !endItem) {
                     endItem = history.find(h => ['Em Produção', 'A Caminho', 'Entregue', 'No Portão'].includes(h.status) && new Date(h.timestamp).getTime() > startTime);
                }

                if (endItem) {
                    const diff = (new Date(endItem.timestamp).getTime() - startTime) / 60000; // minutes
                    if (diff >= 0 && diff < 1000) { // Filter outliers > 16 hours
                        totalTime += diff;
                        count++;
                    }
                }
            }
        });

        return count > 0 ? Math.round(totalTime / count) : 0;
    };

    const avgProductionTime = calculateAverageTime('Em Produção', 'A Caminho'); // Average time IN production (waiting for courier)
    const avgDeliveryTime = calculateAverageTime('A Caminho', 'Entregue'); // Average time delivering
    const avgAcceptTime = calculateAverageTime('Novo', 'Em Produção', 'Entrega'); // Time to accept/start delivery
    const avgSalaoTime = calculateAverageTime('Novo', 'Em Produção', 'Salão'); // Time to produce for Salão


    const chartData = Object.entries(dailyStats).sort((a, b) => a[0].localeCompare(b[0]));
    const maxDayTotal = Math.max(...Object.values(dailyStats).map(d => d.total), 1);
    const maxSingleOrder = Math.max(...Object.values(dailyStats).map(d => d.max), 1);

    return (
        <div className="w-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-3">
                    <TrendingUp className="text-red-600" size={32} />
                    Histórico de Vendas
                </h1>
                <button
                    onClick={onClose}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-bold text-sm shadow-sm"
                >
                    <X size={20} />
                    Voltar para o Painel
                </button>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-8">
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data Inicial</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="date"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                className="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 w-full"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data Final</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="date"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                                className="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 w-full"
                            />
                        </div>
                    </div>
                    <button
                        onClick={handleSearch}
                        disabled={loading}
                        className="px-6 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        <Search size={20} />
                        Pesquisar
                    </button>

                    <div className="flex-1"></div>

                    {settings.isRaffleEnabled && (
                        <button
                            onClick={handlePrepareRaffle}
                            className="px-6 py-2 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 transition-colors flex items-center gap-2 shadow-lg shadow-purple-200 dark:shadow-purple-900/20"
                        >
                            <Gift size={20} />
                            Sorteio da Semana
                        </button>
                    )}

                    <button
                        onClick={handleDeleteHistory}
                        className="px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg font-medium transition-colors flex items-center gap-2 border border-red-200 dark:border-red-900/30"
                    >
                        <Trash2 size={18} />
                        Excluir Período
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-20">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
                    <p className="text-gray-500">Carregando dados...</p>
                </div>
            ) : (
                <div className="space-y-12">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Vendas Totais</p>
                                    <h3 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">R$ {totalSales.toFixed(2)}</h3>
                                </div>
                                <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl text-green-600 dark:text-green-400">
                                    <DollarSign size={24} />
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Total de Pedidos</p>
                                    <h3 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">{totalOrders}</h3>
                                </div>
                                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400">
                                    <ShoppingBag size={24} />
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Ticket Médio</p>
                                    <h3 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">R$ {ticketAverage.toFixed(2)}</h3>
                                </div>
                                <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-xl text-orange-600 dark:text-orange-400">
                                    <TrendingUp size={24} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Time Metrics Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                             <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Tempo Médio de Produção</p>
                                    <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">{avgAcceptTime} min</h3>
                                </div>
                                <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
                                   <Search size={24} />
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                             <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Tempo Médio Aceito pelo Motoboy</p>
                                    <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">{avgProductionTime} min</h3>
                                </div>
                                <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl text-yellow-600 dark:text-yellow-400">
                                   <ShoppingBag size={24} />
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                             <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Tempo Médio da Entrega</p>
                                    <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">{avgDeliveryTime} min</h3>
                                </div>
                                <div className="p-3 bg-teal-100 dark:bg-teal-900/30 rounded-xl text-teal-600 dark:text-teal-400">
                                   <Smartphone size={24} />
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                             <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Tempo Médio Salão</p>
                                    <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">{avgSalaoTime} min</h3>
                                </div>
                                <div className="p-3 bg-rose-100 dark:bg-rose-900/30 rounded-xl text-rose-600 dark:text-rose-400">
                                   <UtensilsCrossed size={24} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Origin Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
                            <div className="flex justify-between items-start relative z-10">
                                <div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 font-bold mb-1 flex items-center gap-2">
                                        <Smartphone size={16} className="text-purple-500" />
                                        Pedidos via App / Balcão
                                    </p>
                                    <h3 className="text-3xl font-bold text-gray-900 dark:text-gray-100">R$ {totalAppValue.toFixed(2)}</h3>
                                    <p className="text-xs text-gray-400 mt-1 font-medium">{appOrders.length} pedidos</p>
                                </div>
                                <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl text-purple-600 dark:text-purple-400">
                                    <Smartphone size={24} />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
                            <div className="flex justify-between items-start relative z-10">
                                <div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 font-bold mb-1 flex items-center gap-2">
                                        <Bot size={16} className="text-green-500" />
                                        Pedidos via Robô IA
                                    </p>
                                    <h3 className="text-3xl font-bold text-gray-900 dark:text-gray-100">R$ {totalBotValue.toFixed(2)}</h3>
                                    <p className="text-xs text-gray-400 mt-1 font-medium">{botOrders.length} pedidos</p>
                                </div>
                                <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl text-green-600 dark:text-green-400">
                                    <Bot size={24} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Charts Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-8 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 relative">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-10">Evolução de Vendas</h3>
                            <div className="h-64 flex items-end gap-3 px-4 relative border-b border-gray-100 dark:border-gray-700">
                                {chartData.map(([date, stats]) => (
                                    <div key={date} className="flex-1 flex flex-col items-center gap-2 group relative h-full justify-end">
                                        {/* Wick (Pavio) - Represents individual order range */}
                                        <div
                                            className="absolute w-0.5 bg-gray-200 dark:bg-gray-700 z-0"
                                            style={{ height: '80%', bottom: '0' }}
                                        >
                                            <div
                                                className="absolute w-2 bg-red-400 dark:bg-red-500 left-1/2 -translate-x-1/2 rounded-full shadow-sm"
                                                style={{
                                                    height: `${((stats.max - stats.min) / maxSingleOrder) * 100 + 5}%`,
                                                    bottom: `${(stats.min / maxSingleOrder) * 90}%`,
                                                    opacity: 0.8
                                                }}
                                            />
                                        </div>

                                        {/* Body (Corpo) - Represents Total Volume */}
                                        <div
                                            className="w-full bg-red-500 dark:bg-red-600 rounded-t-md relative transition-all duration-200 z-10 hover:brightness-110"
                                            style={{ height: `${(stats.total / maxDayTotal) * 100}%` }}
                                        >
                                            {/* Permanent Value Label */}
                                            <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex flex-col items-center z-30">
                                                <span className="bg-red-600 dark:bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap">
                                                    R$ {stats.total.toFixed(0)}
                                                </span>
                                                <span className="text-[8px] text-gray-500 dark:text-gray-400 font-bold mt-0.5 uppercase">
                                                    {stats.count} ped.
                                                </span>
                                            </div>

                                            {/* Hover Tooltip (Detailed) */}
                                            <div className="absolute -top-24 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 text-white text-[10px] font-bold px-4 py-3 rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-300 whitespace-nowrap z-50 shadow-2xl scale-75 group-hover:scale-100 flex flex-col items-center gap-1.5">
                                                <span className="text-sm text-red-400">Total: R$ {stats.total.toFixed(2)}</span>
                                                <div className="flex gap-3 text-[10px] font-medium border-t border-gray-700 pt-1.5 mt-1">
                                                    <span className="text-green-400">Min: R$ {stats.min.toFixed(2)}</span>
                                                    <span className="text-orange-400">Max: R$ {stats.max.toFixed(2)}</span>
                                                </div>
                                                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-gray-900 border-b border-r border-gray-700 rotate-45"></div>
                                            </div>
                                        </div>
                                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 rotate-45 origin-left mt-3 whitespace-nowrap z-10">
                                            {date.split('-').reverse().slice(0, 2).join('/')}
                                        </span>
                                    </div>
                                ))}
                                {chartData.length === 0 && (
                                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                                        Sem dados para exibir no gráfico.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col h-[400px] overflow-y-auto">
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-6 flex items-center gap-2">
                                    <Trophy className="text-yellow-500" size={20} />
                                    Mais Vendidos (Detalhado)
                                </h3>

                                {/* Tradicionais */}
                                <h4 className="text-sm font-bold text-gray-600 dark:text-gray-300 mt-4 mb-2 uppercase tracking-wide">Lanches Tradicionais</h4>
                                <div className="space-y-3 mb-6">
                                    {topLanchesTradicionais.map((p, index) => (
                                        <div key={p.name} className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs font-bold text-gray-400">{index + 1}</span>
                                                <span className="text-gray-700 dark:text-gray-300 font-medium text-sm truncate max-w-[120px]" title={p.name}>{p.name}</span>
                                            </div>
                                            <span className="text-gray-900 dark:text-gray-100 font-bold text-sm whitespace-nowrap">{p.qty} un</span>
                                        </div>
                                    ))}
                                    {topLanchesTradicionais.length === 0 && <p className="text-xs text-gray-500">Nenhum dado.</p>}
                                </div>

                                {/* Artesanais */}
                                <h4 className="text-sm font-bold text-gray-600 dark:text-gray-300 mt-4 mb-2 uppercase tracking-wide">Lanches Artesanais</h4>
                                <div className="space-y-3 mb-6">
                                    {topLanchesArtesanais.map((p, index) => (
                                        <div key={p.name} className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs font-bold text-gray-400">{index + 1}</span>
                                                <span className="text-gray-700 dark:text-gray-300 font-medium text-sm truncate max-w-[120px]" title={p.name}>{p.name}</span>
                                            </div>
                                            <span className="text-gray-900 dark:text-gray-100 font-bold text-sm whitespace-nowrap">{p.qty} un</span>
                                        </div>
                                    ))}
                                    {topLanchesArtesanais.length === 0 && <p className="text-xs text-gray-500">Nenhum dado.</p>}
                                </div>

                                {/* Porções */}
                                <h4 className="text-sm font-bold text-gray-600 dark:text-gray-300 mt-4 mb-2 uppercase tracking-wide">Porções</h4>
                                <div className="space-y-3 mb-6">
                                    {topPorcoes.map((p, index) => (
                                        <div key={p.name} className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs font-bold text-gray-400">{index + 1}</span>
                                                <span className="text-gray-700 dark:text-gray-300 font-medium text-sm truncate max-w-[120px]" title={p.name}>{p.name}</span>
                                            </div>
                                            <span className="text-gray-900 dark:text-gray-100 font-bold text-sm whitespace-nowrap">{p.qty} un</span>
                                        </div>
                                    ))}
                                    {topPorcoes.length === 0 && <p className="text-xs text-gray-500">Nenhum dado.</p>}
                                </div>
                                
                                {/* Geral (Fallback) */}
                                {(topLanchesTradicionais.length === 0 && topLanchesArtesanais.length === 0 && topPorcoes.length === 0) && (
                                    <>
                                        <h4 className="text-sm font-bold text-gray-600 dark:text-gray-300 mt-4 mb-2 uppercase tracking-wide">Geral</h4>
                                        <div className="space-y-3 mb-6">
                                            {topProductsOriginal.map((p, index) => (
                                                <div key={p.name} className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-xs font-bold text-gray-400">{index + 1}</span>
                                                        <span className="text-gray-700 dark:text-gray-300 font-medium text-sm truncate max-w-[120px]" title={p.name}>{p.name}</span>
                                                    </div>
                                                    <span className="text-gray-900 dark:text-gray-100 font-bold text-sm whitespace-nowrap">{p.qty} un</span>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Payment Rank - Area Destacada */}
                            <div className="mt-8 pt-8 border-t border-gray-100 dark:border-gray-700">
                                <h3 className="text-sm font-black text-gray-400 dark:text-gray-500 mb-4 uppercase tracking-wider flex items-center gap-2">
                                    <DollarSign size={14} /> Ranking Pagamentos
                                </h3>
                                <div className="space-y-3">
                                    {rankedPayments.map(([method, count]) => (
                                        <div key={method} className="flex items-center justify-between group">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-2 h-2 rounded-full ${method === 'PIX' ? 'bg-teal-400' :
                                                    method === 'Cartão' ? 'bg-blue-400' : 'bg-green-400'
                                                    }`} />
                                                <span className="text-xs font-bold text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200 transition-colors">
                                                    {method}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-black text-gray-900 dark:text-gray-100">{count}</span>
                                                <span className="text-[10px] text-gray-400 uppercase font-bold">uso(s)</span>
                                            </div>
                                        </div>
                                    ))}
                                    {rankedPayments.length === 0 && (
                                        <p className="text-[10px] text-gray-400 italic text-center">Sem dados de pagamento.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Detailed Order List */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden mt-4">
                        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-700/50">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                                <ShoppingBag className="text-red-600" size={20} />
                                Detalhamento dos Pedidos
                            </h3>
                            <span className="text-sm font-medium text-gray-500 bg-white dark:bg-gray-800 px-3 py-1 rounded-full border border-gray-200 dark:border-gray-600">
                                {orders.length} pedidos encontrados
                            </span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                    <tr>
                                        <th className="px-6 py-4">Data/Hora</th>
                                        <th className="px-6 py-4">Cliente</th>
                                        <th className="px-6 py-4">Lanche(s)</th>
                                        <th className="px-6 py-4 text-center">T. Prod</th>
                                        <th className="px-6 py-4 text-center">T. Entr</th>
                                        <th className="px-6 py-4 text-right">Valor</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {orders.map((order, i) => {
                                        // Calculate times for this specific order
                                        const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
                                        
                                        // Production Time
                                        const startProd = history.find(h => h.status === 'Em Produção');
                                        let endProd = undefined;
                                        if (startProd) {
                                            const startProdTime = new Date(startProd.timestamp).getTime();
                                            endProd = history.find(h => ['A Caminho', 'No Portão', 'Entregue'].includes(h.status) && new Date(h.timestamp).getTime() > startProdTime);
                                        }
                                        
                                        let prodTime = '-';
                                        if (startProd && endProd) {
                                            const diff = Math.round((new Date(endProd.timestamp).getTime() - new Date(startProd.timestamp).getTime()) / 60000);
                                            prodTime = `${diff} min`;
                                        }

                                        // Delivery Time
                                        const startDel = history.find(h => h.status === 'A Caminho');
                                        let endDel = undefined;
                                        if (startDel) {
                                            const startDelTime = new Date(startDel.timestamp).getTime();
                                            endDel = history.find(h => h.status === 'Entregue' && new Date(h.timestamp).getTime() > startDelTime);
                                        }
                                        
                                        let delTime = '-';
                                        if (startDel && endDel) {
                                             const diff = Math.round((new Date(endDel.timestamp).getTime() - new Date(startDel.timestamp).getTime()) / 60000);
                                             delTime = `${diff} min`;
                                        }

                                        const itemsList = Array.isArray(order.items) ? order.items : [];
                                        const itemsString = itemsList.map(item => `${item.quantity}x ${item.name}`).join(', ');

                                        return (
                                        <tr key={i} onClick={() => setSelectedOrder(order)} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                {order.timestamp ? new Date(order.timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                                                    {order.customerName || (order.table_number ? `Mesa ${order.table_number}` : 'Cliente')}
                                                </p>
                                                <p className="text-[10px] text-gray-400 uppercase tracking-wide">{order.orderType}</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1 max-w-md" title={itemsString}>
                                                    {itemsString || 'Sem itens'}
                                                </p>
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400">
                                                {prodTime}
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm text-gray-600 dark:text-gray-400">
                                                {delTime}
                                            </td>
                                            <td className="px-6 py-4 text-right font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                                                R$ {Number(order.total || 0).toFixed(2)}
                                            </td>
                                        </tr>
                                    )})}

                                    {orders.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400 italic">
                                                Nenhum pedido encontrado para o período selecionado.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Raffle Modal */}
            {showRaffleModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full shadow-2xl border border-purple-200 dark:border-purple-900 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-purple-500 via-pink-500 to-red-500"></div>
                        <div className="text-center mb-8">
                            <div className="w-20 h-20 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-purple-600 dark:text-purple-400">
                                <Gift size={40} />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Sorteio da Semana</h2>
                            <p className="text-gray-500 dark:text-gray-400 mt-2">
                                {eligibleCustomers.length} clientes elegíveis participando
                            </p>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6 mb-8 text-center min-h-[120px] flex flex-col justify-center items-center border border-gray-200 dark:border-gray-600">
                            {raffleWinner ? (
                                <div className="animate-in zoom-in duration-300">
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Vencedor(a)</p>
                                    <h3 className="text-2xl font-bold text-purple-600 dark:text-purple-400 mb-1">{raffleWinner.name}</h3>
                                    <p className="text-gray-600 dark:text-gray-300">{raffleWinner.phone}</p>
                                </div>
                            ) : (
                                <p className="text-gray-400 italic">Clique em sortear para descobrir o ganhador...</p>
                            )}
                        </div>

                        <div className="space-y-3">
                            <button
                                onClick={executeRaffle}
                                disabled={isRaffling || eligibleCustomers.length === 0}
                                className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-purple-200 dark:shadow-purple-900/20"
                            >
                                {isRaffling ? 'Sorteando...' : 'Realizar Sorteio'}
                            </button>
                            <button
                                onClick={() => setShowRaffleModal(false)}
                                disabled={isRaffling}
                                className="w-full py-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 font-medium"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Order Details Modal */}
            {selectedOrder && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-2xl w-full shadow-2xl border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-start mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                    Pedido #{selectedOrder.dailyOrderNumber}
                                    <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full text-gray-600 dark:text-gray-300 font-medium">
                                        {selectedOrder.origin === 'APP' ? 'Via App/Balcão' : 'Via IA / Sistema'}
                                    </span>
                                </h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    Data: {selectedOrder.timestamp ? new Date(selectedOrder.timestamp).toLocaleString('pt-BR') : '-'}
                                </p>
                            </div>
                            <button onClick={() => setSelectedOrder(null)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div className="space-y-4">
                                <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-xl">
                                    <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Cliente</h3>
                                    <p className="font-bold text-gray-900 dark:text-gray-100">{selectedOrder.customerName || 'Cliente'}</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-300">{selectedOrder.phone || 'Sem telefone'}</p>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-xl">
                                    <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Entrega</h3>
                                    <p className="font-medium text-gray-900 dark:text-gray-100">Motoboy: {selectedOrder.courier_name || 'N/A'}</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-300">Tipo: {selectedOrder.orderType}</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-300">Status Atual: {selectedOrder.status}</p>
                                    {selectedOrder.address && <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">Endereço: {selectedOrder.address}</p>}
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-xl">
                                    <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Pagamento</h3>
                                    <p className="font-medium text-gray-900 dark:text-gray-100">Método: {selectedOrder.paymentMethod}</p>
                                    <p className="text-lg font-black text-green-600 dark:text-green-400 mt-1">Total: R$ {Number(selectedOrder.total || 0).toFixed(2)}</p>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-xl h-full">
                                     <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Histórico de Status</h3>
                                     <ul className="text-xs space-y-1 text-gray-600 dark:text-gray-300">
                                         {Array.isArray(selectedOrder.statusHistory) && selectedOrder.statusHistory.length > 0 ? (
                                             selectedOrder.statusHistory.map((sh, idx) => (
                                                <li key={idx} className="flex justify-between border-b border-gray-200 dark:border-gray-600 last:border-0 pb-1 mb-1">
                                                    <span>{sh.status}</span>
                                                    <span className="text-gray-400">{new Date(sh.timestamp).toLocaleTimeString('pt-BR')}</span>
                                                </li>
                                             ))
                                         ) : (
                                            <li>Histórico não disponível</li>
                                         )}
                                     </ul>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-xl">
                            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase mb-3">Itens do Pedido</h3>
                            <div className="space-y-2">
                                {Array.isArray(selectedOrder.items) && selectedOrder.items.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-sm border-b border-gray-200 dark:border-gray-600 last:border-0 pb-2">
                                        <div>
                                            <span className="font-bold text-gray-900 dark:text-gray-100">{item.quantity}x {item.name}</span>
                                            {item.notes && <p className="text-xs text-orange-500 italic">Obs: {item.notes}</p>}
                                        </div>
                                        <span className="font-medium text-gray-700 dark:text-gray-300">R$ {((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
};

export default SalesHistory;
