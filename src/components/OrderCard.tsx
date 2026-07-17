import React, { useState, useEffect } from 'react';
import { Order, OrderStatus, OrderType } from '../types';
import { Printer, XCircle, CheckCircle, Bike, PlusCircle, DollarSign, MapPin, Trash2, MessageCircle } from 'lucide-react';

interface OrderCardProps {
    order: Order;
    onPrint?: (order: Order) => void;
    onCancel?: (order: Order) => void;
    onDelete?: (order: Order) => void;
    onAdvanceStatus: (order: Order) => void;
    onUpdateStatus?: (order: Order, status: OrderStatus) => void;
    onEdit?: (order: Order) => void;
    onOpenMap?: (address: string) => void;
}

const OrderCard: React.FC<OrderCardProps> = ({ order, onPrint, onCancel, onDelete, onAdvanceStatus, onUpdateStatus, onEdit, onOpenMap }) => {
    const getStatusColor = (status: OrderStatus) => {
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

    const getNextAction = (currentStatus: OrderStatus, type: OrderType) => {
        if (currentStatus === 'Novo') {
            if (type === 'Entrega') {
                return { label: 'Em Produção', icon: <CheckCircle size={16} />, color: 'bg-green-600 hover:bg-green-700' };
            }
            return { label: 'Iniciar Preparo', icon: <CheckCircle size={16} />, color: 'bg-yellow-600 hover:bg-yellow-700' };
        }
        
        if (currentStatus === 'Em Produção') {
            if (type === 'Entrega') {
                return { label: 'Saiu p/ Entrega', icon: <Bike size={16} />, color: 'bg-purple-600 hover:bg-purple-700' };
            }
            return { label: 'Pronto', icon: <DollarSign size={16} />, color: 'bg-green-600 hover:bg-green-700' };
        }

        if (currentStatus === 'Conta Solicitada') {
            return { label: 'Fechar Comanda', icon: <CheckCircle size={16} />, color: 'bg-green-600 hover:bg-green-700' };
        }

        if (currentStatus === 'A Caminho') {
            return { label: 'No Portão', icon: <CheckCircle size={16} />, color: 'bg-orange-600 hover:bg-orange-700' };
        }

        if (currentStatus === 'No Portão') {
            return { label: 'Concluir', icon: <CheckCircle size={16} />, color: 'bg-green-600 hover:bg-green-700' };
        }

        // Default
        return { label: 'Concluir', icon: <CheckCircle size={16} />, color: 'bg-gray-600 hover:bg-gray-700' };
    };

    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(interval);
    }, []);

    const timeElapsed = order.timestamp ? Math.floor((now - new Date(order.timestamp).getTime()) / 60000) : 0;
    const action = getNextAction(order.status, order.orderType);

    const isExternalOrder = order.origin === 'IA' || order.origin === 'App';

    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow p-3 flex flex-col h-full text-xs">
            {/* Header */}
            <div className="flex justify-between items-start mb-2">
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-gray-800 dark:text-white">#{order.dailyOrderNumber}</span>
                        {isExternalOrder && (
                            <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 rounded text-[9px] font-bold">
                                {order.origin}
                            </span>
                        )}
                    </div>
                    <span className={`text-[10px] font-medium ${timeElapsed > 30 ? 'text-red-500' : 'text-gray-500'}`}>
                        {timeElapsed} min
                    </span>
                </div>
                
                <div className="flex items-start gap-2">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${getStatusColor(order.status)}`}>
                        {order.status}
                    </span>
                    {onCancel && order.status !== 'Cancelado' && order.status !== 'Entregue' && (
                        <button
                            onClick={() => onCancel(order)}
                            className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            title="Cancelar Pedido"
                        >
                            <XCircle size={18} />
                        </button>
                    )}
                </div>
            </div>

            {/* Customer Info */}
            <div className="mb-3 border-b border-gray-100 dark:border-gray-700 pb-2">
                <h3 className="font-bold text-sm text-gray-800 dark:text-gray-100 truncate">{order.customerName}</h3>
                {order.orderType === 'Entrega' && (
                    <div className="mt-1">
                        <p className="text-xs text-gray-600 dark:text-gray-400 leading-tight">
                            {order.address}
                        </p>
                        {order.referencePoint && <span className="block text-[10px] italic mt-0.5 text-gray-500">Ref: {order.referencePoint}</span>}

                        {onOpenMap && order.address && (
                            <button
                                onClick={() => onOpenMap(order.address!)}
                                className="mt-1 flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium text-[10px]"
                            >
                                <MapPin size={12} /> Abrir no Mapa
                            </button>
                        )}
                    </div>
                )}
                {order.table_number && !order.customerName.toLowerCase().includes(`mesa ${order.table_number}`) && (
                    <p className="text-xs font-bold text-blue-600 dark:text-blue-400 mt-1">Mesa {order.table_number}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-gray-500 dark:text-gray-500">{order.phone}</p>
                    {order.phone && (
                        <button
                            onClick={() => {
                                const phone = order.phone?.replace(/\D/g, '');
                                if (phone) window.open(`https://wa.me/55${phone}`, '_blank');
                            }}
                            className="flex items-center gap-1 text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40 dark:text-green-400 px-2 py-0.5 rounded transition-colors"
                            title="Chamar no WhatsApp"
                        >
                            <MessageCircle size={12} />
                            <span className="text-[10px] font-bold uppercase">Ligar</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Items */}
            <div className="flex-grow space-y-1 mb-2 overflow-y-auto max-h-32 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 pr-1">
                {(order.items || []).map((item, idx) => {
                    const itemComboPrice = item.isCombo ? (order.comboPrice || 13) : 0;
                    const unitPrice = Number(item.price || 0);
                    const itemTotal = (unitPrice + itemComboPrice + (item.selectedAddons || []).reduce((sum, addon) => sum + (addon.price || 0), 0)) * item.quantity;
                    
                    return (
                        <div key={idx} className="text-xs text-gray-700 dark:text-gray-300 leading-tight border-b border-gray-50 dark:border-gray-700/50 last:border-0 pb-1 last:pb-0">
                            <div className="flex justify-between items-start">
                                <span className="font-bold">
                                    {item.quantity}x {item.name}
                                    {item.isCombo && <span className="ml-1 text-[10px] text-purple-600 dark:text-purple-400 font-black tracking-tighter">(COMBO)</span>}
                                </span>
                                <span className="text-gray-500 dark:text-gray-500 whitespace-nowrap ml-2">
                                    R$ {itemTotal.toFixed(2)}
                                </span>
                            </div>
                            {(item.selectedAddons || []).length > 0 && (
                                <div className="text-[10px] text-gray-500 dark:text-gray-400 pl-2 mt-0.5">
                                    + {(item.selectedAddons || []).map(a => a.name).join(', ')}
                                </div>
                            )}
                            {item.notes && <div className="text-[10px] text-red-500 dark:text-red-400 pl-2 italic mt-0.5">Obs: {item.notes}</div>}
                        </div>
                    );
                })}
                {order.observation && (
                    <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-900/30 rounded text-[10px] text-yellow-800 dark:text-yellow-200 italic">
                        <strong>Obs Geral:</strong> {order.observation}
                    </div>
                )}
            </div>

            {/* Footer / Actions */}
            <div className="mt-auto pt-3 border-t border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{order.paymentMethod}</span>
                    <div className="text-right">
                        {order.deliveryFee && Number(order.deliveryFee) > 0 ? (
                            <div className="text-[10px] text-gray-500 font-bold mb-0.5">
                                Entrega: + R$ {Number(order.deliveryFee).toFixed(2)}
                            </div>
                        ) : null}
                        {order.discount && order.discount > 0 ? (
                            <div className="text-[10px] text-green-600 dark:text-green-400 font-bold mb-0.5">
                                Desconto Fidelidade: - R$ {order.discount.toFixed(2)}
                            </div>
                        ) : null}
                        <span className="text-base font-bold text-gray-900 dark:text-gray-100">
                            R$ {(order.total || 0).toFixed(2)}
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                    {onPrint && (
                        <button
                            onClick={() => onPrint(order)}
                            className="col-span-1 flex items-center justify-center p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-gray-600 dark:text-gray-300 transition-all active:scale-95 cursor-pointer"
                            title="Imprimir"
                        >
                            <Printer size={18} />
                        </button>
                    )}

                    {onDelete && (order.status === 'Cancelado' || order.status === 'Entregue') && (
                        <button
                            onClick={() => onDelete(order)}
                            className="col-span-1 flex items-center justify-center p-2 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 rounded-lg text-red-700 dark:text-red-300 transition-colors"
                            title="Excluir"
                        >
                            <Trash2 size={18} />
                        </button>
                    )}

                    {onEdit && (
                        <button
                            onClick={() => onEdit(order)}
                            className={`col-span-1 flex items-center justify-center p-2 rounded-lg transition-colors ${isExternalOrder ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100'}`}
                            title="Editar Pedido"
                        >
                            <PlusCircle size={18} />
                        </button>
                    )}

                    {onUpdateStatus && order.orderType === 'Entrega' && (order.status === 'A Caminho' || order.status === 'No Portão') ? (
                        /* Flexible Courier Buttons */
                        <div className="col-span-4 grid grid-cols-3 gap-2 mt-1">
                            <button
                                onClick={() => onUpdateStatus(order, 'A Caminho')}
                                className="flex flex-col items-center justify-center p-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all active:scale-95 cursor-pointer text-[10px] font-bold"
                            >
                                <Bike size={14} className="mb-0.5" />
                                Saiu
                            </button>
                            <button
                                onClick={() => onUpdateStatus(order, 'No Portão')}
                                className="flex flex-col items-center justify-center p-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-all active:scale-95 cursor-pointer text-[10px] font-bold"
                            >
                                <MapPin size={14} className="mb-0.5" />
                                Portão
                            </button>
                            <button
                                onClick={() => onUpdateStatus(order, 'Entregue')}
                                className="flex flex-col items-center justify-center p-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all active:scale-95 cursor-pointer text-[10px] font-bold"
                            >
                                <CheckCircle size={14} className="mb-0.5" />
                                Entregue
                            </button>
                        </div>
                    ) : (
                        /* Standard Sequential Flow (Admin/Waiter) + Direct Finalize */
                        <div className="col-span-4 grid grid-cols-2 gap-2">
                            <button
                                onClick={() => onAdvanceStatus(order)}
                                className={`flex items-center justify-center gap-2 p-2 text-white font-bold rounded-lg transition-all active:scale-95 cursor-pointer text-[10px] min-h-[40px] ${action.color}`}
                            >
                                {action.label} {action.icon}
                            </button>
                            {onUpdateStatus && order.status !== 'Entregue' && order.status !== 'Cancelado' && (
                                <button
                                    onClick={() => onUpdateStatus(order, 'Entregue')}
                                    className="flex items-center justify-center gap-2 p-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-all active:scale-95 cursor-pointer text-[10px] min-h-[40px]"
                                >
                                    Finalizar <CheckCircle size={14} />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OrderCard;
