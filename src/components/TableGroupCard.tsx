import React, { useState } from 'react';
import { Order } from '../types';
import { Printer, XCircle, CheckCircle, ChevronDown, ChevronUp, PlusCircle, DollarSign } from 'lucide-react';

interface TableGroupCardProps {
    tableNumber: number;
    orders: Order[];
    onPrint: (order: Order) => void;
    onCancel: (order: Order) => void;
    onAdvanceStatus: (order: Order) => void;
    onEdit: (order: Order) => void;
}

const TableGroupCard: React.FC<TableGroupCardProps> = ({ tableNumber, orders, onPrint, onCancel, onAdvanceStatus, onEdit }) => {
    const [isExpanded, setIsExpanded] = useState(true); // Default expanded to show content
    
    // Sum total of all sub-orders
    const totalAmount = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    
    // Determine main status
    const mainStatus = orders.some(o => o.status === 'Conta Solicitada') ? 'Conta Solicitada'
                     : orders.some(o => o.status === 'Novo') ? 'Novo' 
                     : orders.some(o => o.status === 'Em Produção') ? 'Em Produção'
                     : 'Entregue';

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Novo': return 'bg-blue-500 text-white';
            case 'Em Produção': return 'bg-yellow-500 text-black';
            case 'A Caminho': return 'bg-purple-500 text-white';
            case 'No Portão': return 'bg-orange-500 text-white';
            case 'Entregue': return 'bg-green-500 text-white';
            case 'Cancelado': return 'bg-red-500 text-white';
            case 'Conta Solicitada': return 'bg-yellow-400 text-black border border-yellow-600';
            default: return 'bg-gray-500 text-white';
        }
    };

    const getNextAction = (status: string) => {
        if (status === 'Novo') {
            return { label: 'PRONTO', icon: <CheckCircle size={14} />, color: 'bg-green-600 hover:bg-green-700' };
        }
        if (status === 'Em Produção') {
            return { label: 'FINALIZAR MESA', icon: <DollarSign size={14} />, color: 'bg-green-600 hover:bg-green-700' };
        }
        if (status === 'Conta Solicitada') {
            return { label: 'FECHAR CONTA', icon: <DollarSign size={14} />, color: 'bg-green-600 hover:bg-green-700' };
        }
        return { label: 'FINALIZAR MESA', icon: <DollarSign size={14} />, color: 'bg-green-600 hover:bg-green-700' };
    };

    const action = getNextAction(mainStatus);

    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow p-3 flex flex-col h-full text-xs">
            {/* Header: Table Info */}
            <div className="flex justify-between items-start mb-2">
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-blue-600 dark:text-blue-400 uppercase tracking-tighter">MESA {tableNumber}</span>
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 rounded text-[9px] font-bold uppercase">
                            {orders.length} {orders.length === 1 ? 'Pedido' : 'Pedidos'}
                        </span>
                    </div>
                </div>
                
                <div className="flex items-start gap-2">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${getStatusColor(mainStatus)}`}>
                        {mainStatus}
                    </span>
                    <button 
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                    >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                </div>
            </div>

            {/* Sub-orders Content */}
            <div className={`flex-grow space-y-3 mb-2 overflow-y-auto max-h-64 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 pr-1 ${!isExpanded ? 'hidden' : ''}`}>
                {[...orders]
                    .sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime())
                    .map((order, oIdx) => (
                    <div key={order.id} className={`${oIdx > 0 ? 'mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50' : ''}`}>
                        <div className="flex justify-between items-center mb-1.5">
                            <span className="font-bold text-[10px] text-gray-500">
                                #{order.dailyOrderNumber}-{oIdx + 1} • {new Date(order.timestamp || '').toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
                            </span>
                            <div className="flex gap-1">
                                <button
                                    onClick={() => onPrint({ ...order, subOrderIndex: oIdx + 1 })}
                                    className="p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                    title="Imprimir"
                                >
                                    <Printer size={14} />
                                </button>
                                <button
                                    onClick={() => onCancel(order)}
                                    className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                    title="Cancelar"
                                >
                                    <XCircle size={14} />
                                </button>
                            </div>
                        </div>
                        
                        <div className="space-y-1">
                            {(order.items || []).map((item, idx) => (
                                <div key={idx} className="text-xs text-gray-700 dark:text-gray-300 leading-tight flex justify-between">
                                    <span className="font-bold">{item.quantity}x {item.name}</span>
                                    <span className="text-gray-500 dark:text-gray-500 whitespace-nowrap ml-2">R$ {(item.price * item.quantity).toFixed(2)}</span>
                                </div>
                            ))}
                        </div>

                        {order.status !== 'Entregue' && (
                             <div className="mt-2 flex justify-between items-center">
                                <span className={`text-[10px] font-bold uppercase ${order.status === 'Novo' ? 'text-blue-500' : 'text-gray-500'}`}>{order.status}</span>
                                <button 
                                    onClick={() => onAdvanceStatus(order)}
                                    className="text-[10px] font-black text-blue-600 hover:underline active:scale-95 cursor-pointer flex items-center gap-1"
                                >
                                    AVANÇAR <CheckCircle size={12} />
                                </button>
                             </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Footer / Actions */}
            <div className="mt-auto pt-3 border-t border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-center mb-3">
                    <span className="text-[10px] font-black uppercase text-gray-400">Total da Mesa</span>
                    <span className="text-base font-bold text-gray-900 dark:text-gray-100">R$ {totalAmount.toFixed(2)}</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => {
                            const billingRequested = orders.find(o => o.status === 'Conta Solicitada');
                            if (billingRequested) {
                                onAdvanceStatus({ ...billingRequested, total: totalAmount });
                            } else {
                                const activeOrders = orders.filter(o => o.status !== 'Entregue' && o.status !== 'Cancelado');
                                // Prioritize advancing 'Novo' orders if the button is PRONTO
                                const novoOrder = activeOrders.find(o => o.status === 'Novo');
                                if (novoOrder) {
                                    onAdvanceStatus(novoOrder);
                                } else if (activeOrders.length > 0) {
                                    onAdvanceStatus(activeOrders[0]);
                                }
                            }
                        }}
                        className={`flex items-center justify-center gap-2 p-2 text-white font-bold rounded-lg transition-all active:scale-95 cursor-pointer text-[10px] min-h-[40px] shadow-sm ${action.color}`}
                    >
                        {action.label} {action.icon}
                    </button>
                    <button
                        onClick={() => onEdit(orders[0])}
                        className="flex items-center justify-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 rounded-lg transition-colors text-[10px] min-h-[40px] border border-blue-100 dark:border-blue-900/30"
                    >
                        ADICIONAR <PlusCircle size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TableGroupCard;
