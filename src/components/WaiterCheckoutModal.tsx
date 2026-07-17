import React, { useState, useEffect } from 'react';
import { X, DollarSign, CreditCard, Banknote } from 'lucide-react';
import { PaymentMethod } from '../types';

interface WaiterCheckoutModalProps {
    isOpen: boolean;
    onClose: () => void;
    total: number;
    onConfirm: (paymentMethod: PaymentMethod, changeFor?: number) => void;
    tableName: string;
}

export const WaiterCheckoutModal: React.FC<WaiterCheckoutModalProps> = ({ isOpen, onClose, total, onConfirm, tableName }) => {
    const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
    const [amountReceived, setAmountReceived] = useState<string>('');
    const [change, setChange] = useState<number>(0);

    useEffect(() => {
        if (selectedMethod !== 'Dinheiro') {
            setAmountReceived('');
            setChange(0);
        }
    }, [selectedMethod]);

    useEffect(() => {
        if (amountReceived) {
            const received = parseFloat(amountReceived.replace(',', '.'));
            if (!isNaN(received)) {
                setChange(Math.max(0, received - total));
            } else {
                setChange(0);
            }
        } else {
            setChange(0);
        }
    }, [amountReceived, total]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        if (!selectedMethod) return;
        
        if (selectedMethod === 'Dinheiro') {
            const received = parseFloat(amountReceived.replace(',', '.'));
            if (isNaN(received) || received < total) {
                alert('Valor recebido deve ser maior ou igual ao total.');
                return;
            }
            onConfirm(selectedMethod, received);
        } else {
            onConfirm(selectedMethod);
        }
    };

    const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    return (
        <div className="fixed inset-0 bg-black/90 z-[70] flex items-end justify-center animate-fade-in p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl p-6 border border-gray-200 dark:border-gray-800 shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Fechar Conta</h2>
                        <p className="text-gray-500 text-sm font-bold">{tableName}</p>
                    </div>
                    <button onClick={onClose} className="bg-gray-100 dark:bg-gray-800 p-2 rounded-full text-gray-500 hover:text-red-500 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-2xl mb-6 text-center border border-gray-200 dark:border-gray-700">
                    <p className="text-gray-500 text-sm font-bold uppercase mb-1">Total a Pagar</p>
                    <p className="text-4xl font-black text-primary">{formatCurrency(total)}</p>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-6">
                    <button 
                        onClick={() => setSelectedMethod('Dinheiro')}
                        className={`p-4 rounded-xl flex flex-col items-center justify-center gap-2 border-2 transition-all ${selectedMethod === 'Dinheiro' ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-500'}`}
                    >
                        <Banknote size={24} />
                        <span className="font-bold text-xs">DINHEIRO</span>
                    </button>
                    <button 
                        onClick={() => setSelectedMethod('Cartão')}
                        className={`p-4 rounded-xl flex flex-col items-center justify-center gap-2 border-2 transition-all ${selectedMethod === 'Cartão' ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-500'}`}
                    >
                        <CreditCard size={24} />
                        <span className="font-bold text-xs">CARTÃO</span>
                    </button>
                    <button 
                        onClick={() => setSelectedMethod('PIX')}
                        className={`p-4 rounded-xl flex flex-col items-center justify-center gap-2 border-2 transition-all ${selectedMethod === 'PIX' ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-500'}`}
                    >
                        <DollarSign size={24} />
                        <span className="font-bold text-xs">PIX</span>
                    </button>
                </div>

                {selectedMethod === 'Dinheiro' && (
                    <div className="mb-6 space-y-4 animate-nav-slide-in">
                        <div>
                            <label className="block text-sm font-bold text-gray-500 mb-1 ml-1">Valor Recebido</label>
                            <input 
                                type="number" 
                                className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-xl font-bold text-gray-900 dark:text-white outline-none focus:border-primary transition-colors"
                                placeholder="R$ 0,00"
                                value={amountReceived}
                                onChange={e => setAmountReceived(e.target.value)}
                                autoFocus
                            />
                        </div>
                        {change > 0 && (
                            <div className="flex justify-between items-center bg-green-100 dark:bg-green-950/30 p-4 rounded-xl border border-green-200 dark:border-green-900/50">
                                <span className="font-black text-green-700 dark:text-green-500 uppercase">Troco</span>
                                <span className="font-black text-2xl text-green-700 dark:text-green-400">{formatCurrency(change)}</span>
                            </div>
                        )}
                    </div>
                )}

                <button 
                    onClick={handleConfirm}
                    disabled={!selectedMethod || (selectedMethod === 'Dinheiro' && (!amountReceived || parseFloat(amountReceived) < total))}
                    className="w-full py-4 bg-primary text-background font-black rounded-xl uppercase shadow-lg text-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
                >
                    Confirmar Pagamento
                </button>
            </div>
        </div>
    );
};
