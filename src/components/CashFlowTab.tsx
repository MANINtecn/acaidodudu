import React, { useState, useEffect } from 'react';
import { DollarSign, Eye, EyeOff, Printer, TrendingUp, Banknote, CreditCard, X, ArrowUpCircle, ArrowDownCircle, FileText } from 'lucide-react';
import { CashSession, CashSummary, CashTransaction, Order } from '../types';
import {
    getOpenCashSession,
    createCashSession,
    updateCashSession,
    createCashTransaction,
    getCashTransactionsForSession,
    fetchCashSessionsHistory,
    fetchOrdersForSession
} from '../services/supabaseService';
import { printCashReport } from '../services/printerService';

interface CashFlowTabProps {
    storeId: string;
}

const CashFlowTab: React.FC<CashFlowTabProps> = ({ storeId }) => {
    const [session, setSession] = useState<CashSession | null>(null);
    const [transactions, setTransactions] = useState<CashTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [showReport, setShowReport] = useState(false);
    // Histórico de CAIXAS (fechamentos anteriores) -- pedido do Ikarus
    // 01/10/2026: diferente do "Ver Histórico" de vendas (SalesHistory, já
    // tinha aba própria), isso é a prova de que o esperado x contado bate
    // dia após dia, exatamente o que faltava pro Marlon confiar no sistema.
    const [showCashHistory, setShowCashHistory] = useState(false);
    // Fechamento de caixa em modal, não mais prompt() -- achado CRÍTICO pela
    // auditoria de 01/10/2026: o prompt() cego pedia o valor contado ANTES de
    // mostrar o esperado, e aceitava qualquer diferença sem alertar (digitar
    // "1000" em vez de "100" virava uma "diferença de caixa" indistinguível
    // de furo real). Agora o operador VÊ o esperado antes de digitar, e uma
    // diferença grande exige confirmação extra.
    const [showCloseModal, setShowCloseModal] = useState(false);
    const [openingFloat, setOpeningFloat] = useState('');
    const [newTransaction, setNewTransaction] = useState({ type: 'Suprimento' as 'Suprimento' | 'Sangria', amount: '', justification: '' });
    const [eyeOpen, setEyeOpen] = useState(true);
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
        // Recarrega sozinho a cada 30s -- achado pela auditoria de 01/10/2026:
        // antes, sessionOrders só era buscado ao montar a aba. Se o operador
        // deixava a tela de Caixa aberta o dia todo (uso comum, como "painel"
        // de balcão), nenhum pedido feito OU cancelado depois aparecia nos
        // totais -- foi apontado como uma das causas reais do caixa nunca
        // bater (cliente Marlon, Açaí do Dudu, cancelou o sistema por isso).
        const interval = setInterval(loadSessionData, 30000);
        return () => clearInterval(interval);
    }, [storeId]);

    // "A Conferir" -- pedido do Ikarus 02/10/2026: "deveria mostrar os
    // pedidos executados dentro do período do caixa aberto, não o geral do
    // dia". Antes buscava `fetchOrderHistory` SEM nenhum filtro de data/
    // sessão -- misturava entregas de qualquer dia (inclusive de sessões de
    // caixa já fechadas) com as do caixa atual, quebrando exatamente o tipo
    // de confiança que a auditoria financeira já corrigiu em cashSales/
    // expected. Agora deriva de `sessionOrders` (fetchOrdersForSession, já
    // filtrado pelo openingTime do caixa ABERTO agora) -- quem quiser ver o
    // dia inteiro já tem o Histórico de Vendas separado pra isso.
    const pendingOrders = sessionOrders.filter(o =>
        (o.orderType === 'Entrega' && ['Em Produção', 'A Caminho', 'No Portão', 'Entregue'].includes(o.status)) ||
        (o.orderType !== 'Entrega' && o.status === 'Entregue')
    );

    const handleOpenSession = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await createCashSession(storeId, parseFloat(openingFloat));
            await loadSessionData();
        } catch (error) {
            alert("Erro ao abrir caixa");
        }
    };

    const handleCloseSession = async (closingFloat: number) => {
        if (!session) return;

        // CRÍTICO (achado pela auditoria de 01/10/2026): até aqui, NENHUMA
        // função no projeto inteiro montava o `summary` do fechamento --
        // `handleCloseSession` só gravava o valor contado na gaveta
        // (closingFloat), sem nunca calcular o "esperado" para comparar.
        // O relatório de fechamento (CashReportModal) ficava sem dado
        // nenhum (`if (!session.summary) return null`). Essa foi a causa
        // raiz mais provável de o cliente Marlon (Açaí do Dudu) nunca
        // conseguir bater o caixa: ele não tinha nenhum número do sistema
        // para comparar com o dinheiro físico.
        const expected = expectedInDrawer;
        // CRÍTICO (achado 01/10/2026, mensagem do cliente Marlon: "Deu do
        // total. Não vi especificações de pix. Dinheiro e cartão."): o
        // relatório impresso de fechamento só tinha "Vendas em Dinheiro" --
        // Pix e Cartão nunca entravam no summary nem no papel, só na TELA do
        // sistema (ele olhava o papel). Pix/Cartão não afetam "expected" (não
        // é dinheiro físico na gaveta), mas precisam aparecer no relatório
        // pro operador conferir o total batido por forma de pagamento.
        const pixSales = salesByMethod['PIX'] || 0;
        const cardSales = salesByMethod['Cartão'] || 0;
        const summary: CashSummary = {
            openingFloat: session.openingFloat || 0,
            cashSales,
            pixSales,
            cardSales,
            supplies: totalIn,
            withdrawals: totalOut,
            expected,
            closingFloat,
            difference: closingFloat - expected,
        };

        try {
            await updateCashSession(session.id, {
                status: 'closed',
                closingFloat,
                closingTime: new Date().toISOString(),
                summary,
            });
            setShowCloseModal(false);
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


    // Calculations
    const totalIn = transactions.filter(t => t.type === 'Suprimento').reduce((acc, t) => acc + t.amount, 0);
    const totalOut = transactions.filter(t => t.type === 'Sangria').reduce((acc, t) => acc + t.amount, 0);
    const currentBalance = (session?.openingFloat || 0) + totalIn - totalOut; // Only cash movements affect "Cash in Drawer" logic usually, but sales add to it.
    // Wait, "currentBalance" usually implies Cash in Drawer.
    // Sales in Cash should be added.
    // CRÍTICO (achado pela auditoria de 01/10/2026, causa raiz do caixa nunca
    // bater para o cliente Marlon): o filtro antigo (`status !== 'Cancelado'`)
    // contava QUALQUER pedido que não foi cancelado como venda -- inclusive
    // um pedido 'Novo' que o cliente nunca pagou, nunca retirou, ou um teste
    // esquecido na tela. Só "Entregue" significa que o dinheiro realmente
    // entrou (passou pelo checkout/CheckoutModal). Esse MESMO filtro
    // (vendasConfirmadas) é usado em TODOS os totais abaixo -- antes do
    // filtro) não existe mais com o nome antigo para não ser reusado por
    // engano em outro lugar.
    const vendasConfirmadas = sessionOrders.filter(o => o.status === 'Entregue');
    const cashSales = vendasConfirmadas.filter(o => o.paymentMethod === 'Dinheiro').reduce((acc, o) => acc + o.total, 0);
    const totalCashInDrawer = currentBalance + cashSales;
    // Calculado aqui (fora do modal) para o modal de fechamento poder mostrar
    // o esperado ANTES do operador digitar o valor contado -- era exatamente
    // o que faltava no prompt() cego antigo.
    const expectedInDrawer = (session?.openingFloat || 0) + cashSales + totalIn - totalOut;

    const totalSales = vendasConfirmadas.reduce((acc, o) => acc + o.total, 0);
    const totalOrders = vendasConfirmadas.length;

    const salesByMethod = vendasConfirmadas.reduce((acc, order) => {
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
                    <button type="button" onClick={() => setShowCashHistory(true)} className="w-full py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2">
                        <FileText size={20} /> Histórico de Fechamentos
                    </button>
                </form>
                {showCashHistory && <CashSessionHistoryModal storeId={storeId} onClose={() => setShowCashHistory(false)} />}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header / Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Opening Float Card -- pedido do Ikarus 01/10/2026: "pra ele
                    saber com quanto começou, sem precisar só fazer conta na
                    cabeça". Fica ANTES do Caixa Atual, pra leitura da esquerda
                    pra direita ser "comecei com X, agora tenho Y". */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Caixa Inicial</p>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{formatCurrency(session?.openingFloat || 0)}</h3>
                        </div>
                        <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-amber-600 dark:text-amber-400">
                            <Banknote size={24} />
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Fundo de troco na abertura</p>
                </div>

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

                {/* Actions Card */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col justify-between">
                    <div className="flex gap-2">
                        <button onClick={() => setEyeOpen(!eyeOpen)} className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex-1 flex justify-center">
                            {eyeOpen ? <Eye size={20} /> : <EyeOff size={20} />}
                        </button>
                        <button onClick={() => window.print()} className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex-1 flex justify-center">
                            <Printer size={20} />
                        </button>
                        <button onClick={() => setShowCashHistory(true)} title="Histórico de Fechamentos" className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex-1 flex justify-center">
                            <FileText size={20} />
                        </button>
                    </div>
                    <button onClick={() => setShowCloseModal(true)} className="w-full py-2 bg-red-600 dark:bg-red-700 text-white rounded-lg font-bold hover:bg-red-700 dark:hover:bg-red-800 transition-colors mt-2 text-sm">
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
                                {/* Achado 01/10/2026 (véspera da demo, Ikarus testou no tema
                                    escuro): bg-green-50/bg-red-50 some no dark mode -- sem
                                    dark:bg-*, o selecionado ficava quase idêntico ao não
                                    selecionado ("não dá pra ver que clicou"). Cor sólida +
                                    anel de destaque deixa o estado óbvio nos dois temas. */}
                                <div className="flex rounded-md shadow-sm">
                                    <button type="button" onClick={() => setNewTransaction({ ...newTransaction, type: 'Suprimento' })} className={`flex-1 px-3 py-1.5 text-xs font-bold rounded-l-md border-2 transition-colors ${newTransaction.type === 'Suprimento' ? 'bg-green-600 text-white border-green-600 z-10 shadow-md' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>Suprimento</button>
                                    <button type="button" onClick={() => setNewTransaction({ ...newTransaction, type: 'Sangria' })} className={`flex-1 px-3 py-1.5 text-xs font-bold rounded-r-md border-2 -ml-px transition-colors ${newTransaction.type === 'Sangria' ? 'bg-red-600 text-white border-red-600 z-10 shadow-md' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>Sangria</button>
                                </div>
                            </div>
                            <div className="w-24">
                                <label className="block text-[10px] font-medium text-gray-500 mb-1">Valor</label>
                                {/* Achado 01/10/2026: faltava cor de fundo/texto -- no dark
                                    mode herdava texto escuro sobre fundo escuro, ficando
                                    "transparente" (ilegível), mesmo bug nos dois temas. */}
                                <input type="number" value={newTransaction.amount} onChange={e => setNewTransaction({ ...newTransaction, amount: e.target.value })} className="w-full px-3 py-1.5 text-xs border rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 placeholder-gray-400 dark:placeholder-gray-500" placeholder="0.00" step="0.01" required />
                            </div>
                            <div className="flex-1">
                                <label className="block text-[10px] font-medium text-gray-500 mb-1">Justificativa</label>
                                <input type="text" value={newTransaction.justification} onChange={e => setNewTransaction({ ...newTransaction, justification: e.target.value })} className="w-full px-3 py-1.5 text-xs border rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 placeholder-gray-400 dark:placeholder-gray-500" placeholder="Ex: Troco" required />
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

            {showReport && session && <CashReportModal isOpen={showReport} onClose={() => setShowReport(false)} session={session} />}
            {showCashHistory && <CashSessionHistoryModal storeId={storeId} onClose={() => setShowCashHistory(false)} />}
            {showCloseModal && (
                <CloseSessionModal
                    expected={expectedInDrawer}
                    onClose={() => setShowCloseModal(false)}
                    onConfirm={handleCloseSession}
                    formatCurrency={formatCurrency}
                />
            )}
        </div>
    );
};

/** Fechamento de caixa em modal -- substitui o prompt() cego (achado CRÍTICO
 * pela auditoria de 01/10/2026). Mostra o Esperado em Caixa ANTES do operador
 * digitar o valor contado, e exige confirmação extra se a diferença entre os
 * dois for grande (acima de R$5 OU 5% do esperado, o que for maior) -- sem
 * isso, um erro de digitação (ex: "1000" em vez de "100") virava uma
 * "diferença de caixa" indistinguível de dinheiro sumido de verdade. */
const CloseSessionModal = ({ expected, onClose, onConfirm, formatCurrency }: {
    expected: number;
    onClose: () => void;
    onConfirm: (closingFloat: number) => void;
    formatCurrency: (v: number) => string;
}) => {
    const [valor, setValor] = useState('');
    const [confirmandoDivergencia, setConfirmandoDivergencia] = useState(false);

    const closingFloat = parseFloat(valor);
    const valido = !isNaN(closingFloat);
    const difference = valido ? closingFloat - expected : 0;
    // Limiar de "diferença grande": R$5 OU 5% do esperado, o que for maior --
    // evita disparar confirmação extra por diferença de centavos legítima
    // (troco arredondado), mas pega qualquer erro de digitação relevante.
    const limiarDivergencia = Math.max(5, expected * 0.05);
    const divergenciaGrande = valido && Math.abs(difference) > limiarDivergencia;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!valido) return;
        if (divergenciaGrande && !confirmandoDivergencia) {
            setConfirmandoDivergencia(true);
            return;
        }
        onConfirm(closingFloat);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Fechar Caixa</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                        <X size={24} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Esperado em Caixa</span>
                        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(expected)}</span>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor Contado na Gaveta (R$)</label>
                        <input
                            type="number"
                            autoFocus
                            value={valor}
                            onChange={e => { setValor(e.target.value); setConfirmandoDivergencia(false); }}
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                            placeholder="0.00"
                            step="0.01"
                            required
                        />
                    </div>
                    {valido && (
                        <div className={`flex justify-between items-center p-3 rounded-lg font-bold ${Math.abs(difference) < 0.01 ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
                            <span>Diferença</span>
                            <span>{formatCurrency(difference)}</span>
                        </div>
                    )}
                    {divergenciaGrande && (
                        <p className="text-sm font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                            {confirmandoDivergencia
                                ? 'Confirme de novo para fechar mesmo assim.'
                                : `Diferença de ${formatCurrency(Math.abs(difference))} é grande -- confira o valor contado antes de continuar.`}
                        </p>
                    )}
                    <button
                        type="submit"
                        disabled={!valido}
                        className={`w-full py-3 rounded-lg font-bold transition-colors ${!valido ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed' : divergenciaGrande ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                    >
                        {divergenciaGrande && !confirmandoDivergencia ? 'Continuar mesmo assim' : 'Confirmar Fechamento'}
                    </button>
                </form>
            </div>
        </div>
    );
};

/** Histórico de fechamentos de caixa (sessões já encerradas) -- pedido do
 * Ikarus 01/10/2026, véspera da demo pro Marlon: é a prova concreta de que o
 * esperado x contado bate dia após dia, mesmo problema que fez o cliente
 * cancelar o sistema antes. Modal (não inline) para não repetir o mesmo erro
 * visual do SalesHistory "torto" dentro da aba. */
const CashSessionHistoryModal = ({ storeId, onClose }: { storeId: string; onClose: () => void }) => {
    const [sessions, setSessions] = useState<CashSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const data = await fetchCashSessionsHistory(storeId);
                setSessions(data);
            } catch (error) {
                console.error('Erro ao carregar histórico de caixas:', error);
            } finally {
                setLoading(false);
            }
        })();
    }, [storeId]);

    const formatDateTime = (iso?: string) => iso ? new Date(iso).toLocaleString('pt-BR') : '-';

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-gray-200 dark:border-gray-700" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                        <FileText size={22} /> Histórico de Fechamentos
                    </h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                        <X size={24} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                    {loading && <p className="text-center text-gray-500 dark:text-gray-400 py-8">Carregando...</p>}
                    {!loading && sessions.length === 0 && (
                        <p className="text-center text-gray-500 dark:text-gray-400 py-8">Nenhum fechamento registrado ainda.</p>
                    )}
                    {sessions.map(s => {
                        const summary = s.summary;
                        const expanded = expandedId === s.id;
                        const diffOk = (summary?.difference ?? 0) === 0;
                        return (
                            <div key={s.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                <button
                                    onClick={() => setExpandedId(expanded ? null : s.id)}
                                    className="w-full flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                                >
                                    <div>
                                        <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">{formatDateTime(s.closingTime)}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Abertura: {formatDateTime(s.openingTime)}</p>
                                    </div>
                                    {summary && (
                                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${diffOk ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                            {diffOk ? 'Bateu certinho' : `Diferença: R$ ${summary.difference.toFixed(2)}`}
                                        </span>
                                    )}
                                </button>
                                {expanded && summary && (
                                    <div className="p-4 space-y-2 text-sm border-t border-gray-200 dark:border-gray-700">
                                        <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Caixa Inicial</span><span className="font-medium text-gray-900 dark:text-gray-100">R$ {summary.openingFloat.toFixed(2)}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Vendas em Dinheiro</span><span className="font-medium text-green-600 dark:text-green-400">R$ {summary.cashSales.toFixed(2)}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Vendas em PIX</span><span className="font-medium text-blue-600 dark:text-blue-400">R$ {(summary.pixSales || 0).toFixed(2)}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Vendas em Cartão</span><span className="font-medium text-purple-600 dark:text-purple-400">R$ {(summary.cardSales || 0).toFixed(2)}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Suprimentos</span><span className="font-medium text-green-600 dark:text-green-400">+ R$ {summary.supplies.toFixed(2)}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Sangrias</span><span className="font-medium text-red-600 dark:text-red-400">- R$ {summary.withdrawals.toFixed(2)}</span></div>
                                        <div className="border-t border-gray-200 dark:border-gray-700 my-2"></div>
                                        <div className="flex justify-between font-bold"><span className="text-gray-800 dark:text-gray-200">Esperado em Caixa</span><span className="text-gray-900 dark:text-gray-100">R$ {summary.expected.toFixed(2)}</span></div>
                                        <div className="flex justify-between font-bold"><span className="text-gray-800 dark:text-gray-200">Valor Informado</span><span className="text-blue-600 dark:text-blue-400">R$ {summary.closingFloat.toFixed(2)}</span></div>
                                        <div className={`flex justify-between font-bold p-2 rounded ${diffOk ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
                                            <span>Diferença</span><span>R$ {summary.difference.toFixed(2)}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
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
                    {/* Achado 01/10/2026: faltava aqui e no papel impresso --
                        reclamação do Marlon, "não vi especificações de pix,
                        dinheiro e cartão". Não somam no "Esperado em Caixa"
                        (não é dinheiro físico na gaveta), só informam pro
                        operador conferir o total por forma de pagamento. */}
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Vendas em PIX</span>
                        <span className="font-medium text-blue-600 dark:text-blue-400">R$ {(summary.pixSales || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Vendas em Cartão</span>
                        <span className="font-medium text-purple-600 dark:text-purple-400">R$ {(summary.cardSales || 0).toFixed(2)}</span>
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
