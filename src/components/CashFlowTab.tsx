import React, { useState, useEffect } from 'react';
import { DollarSign, Eye, EyeOff, History, Printer, TrendingUp, ShoppingBag, CreditCard, X, ArrowUpCircle, ArrowDownCircle, FileText } from 'lucide-react';
import { CashSession, CashTransaction, Order } from '../types';
import {
    getOpenCashSession,
    createCashSession,
    updateCashSession,
    createCashTransaction,
    getCashTransactionsForSession,
    fetchActiveOrders,
    fetchOrderHistory,

    fetchOrdersForSession
} from '../services/supabaseService';
import { printCashReport } from '../services/printerService';
import SalesHistory from './SalesHistory';

interface CashFlowTabProps {
    storeId: string;
}

const CashFlowTab: React.FC<CashFlowTabProps> = ({ storeId }) => {
    const [session, setSession] = useState<CashSession | null>(null);
    const [transactions, setTransactions] = useState<CashTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [showReport, setShowReport] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [openingFloat, setOpeningFloat] = useState('');
    const [newTransaction, setNewTransaction] = useState({ type: 'Suprimento' as 'Suprimento' | 'Sangria', amount: '', justification: '' });
    const [eyeOpen, setEyeOpen] = useState(true);
    const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
    const [sessionOrders, setSessionOrders] = useState<Order[]>([]);


    const loadSessionData = async () => {
        try {
            const currentSession = await getOpenCashSession(storeId);
            setSession(currentSession);
            if (currentSession) {
                const [txs, orders] = await Promise.all([
                    getCashTransactionsForSession(currentSession.id),
                    fetchOrdersForSession(storeId, currentSession.openingTime || new Date().toISOString())
                ]);
                setTransactions(txs);
                setSessionOrders(orders);
            }
        } catch (error) {
            console.error("Error loading session:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSessionData();
    }, [storeId]);

    // Load Pending Orders (A Conferir)
    useEffect(() => {
        const loadPending = async () => {
            try {
                const active = await fetchActiveOrders(storeId);
                // Include all delivery orders that are not "Novo" (which are just arrived) but are in progress or done
                // Actually, user wants "A Conferir" for end of day. So we should include ALL delivery orders that are not Cancelled.
                // But usually "A Conferir" implies "Money not yet verified".
                // If we want "Historico do caixa para conferencia", we likely want all deliveries of the session.
                // Let's filter for: Em Produção, A Caminho, No Portão, Entregue.
                const deliveryOrders = active.filter(o =>
                    o.orderType === 'Entrega' &&
                    ['Em Produção', 'A Caminho', 'No Portão', 'Entregue'].includes(o.status)
                );

                // For counter orders, we want those finalized today/recently
                const history = await fetchOrderHistory(storeId);
                // Merge active delivery orders with history delivery orders (in case they are moved to history but still need checking)
                const historyDelivery = history.filter(o =>
                    o.orderType === 'Entrega' &&
                    ['Em Produção', 'A Caminho', 'No Portão', 'Entregue'].includes(o.status)
                );

                // Deduplicate by ID
                const allDelivery = [...deliveryOrders, ...historyDelivery].filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);

                const counterFinalized = history.filter(o => o.orderType !== 'Entrega' && o.status === 'Entregue');

                setPendingOrders([...allDelivery, ...counterFinalized]);
            } catch (e) {
                console.error("Error loading pending orders:", e);
            }
        };
        loadPending();
        const interval = setInterval(loadPending, 30000);
        return () => clearInterval(interval);
    }, [storeId]);

    const handleOpenSession = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await createCashSession(storeId, parseFloat(openingFloat));
            await loadSessionData();
        } catch (error) {
            alert("Erro ao abrir caixa");
        }
    };

    const handleCloseSession = async () => {
        if (!session) return;
        const closingValue = prompt("Informe o valor total em dinheiro no caixa:");
        if (closingValue === null) return;

        try {
            await updateCashSession(session.id, {
                status: 'closed',
                closingFloat: parseFloat(closingValue),
                closingTime: new Date().toISOString()
            });
            await loadSessionData();
            setShowReport(true);
        } catch (error) {
            alert("Erro ao fechar caixa");
        }
    };

    const handleAddTransaction = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!session) return;
        try {
            await createCashTransaction({
                session_id: session.id,
                store_id: storeId,
                type: newTransaction.type,
                amount: parseFloat(newTransaction.amount),
                justification: newTransaction.justification
            });
            setNewTransaction({ type: 'Suprimento', amount: '', justification: '' });
            await loadSessionData();
        } catch (error) {
            alert("Erro ao adicionar movimentação");
        }
    };

    const handleLoadHistory = () => {
        setShowHistory(true);
    };

    // Calculations
    const totalIn = transactions.filter(t => t.type === 'Suprimento').reduce((acc, t) => acc + t.amount, 0);
    const totalOut = transactions.filter(t => t.type === 'Sangria').reduce((acc, t) => acc + t.amount, 0);
    const currentBalance = (session?.openingFloat || 0) + totalIn - totalOut; // Only cash movements affect "Cash in Drawer" logic usually, but sales add to it. 
    // Wait, "currentBalance" usually implies Cash in Drawer. 
    // Sales in Cash should be added.
    const cashSales = sessionOrders.filter(o => o.paymentMethod === 'Dinheiro' && o.status !== 'Cancelado').reduce((acc, o) => acc + o.total, 0);
    const totalCashInDrawer = currentBalance + cashSales;

    const totalSales = sessionOrders.filter(o => o.status !== 'Cancelado').reduce((acc, o) => acc + o.total, 0);
    const totalOrders = sessionOrders.filter(o => o.status !== 'Cancelado').length;
    const ticketAverage = totalOrders > 0 ? totalSales / totalOrders : 0;

    const salesByMethod = sessionOrders.reduce((acc, order) => {
        if (order.status === 'Cancelado') return acc;
        const method = order.paymentMethod || 'Outros';
        acc[method] = (acc[method] || 0) + order.total;
        return acc;
    }, {} as Record<string, number>);

    const formatCurrency = (value: number) => {
        return eyeOpen ? `R$ ${value.toFixed(2)}` : 'R$ ****';
    };

    if (loading) return <div className="p-8 text-center">Carregando...</div>;

    if (!session) {
        return (
            <div className="max-w-md mx-auto mt-10 bg-white dark:bg-gray-800 p-8 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 text-center">
                <DollarSign size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">Caixa Fechado</h2>
                <p className="text-gray-500 dark:text-gray-400 mb-6">Abra o caixa para começar a registrar vendas e movimentações.</p>
                <form onSubmit={handleOpenSession} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 text-left">Fundo de Troco (R$)</label>
                        <input
                            type="number"
                            value={openingFloat}
                            onChange={e => setOpeningFloat(e.target.value)}
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                            placeholder="0.00"
                            step="0.01"
                            required
                        />
                    </div>
                    <button type="submit" className="w-full py-3 bg-green-600 dark:bg-green-700 text-white rounded-lg font-bold hover:bg-green-700 dark:hover:bg-green-800 transition-colors">
                        Abrir Caixa
                    </button>
                    <button type="button" onClick={handleLoadHistory} className="w-full py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2">
                        <History size={20} /> Ver Histórico
                    </button>
                </form>
                {showHistory && <SalesHistory storeId={storeId} onClose={() => setShowHistory(false)} />}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header / Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Main Balance Card */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 relative overflow-hidden">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Caixa Atual (Dinheiro)</p>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{formatCurrency(totalCashInDrawer)}</h3>
                        </div>
                        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg text-green-600 dark:text-green-400">
                            <DollarSign size={24} />
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span className="flex items-center text-green-600 dark:text-green-400"><ArrowUpCircle size={12} className="mr-1" /> {formatCurrency(totalIn)}</span>
                        <span className="flex items-center text-red-600 dark:text-red-400"><ArrowDownCircle size={12} className="mr-1" /> {formatCurrency(totalOut)}</span>
                    </div>
                </div>

                {/* Total Sales Card */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Total Vendas</p>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{formatCurrency(totalSales)}</h3>
                        </div>
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                            <TrendingUp size={24} />
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{totalOrders} pedidos realizados</p>
                </div>

                {/* Ticket Average Card */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Ticket Médio</p>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{formatCurrency(ticketAverage)}</h3>
                        </div>
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400">
                            <ShoppingBag size={24} />
                        </div>
                    </div>
                </div>

                {/* Actions Card */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col justify-between">
                    <div className="flex gap-2">
                        <button onClick={() => setEyeOpen(!eyeOpen)} className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex-1 flex justify-center">
                            {eyeOpen ? <Eye size={20} /> : <EyeOff size={20} />}
                        </button>
                        <button onClick={() => window.print()} className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex-1 flex justify-center">
                            <Printer size={20} />
                        </button>
                    </div>
                    <button onClick={handleCloseSession} className="w-full py-2 bg-red-600 dark:bg-red-700 text-white rounded-lg font-bold hover:bg-red-700 dark:hover:bg-red-800 transition-colors mt-2 text-sm">
                        Fechar Caixa
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Payment Methods Breakdown */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                    <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
                        <CreditCard size={20} className="text-gray-500" />
                        Formas de Pagamento
                    </h3>
                    <div className="space-y-4">
                        {Object.entries(salesByMethod).map(([method, total]) => (
                            <div key={method} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className={`w-3 h-3 rounded-full ${method === 'Dinheiro' ? 'bg-green-500' : method === 'PIX' ? 'bg-blue-500' : 'bg-purple-500'}`}></div>
                                    <span className="text-sm text-gray-600 dark:text-gray-300">{method}</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="w-24 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${method === 'Dinheiro' ? 'bg-green-500' : method === 'PIX' ? 'bg-blue-500' : 'bg-purple-500'}`}
                                            style={{ width: `${(total / totalSales) * 100}%` }}
                                        ></div>
                                    </div>
                                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100 w-20 text-right">{formatCurrency(total)}</span>
                                </div>
                            </div>
                        ))}
                        {Object.keys(salesByMethod).length === 0 && <p className="text-gray-500 text-sm text-center py-4">Nenhuma venda registrada.</p>}
                    </div>
                </div>

                {/* Transactions List */}
                <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
                    <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                        <h3 className="font-bold text-gray-700 dark:text-gray-200">Movimentações</h3>
                        <button onClick={() => { }} className="text-xs text-blue-600 hover:underline">Ver todas</button>
                    </div>
                    <div className="flex-1 overflow-y-auto max-h-[300px]">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0">
                                <tr>
                                    <th className="px-6 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300">Hora</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300">Tipo</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300">Justificativa</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 text-right">Valor</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {transactions.map((t, i) => (
                                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                        <td className="px-6 py-3 text-xs text-gray-500 dark:text-gray-400">{new Date(t.timestamp!).toLocaleTimeString()}</td>
                                        <td className="px-6 py-3">
                                            <span className={`px-2 py-1 rounded-full text-[10px] font-medium ${t.type === 'Suprimento' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}`}>
                                                {t.type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-xs text-gray-900 dark:text-gray-100">{t.justification || '-'}</td>
                                        <td className={`px-6 py-3 text-right text-xs font-bold ${t.type === 'Suprimento' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                            {t.type === 'Suprimento' ? '+' : '-'} {formatCurrency(t.amount)}
                                        </td>
                                    </tr>
                                ))}
                                {transactions.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400 text-sm">Nenhuma movimentação.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Add Transaction Form */}
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                        <form onSubmit={handleAddTransaction} className="flex gap-2 items-end">
                            <div className="flex-1">
                                <label className="block text-[10px] font-medium text-gray-500 mb-1">Tipo</label>
                                <div className="flex rounded-md shadow-sm">
                                    <button type="button" onClick={() => setNewTransaction({ ...newTransaction, type: 'Suprimento' })} className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-l-md border ${newTransaction.type === 'Suprimento' ? 'bg-green-50 text-green-700 border-green-500 z-10' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>Suprimento</button>
                                    <button type="button" onClick={() => setNewTransaction({ ...newTransaction, type: 'Sangria' })} className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-r-md border -ml-px ${newTransaction.type === 'Sangria' ? 'bg-red-50 text-red-700 border-red-500 z-10' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>Sangria</button>
                                </div>
                            </div>
                            <div className="w-24">
                                <label className="block text-[10px] font-medium text-gray-500 mb-1">Valor</label>
                                <input type="number" value={newTransaction.amount} onChange={e => setNewTransaction({ ...newTransaction, amount: e.target.value })} className="w-full px-3 py-1.5 text-xs border rounded-md" placeholder="0.00" step="0.01" required />
                            </div>
                            <div className="flex-1">
                                <label className="block text-[10px] font-medium text-gray-500 mb-1">Justificativa</label>
                                <input type="text" value={newTransaction.justification} onChange={e => setNewTransaction({ ...newTransaction, justification: e.target.value })} className="w-full px-3 py-1.5 text-xs border rounded-md" placeholder="Ex: Troco" required />
                            </div>
                            <button type="submit" className="px-4 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-md hover:bg-gray-800">Add</button>
                        </form>
                    </div>
                </div>
            </div>

            {/* Pending Orders Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                    <h3 className="font-bold text-yellow-800 dark:text-yellow-200">A Conferir / Finalizados Balcão</h3>
                    <span className="text-xs text-yellow-700 dark:text-yellow-300 bg-yellow-100 dark:bg-yellow-900/40 px-2 py-1 rounded-full">{pendingOrders.length} pedidos</span>
                </div>
                <table className="w-full text-left">
                    <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-sm font-semibold text-gray-600 dark:text-gray-300">Pedido</th>
                            <th className="px-6 py-3 text-sm font-semibold text-gray-600 dark:text-gray-300">Cliente/Mesa</th>
                            <th className="px-6 py-3 text-sm font-semibold text-gray-600 dark:text-gray-300">Status</th>
                            <th className="px-6 py-3 text-sm font-semibold text-gray-600 dark:text-gray-300">Pagamento</th>
                            <th className="px-6 py-3 text-sm font-semibold text-gray-600 dark:text-gray-300 text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {pendingOrders.map((order) => (
                            <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">#{order.dailyOrderNumber}</td>
                                <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                                    {order.orderType === 'Entrega' ? order.customerName : `Mesa ${order.table_number || '?'}`}
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${order.status === 'Em Produção' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                        {order.status === 'Em Produção' ? 'A Conferir (Entrega)' : 'Finalizado (Balcão)'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                                    {order.paymentMethod || '-'}
                                </td>
                                <td className="px-6 py-4 text-right font-bold text-gray-900 dark:text-gray-100">
                                    {formatCurrency(order.total)}
                                </td>
                            </tr>
                        ))}
                        {pendingOrders.length > 0 && (
                            <tr className="bg-gray-50 dark:bg-gray-700/50 font-bold">
                                <td colSpan={4} className="px-6 py-4 text-right text-gray-900 dark:text-gray-100">Total:</td>
                                <td className="px-6 py-4 text-right text-gray-900 dark:text-gray-100">
                                    {formatCurrency(pendingOrders.reduce((sum, o) => sum + o.total, 0))}
                                </td>
                            </tr>
                        )}
                        {pendingOrders.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">Nenhum pedido pendente de conferência.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {showHistory && <SalesHistory storeId={storeId} onClose={() => setShowHistory(false)} />}
            {showReport && session && <CashReportModal isOpen={showReport} onClose={() => setShowReport(false)} session={session} />}
        </div>
    );
};



const CashReportModal = ({ isOpen, onClose, session }: { isOpen: boolean; onClose: () => void; session: CashSession }) => {
    if (!isOpen || !session.summary) return null;
    const { summary } = session;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full shadow-xl border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Relatório de Fechamento</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                        <X size={24} />
                    </button>
                </div>
                <div className="space-y-4 mb-6">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Fundo de Troco</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">R$ {summary.openingFloat.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Vendas em Dinheiro</span>
                        <span className="font-medium text-green-600 dark:text-green-400">+ R$ {summary.cashSales.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Suprimentos</span>
                        <span className="font-medium text-green-600 dark:text-green-400">+ R$ {summary.supplies.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Sangrias</span>
                        <span className="font-medium text-red-600 dark:text-red-400">- R$ {summary.withdrawals.toFixed(2)}</span>
                    </div>
                    <div className="border-t border-gray-200 dark:border-gray-700 my-2"></div>
                    <div className="flex justify-between font-bold">
                        <span className="text-gray-800 dark:text-gray-200">Esperado em Caixa</span>
                        <span className="text-gray-900 dark:text-gray-100">R$ {summary.expected.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold">
                        <span className="text-gray-800 dark:text-gray-200">Valor Informado</span>
                        <span className="text-blue-600 dark:text-blue-400">R$ {summary.closingFloat.toFixed(2)}</span>
                    </div>
                    <div className={`flex justify-between font-bold p-2 rounded ${summary.difference >= 0 ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
                        <span>Diferença</span>
                        <span>R$ {summary.difference.toFixed(2)}</span>
                    </div>
                </div>
                <button onClick={async () => {
                    const success = await printCashReport(summary);
                    if (!success) alert("Erro ao imprimir relatório. Verifique a conexão.");
                }} className="w-full mb-2 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2">
                    <FileText size={20} /> Imprimir Relatório (A4/PDF)
                </button>
                <button onClick={onClose} className="w-full py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors">
                    Fechar
                </button>
            </div>
        </div>
    );
};

export default CashFlowTab;
