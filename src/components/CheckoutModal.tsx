import React, { useState, useEffect } from 'react';
import { Order, PaymentMethod } from '../types';
import { X, DollarSign, CreditCard, Banknote, Calculator, Printer } from 'lucide-react';

interface CheckoutModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (paymentDetails: PaymentDetails) => Promise<void>;
    order: Order;
}

export interface PaymentDetails {
    method: PaymentMethod;
    amountTendered: number;
    change: number;
    discount: number;
    tax: number;
    finalTotal: number;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({ isOpen, onClose, onConfirm, order }) => {
    const [method, setMethod] = useState<PaymentMethod>('Dinheiro');
    const [amountTendered, setAmountTendered] = useState<string>('');
    const [discount, setDiscount] = useState<string>('');
    const [tax, setTax] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setMethod(order.paymentMethod || 'Dinheiro');
            setAmountTendered('');
            setDiscount('');
            setTax('');
        }
    }, [isOpen, order]);

    if (!isOpen) return null;

    const orderTotal = order.total;
    const discountValue = parseFloat(discount) || 0;
    const taxValue = parseFloat(tax) || 0;
    const finalTotal = Math.max(0, orderTotal - discountValue + taxValue);
    const tendered = parseFloat(amountTendered) || 0;
    const change = method === 'Dinheiro' ? Math.max(0, tendered - finalTotal) : 0;
    const remaining = Math.max(0, finalTotal - tendered);

    const handleConfirm = async () => {
        if (method === 'Dinheiro' && tendered < finalTotal) {
            alert('Valor recebido é menor que o total!');
            return;
        }

        setIsProcessing(true);
        try {
            await onConfirm({
                method,
                amountTendered: method === 'Dinheiro' ? tendered : finalTotal,
                change,
                discount: discountValue,
                tax: taxValue,
                finalTotal
            });
            onClose();
        } catch (error) {
            console.error("Checkout error:", error);
            alert("Erro ao finalizar pagamento.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="bg-gray-50 dark:bg-gray-700/50 p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                            <DollarSign className="text-green-600" />
                            Checkout
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Pedido #{order.dailyOrderNumber} • {order.customerName}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6 overflow-y-auto">
                    {/* Total Display */}
                    <div className="text-center">
                        <p className="text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total a Pagar</p>
                        <div className="text-4xl font-extrabold text-gray-900 dark:text-white my-2">
                            R$ {Number(finalTotal).toFixed(2)}
                        </div>
                        {discountValue > 0 && (
                            <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                                Desconto aplicado: -R$ {Number(discountValue).toFixed(2)}
                            </p>
                        )}
                        {taxValue > 0 && (
                            <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                                Taxa aplicada: +R$ {Number(taxValue).toFixed(2)}
                            </p>
                        )}
                    </div>

                    {/* Payment Method Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Forma de Pagamento</label>
                        <div className="grid grid-cols-3 gap-3">
                            <button
                                onClick={() => setMethod('Dinheiro')}
                                className={`p-3 rounded-lg border flex flex-col items-center gap-2 transition-all ${method === 'Dinheiro' ? 'bg-green-50 border-green-500 text-green-700 dark:bg-green-900/20 dark:border-green-500 dark:text-green-400 ring-1 ring-green-500' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                            >
                                <Banknote size={24} />
                                <span className="text-xs font-bold">Dinheiro</span>
                            </button>
                            <button
                                onClick={() => setMethod('PIX')}
                                className={`p-3 rounded-lg border flex flex-col items-center gap-2 transition-all ${method === 'PIX' ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/20 dark:border-blue-500 dark:text-blue-400 ring-1 ring-blue-500' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                            >
                                <div className="w-6 h-6 font-bold flex items-center justify-center border-2 border-current rounded text-[10px]">PIX</div>
                                <span className="text-xs font-bold">Pix</span>
                            </button>
                            <button
                                onClick={() => setMethod('Cartão')}
                                className={`p-3 rounded-lg border flex flex-col items-center gap-2 transition-all ${method === 'Cartão' ? 'bg-purple-50 border-purple-500 text-purple-700 dark:bg-purple-900/20 dark:border-purple-500 dark:text-purple-400 ring-1 ring-purple-500' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                            >
                                <CreditCard size={24} />
                                <span className="text-xs font-bold">Cartão</span>
                            </button>
                        </div>
                    </div>

                    {/* Money Inputs */}
                    {method === 'Dinheiro' && (
                        <div className="space-y-4 bg-gray-50 dark:bg-gray-700/30 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor Recebido</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">R$</span>
                                    <input
                                        type="number"
                                        value={amountTendered}
                                        onChange={e => setAmountTendered(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 text-lg font-bold border rounded-lg focus:ring-2 focus:ring-green-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                                        placeholder="0.00"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-600">
                                <span className="text-gray-600 dark:text-gray-400 font-medium">Troco</span>
                                <span className={`text-xl font-bold ${change > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                                    R$ {Number(change).toFixed(2)}
                                </span>
                            </div>
                            {remaining > 0 && (
                                <div className="flex justify-between items-center">
                                    <span className="text-red-500 text-sm">Faltam</span>
                                    <span className="text-red-500 font-bold">R$ {Number(remaining).toFixed(2)}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Discount and Tax Inputs */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* Discount Input */}
                        <div>
                            <button
                                onClick={() => setDiscount(discount ? '' : '0')}
                                className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 mb-2"
                            >
                                <Calculator size={14} />
                                {discount !== '' ? 'Remover Desconto' : 'Adicionar Desconto'}
                            </button>

                            {discount !== '' && (
                                <div className="animate-in fade-in slide-in-from-top-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Desconto (R$)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">R$</span>
                                        <input
                                            type="number"
                                            value={discount}
                                            onChange={e => setDiscount(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Tax Input */}
                        <div>
                            <button
                                onClick={() => setTax(tax ? '' : '0')}
                                className="text-sm text-red-600 dark:text-red-400 hover:underline flex items-center gap-1 mb-2"
                            >
                                <Calculator size={14} />
                                {tax !== '' ? 'Remover Taxa' : 'Adicionar Taxa'}
                            </button>

                            {tax !== '' && (
                                <div className="animate-in fade-in slide-in-from-top-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Taxa (R$)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">R$</span>
                                        <input
                                            type="number"
                                            value={tax}
                                            onChange={e => setTax(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 px-4 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg font-bold hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                        disabled={isProcessing}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isProcessing || (method === 'Dinheiro' && tendered < finalTotal)}
                        className="flex-2 w-full py-3 px-4 bg-green-600 dark:bg-green-700 text-white rounded-lg font-bold hover:bg-green-700 dark:hover:bg-green-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-600/20"
                    >
                        {isProcessing ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <>
                                <Printer size={20} />
                                Finalizar e Imprimir
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
