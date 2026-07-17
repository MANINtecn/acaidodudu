import React, { useState, useEffect } from 'react';
import { X as LucideX, History as LucideHistory, Repeat as LucideRepeat, Utensils as LucideUtensils, Package, Clock, Truck, MapPin, AlertCircle } from 'lucide-react';
import { fetchCustomerLoyaltyHistory, submitBolaoGuess, fetchBolaoGuessByPhone, fetchPublicSettings } from '../services/supabaseService';
import { normalizeString } from '../utils/searchUtils';
import { MIN_ORDER_VALUE } from '../constants';


// Types (Inlined for stability)
type PaymentMethod = 'Dinheiro' | 'Cartão' | 'PIX';
type OrderType = 'Entrega' | 'Balcão' | 'Retirada';
type OrderStatus = 'Novo' | 'Em Produção' | 'A Caminho' | 'No Portão' | 'Entregue' | 'Cancelado' | 'Conta Solicitada';

interface Customer {
    id: string;
    store_id: string;
    phone: string;
    name: string;
    address?: string;
    reference_point?: string;
    total_orders: number;
    last_order_at?: string;
}

interface Addon {
    id: string;
    name: string;
    price: number;
    isAvailable: boolean;
    categoryId?: number;
    store_id: string;
    daysOfWeek?: string[];
}
interface MenuItem {
    id: number;
    name: string;
    description: string;
    price: number;
    image?: string;
    categoryId: number;
    eligibleForCombo: boolean;
    isCombo: boolean;
    selectedAddons: Addon[];
    store_id: string;
    isAvailable: boolean;
    allowedAddons?: string[];
    addons?: Addon[];
}
interface CartItem extends MenuItem {
    cartId: string;
    quantity: number;
    notes: string;
}

interface Order {
    id?: string;
    timestamp?: string;
    dailyOrderNumber: number;
    customerName: string;
    phone?: string;
    address?: string;
    referencePoint?: string;
    orderType: OrderType;
    paymentMethod: PaymentMethod;
    status: OrderStatus;
    changeFor?: string;
    items: CartItem[];
    total: number;
    store_id: string;
    printed?: boolean;
    observation?: string;
    table_number?: number;
    comandaNumber?: number;
    discount?: number;
    tax?: number;
    rating?: number;
    feedback?: string;
    deliveryFee?: number;
    comboPrice?: number;
    origin?: string;
}

export type PendingReward = { type: 'item', item: MenuItem } | { type: 'discount', value: number } | null;

interface LoyaltyProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    customer: Customer | null;
    lastOrder: Order | null;
    onRepeatOrder: (customItems?: CartItem[], observation?: string) => void;
    onNewOrder: () => void;
    isLoadingRepeat: boolean;
    storeId: string;
    isStoreOpen: boolean;
    onUpdateAddress?: (address: string, number: string, reference: string, paymentMethod?: PaymentMethod, changeFor?: string) => Promise<void>;
    onTriggerReward: () => void;
    pendingReward: PendingReward;
    dynamicDeliveryFee: number | null;
}

const LoyaltyProfileModal: React.FC<LoyaltyProfileModalProps> = ({ isOpen, onClose, customer, lastOrder, onRepeatOrder, onNewOrder, isLoadingRepeat, storeId, isStoreOpen, onUpdateAddress, onTriggerReward, pendingReward, dynamicDeliveryFee }) => {
    const [loyaltyHistory, setLoyaltyHistory] = useState<Order[]>([]);
    const [isLoadingLoyalty, setIsLoadingLoyalty] = useState(true);

    const [isEditingAddress, setIsEditingAddress] = useState(false);
    const [editAddress, setEditAddress] = useState('');
    const [editNumber, setEditNumber] = useState('');
    const [editReference, setEditReference] = useState('');
    const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>('Dinheiro');
    const [editChangeFor, setEditChangeFor] = useState('');
    const [isSavingAddress, setIsSavingAddress] = useState(false);
    const [itemsToRepeat, setItemsToRepeat] = useState<CartItem[]>([]);
    const [bolaoGuess, setBolaoGuess] = useState({ brazil: '', opponent: '' });
    const [hasGuessed, setHasGuessed] = useState(false);
    const [isSubmittingGuess, setIsSubmittingGuess] = useState(false);
    const [bolaoStatus, setBolaoStatus] = useState<'loading' | 'open' | 'closed' | 'not_started'>('loading');
    const [bolaoStartTime, setBolaoStartTime] = useState<number | null>(null);
    const [countdown, setCountdown] = useState<string>('');

    useEffect(() => {
        if (isOpen && customer && storeId) {
            fetchPublicSettings(storeId).then(settings => {
                const now = new Date().getTime();
                // Padrão: Sábado (13/06/2026) às 13:00 até 18:00
                const defaultStart = new Date('2026-06-13T13:00:00-03:00').getTime();
                const defaultEnd = new Date('2026-06-13T18:00:00-03:00').getTime();

                const start = (settings as any).bolaoStartTime ? new Date((settings as any).bolaoStartTime).getTime() : defaultStart;
                const end = (settings as any).bolaoEndTime ? new Date((settings as any).bolaoEndTime).getTime() : defaultEnd;

                if (start) setBolaoStartTime(start);

                if (start && now < start) {
                    setBolaoStatus('not_started');
                } else if (end && now > end) {
                    setBolaoStatus('closed');
                } else {
                    setBolaoStatus('open');
                }
            }).catch(console.error);

            fetchBolaoGuessByPhone(customer.phone, storeId).then(guess => {
                if (guess) {
                    setBolaoGuess({ brazil: guess.brazil_score.toString(), opponent: guess.opponent_score.toString() });
                    setHasGuessed(true);
                } else {
                    setBolaoGuess({ brazil: '', opponent: '' });
                    setHasGuessed(false);
                }
            }).catch(console.error);
        }
    }, [isOpen, customer, storeId]);

    const handleBolaoSubmit = async () => {
        if (!customer || !storeId) return;
        setIsSubmittingGuess(true);
        try {
            await submitBolaoGuess(storeId, customer.phone, parseInt(bolaoGuess.brazil), parseInt(bolaoGuess.opponent));
            setHasGuessed(true);
        } catch (error) {
            console.error("Error submitting bolão guess:", error);
            alert("Erro ao salvar palpite. Já existe um palpite para este número?");
        } finally {
            setIsSubmittingGuess(false);
        }
    };

    useEffect(() => {
        if (bolaoStatus !== 'not_started' || !bolaoStartTime) return;

        const updateCountdown = () => {
            const now = new Date().getTime();
            const distance = bolaoStartTime - now;

            if (distance <= 0) {
                setBolaoStatus('open');
                setCountdown('');
                return;
            }

            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            let timeStr = '';
            if (days > 0) timeStr += `${days}d `;
            timeStr += `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            setCountdown(timeStr);
        };

        updateCountdown();
        const interval = setInterval(updateCountdown, 1000);
        return () => clearInterval(interval);
    }, [bolaoStatus, bolaoStartTime]);

    useEffect(() => {
        if (!isOpen) {
            setItemsToRepeat([]);
        } else if (lastOrder) {
            // 1. Filter valid items from last order
            const baseItems: CartItem[] = lastOrder.items.filter((item: any) =>
                item.price > 0 &&
                !normalizeString(item.name).includes('fidelidade') &&
                !normalizeString(item.notes || '').includes('fidelidade')
            ).map((item: any) => ({ // Deep copy to allow editing
                ...item,
                cartId: `repeat-${Math.random().toString(36).substr(2, 9)}`, // New cart IDs
                notes: item.notes || '' // Preserve existing notes or empty
            }));

            // 2. Add Pending Reward Item if applicable
            if (pendingReward?.type === 'item') {
                baseItems.push({
                    ...pendingReward.item,
                    cartId: `reward-${Date.now()}`,
                    quantity: 1,
                    notes: 'Fidelidade - GRÁTIS',
                    price: 0
                });
            }

            setItemsToRepeat(baseItems);
        }
    }, [isOpen, lastOrder, pendingReward]);

    // Handle Note Change
    const handleItemNoteChange = (index: number, newNote: string) => {
        const newItems = [...itemsToRepeat];
        newItems[index].notes = newNote;
        setItemsToRepeat(newItems);
    };

    useEffect(() => {
        if (isOpen && customer && storeId) {
            setIsLoadingLoyalty(true);
            fetchCustomerLoyaltyHistory(customer.phone, storeId)
                .then(orders => setLoyaltyHistory(orders || []))
                .catch(err => console.error("Failed to fetch loyalty:", err))
                .finally(() => setIsLoadingLoyalty(false));

            const parts = (customer.address || '').split(',');
            if (parts.length > 1) {
                setEditAddress(parts[0].trim());
                setEditNumber(parts[1].trim());
            } else {
                setEditAddress(customer.address || '');
                setEditNumber('');
            }
            setEditReference(customer.reference_point || '');

            if (lastOrder) {
                setEditPaymentMethod(lastOrder.paymentMethod);
                setEditChangeFor(lastOrder.changeFor || '');
            }
        }
    }, [isOpen, customer, storeId, lastOrder]);

    const totalStamps = loyaltyHistory.length;
    const currentProgress = totalStamps % 10;
    const rewardsAvailable = Math.floor(totalStamps / 10);

    const handleSaveAddress = async () => {
        if (!onUpdateAddress) return;
        setIsSavingAddress(true);
        try {
            await onUpdateAddress(editAddress, editNumber, editReference, editPaymentMethod, editChangeFor);
            setIsEditingAddress(false);
        } catch (error) {
            console.error(error);
            alert("Erro ao atualizar endereço.");
        } finally {
            setIsSavingAddress(false);
        }
    };

    // Calculate total with pending reward discount if applicable
    const calculateTotalWithReward = () => {
        if (!lastOrder) return 0;
        
        // Use the last order subtotal (total - previous fee) - BUT wait, it's safer to recalculate items
        const itemsTotal = itemsToRepeat.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        // Use the new dynamic fee if available, otherwise fallback to last order fee
        const fee = dynamicDeliveryFee !== null ? dynamicDeliveryFee : (lastOrder.deliveryFee || 0);

        let total = itemsTotal + fee;

        if (pendingReward?.type === 'discount') {
            total = Math.max(0, total - pendingReward.value);
        }

        return total;
    };

    const finalTotal = calculateTotalWithReward();


    if (!isOpen || !customer) return null;

    return (
        <div 
            className="fixed inset-0 bg-black/90 z-[70] flex items-start md:items-center justify-center overflow-y-auto p-0 md:p-4 animate-fade-in backdrop-blur-sm cursor-pointer"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="bg-gray-900 rounded-none md:rounded-2xl w-full max-w-4xl shadow-2xl border-none md:border border-primary/30 relative h-auto md:max-h-[90vh] md:overflow-y-auto flex flex-col md:flex-row pb-12 md:pb-0 cursor-default">
                <button onClick={onClose} className="absolute top-3 right-3 text-red-500 hover:text-red-400 transition-colors z-[80] bg-black/40 rounded-full p-2">
                    <LucideX className="w-6 h-6" />
                </button>

                <div className="w-full md:w-1/2 p-6 bg-gray-900 border-b md:border-b-0 md:border-r border-gray-700 flex flex-col">
                    <div className="text-center mb-6">
                        <h2 className="text-lg font-display text-white mb-4">Olá, {customer.name.split(' ')[0]}!</h2>
                        
                        <div className="bg-gradient-to-br from-green-700 to-yellow-600 rounded-2xl p-5 shadow-2xl border border-yellow-400/30 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-400/20 rounded-full filter blur-[30px]"></div>
                            
                            <h2 className="text-2xl font-black text-white uppercase tracking-widest mb-1 relative z-10 drop-shadow-md">🏆 Bolão da Copa</h2>
                            <p className="text-[9px] text-yellow-200/80 uppercase tracking-widest font-black mb-3 relative z-10 flex items-center justify-center gap-1">
                                <MapPin size={10} /> MetLife Stadium, Nova Jersey (EUA)
                            </p>
                            <p className="text-[11px] text-white/90 mb-4 relative z-10 font-medium leading-tight">
                                O primeiro que acertar o placar ganha uma <strong className="text-yellow-400">Batata Grande Cheddar e Bacon</strong>! Válido para consumo no local.
                            </p>
                            
                            <div className="flex items-center justify-center gap-4 relative z-10">
                                <div className="flex flex-col items-center">
                                    <span className="text-[10px] font-black text-white mb-1.5 uppercase tracking-wider">Brasil 🇧🇷</span>
                                    <input 
                                        type="number" 
                                        min="0" 
                                        max="15" 
                                        value={bolaoGuess.brazil}
                                        onChange={(e) => setBolaoGuess({ ...bolaoGuess, brazil: e.target.value })}
                                        disabled={hasGuessed || bolaoStatus !== 'open'}
                                        className="w-16 h-16 bg-black/40 backdrop-blur-md border border-white/30 rounded-xl text-center text-3xl font-black text-yellow-400 outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/50 transition-all placeholder-white/20 disabled:opacity-50" 
                                        placeholder="0" 
                                    />
                                </div>
                                <span className="text-2xl font-black text-white/50 pt-5">X</span>
                                <div className="flex flex-col items-center">
                                    <span className="text-[10px] font-black text-white mb-1.5 uppercase tracking-wider">Marrocos 🇲🇦</span>
                                    <input 
                                        type="number" 
                                        min="0" 
                                        max="15" 
                                        value={bolaoGuess.opponent}
                                        onChange={(e) => setBolaoGuess({ ...bolaoGuess, opponent: e.target.value })}
                                        disabled={hasGuessed || bolaoStatus !== 'open'}
                                        className="w-16 h-16 bg-black/40 backdrop-blur-md border border-white/30 rounded-xl text-center text-3xl font-black text-white outline-none focus:border-white focus:ring-2 focus:ring-white/50 transition-all placeholder-white/20 disabled:opacity-50" 
                                        placeholder="0" 
                                    />
                                </div>
                            </div>
                            
                            {bolaoStatus === 'not_started' && !hasGuessed && (
                                <div className="mt-3 relative z-10 flex flex-col items-center bg-black/40 backdrop-blur-md py-2 px-3 rounded-xl border border-yellow-400/20">
                                    <p className="text-[9px] text-yellow-300 font-bold uppercase tracking-widest text-center mb-0.5">
                                        Palpites liberados em:
                                    </p>
                                    <span className="text-xl font-black text-white font-mono tracking-widest drop-shadow-md">
                                        {countdown}
                                    </span>
                                </div>
                            )}

                            {bolaoStatus === 'closed' && !hasGuessed && (
                                <p className="text-[10px] text-red-400 mt-3 relative z-10 font-bold tracking-wider text-center bg-red-400/10 py-1 rounded-md">
                                    Bolão Encerrado. O jogo já vai começar!
                                </p>
                            )}

                            {hasGuessed && (
                                <p className="text-[10px] text-green-400 mt-3 relative z-10 font-bold uppercase tracking-wider text-center bg-green-400/10 py-1 rounded-md">
                                    Palpite válido! Boa sorte!
                                </p>
                            )}

                            <button 
                                onClick={handleBolaoSubmit}
                                disabled={hasGuessed || bolaoGuess.brazil === '' || bolaoGuess.opponent === '' || isSubmittingGuess || bolaoStatus !== 'open'}
                                className="mt-3 w-full py-3 bg-yellow-400 hover:bg-yellow-300 disabled:bg-gray-500 disabled:text-white text-black rounded-xl text-xs font-black transition-all uppercase tracking-widest shadow-[0_0_15px_rgba(250,204,21,0.4)] disabled:shadow-none hover:scale-[1.02] active:scale-95 flex items-center justify-center"
                            >
                                {bolaoStatus === 'loading' ? 'Carregando...' : bolaoStatus === 'not_started' ? 'Aguarde o Início' : bolaoStatus === 'closed' ? (hasGuessed ? 'Palpite Registrado!' : 'Encerrado') : isSubmittingGuess ? 'Salvando...' : (hasGuessed ? 'Palpite Registrado!' : 'Enviar Meu Palpite')}
                            </button>
                        </div>

                        


                    </div>

                    <div className="flex-grow">
                        {lastOrder ? (
                            <div className="bg-background/50 rounded-xl p-4 border-2 border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.1)] relative">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <LucideHistory size={12} /> Último Pedido
                                </h3>
                                <div className="space-y-3 mb-4 max-h-[250px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-800 pr-2">
                                    {itemsToRepeat.map((item, idx) => (
                                        <div key={idx} className="bg-black/20 rounded p-2 border border-gray-800">
                                            <div className="flex justify-between text-sm text-gray-200 mb-2">
                                                <span className={`font-medium ${item.price === 0 ? 'text-yellow-500' : ''}`}>
                                                    {item.quantity}x {item.name}
                                                </span>
                                                {item.price === 0 && <span className="text-xs text-yellow-500 font-bold bg-yellow-500/10 px-2 rounded">GRÁTIS</span>}
                                            </div>
                                            <input
                                                value={item.notes || ''}
                                                onChange={(e) => handleItemNoteChange(idx, e.target.value)}
                                                placeholder="Observação (Ex: Sem cebola...)"
                                                className="w-full bg-gray-900 border border-gray-700/50 rounded px-2 py-1 text-xs text-gray-300 focus:border-green-500 outline-none transition-colors placeholder-gray-600"
                                            />
                                        </div>
                                    ))}

                                    {/* Show discount info if applicable */}
                                    {pendingReward?.type === 'discount' && (
                                        <div className="flex justify-between text-sm text-yellow-500 font-bold border-b border-gray-800 last:border-0 py-1 animate-pulse px-2">
                                            <span>Desconto Fidelidade</span>
                                            <span>- R$ {pendingReward.value.toFixed(2)}</span>
                                        </div>
                                    )}

                                    {itemsToRepeat.length === 0 && !pendingReward && (
                                        <p className="text-gray-500 text-sm italic py-2 text-center">Nenhum item válido para repetir.</p>
                                    )}
                                </div>

                                <div className="mb-4 text-xs text-gray-400 bg-black/20 p-2 rounded border border-white/5 flex flex-col gap-2">
                                    <div className="flex justify-between items-center">
                                        <span>Pagamento: <span className="text-white font-medium">{lastOrder.paymentMethod}</span></span>
                                        {lastOrder.paymentMethod === 'Dinheiro' && lastOrder.changeFor && <span>Troco: <span className="text-white">R$ {parseFloat(lastOrder.changeFor).toFixed(2)}</span></span>}
                                    </div>
                                    
                                    {lastOrder.paymentMethod === 'PIX' && (
                                        <div className="bg-gray-800 rounded p-3 flex flex-col gap-1 animate-fade-in border border-gray-700">
                                            <p className="text-[10px] font-bold text-white flex items-center gap-1">
                                                <span className="text-yellow-500">ℹ️</span> Pagamento via PIX
                                            </p>
                                            <p className="text-[9px] text-gray-400 leading-tight">
                                                O motoboy ou atendente fornecerá o QR Code no momento do pagamento.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-4 mb-4 text-xs text-text-light bg-black/30 p-3 rounded-xl border border-white/5 w-full text-left relative group">
                                    {!isEditingAddress ? (
                                        <>
                                            <div className="flex justify-between items-start">
                                                <p className="font-bold text-gray-300 mb-1 flex items-center gap-1"><span className="text-yellow-500">📍</span> Endereço de Entrega:</p>
                                                <button
                                                    onClick={() => setIsEditingAddress(true)}
                                                    className="text-[10px] text-primary hover:text-white border border-primary/30 hover:bg-primary/10 px-2 py-0.5 rounded transition-colors"
                                                    title="Editar Endereço"
                                                >
                                                    Editar Dados
                                                </button>
                                            </div>
                                            {customer.address ? (
                                                <>
                                                    <p className="text-sm text-white leading-tight">{customer.address}</p>
                                                    {customer.reference_point && <p className="italic mt-1 text-gray-500 border-t border-gray-700/50 pt-1">Ref: {customer.reference_point}</p>}
                                                </>
                                            ) : (
                                                <p className="text-gray-500 italic">Nenhum endereço cadastrado</p>
                                            )}
                                        </>
                                    ) : (
                                        <div className="space-y-3 animate-fade-in">
                                            <input
                                                value={editAddress}
                                                onChange={e => setEditAddress(e.target.value)}
                                                placeholder="Rua / Avenida"
                                                className="w-full bg-gray-800 border-none rounded px-2 py-1 text-xs text-white placeholder-gray-500 focus:ring-1 focus:ring-primary"
                                            />
                                            <div className="flex gap-2">
                                                <input
                                                    value={editNumber}
                                                    onChange={e => setEditNumber(e.target.value)}
                                                    placeholder="Número"
                                                    className="w-1/3 bg-gray-800 border-none rounded px-2 py-2 text-xs text-white placeholder-gray-500 focus:ring-1 focus:ring-primary"
                                                />
                                                <input
                                                    value={editReference}
                                                    onChange={e => setEditReference(e.target.value)}
                                                    placeholder="Referência (Opcional)"
                                                    className="w-2/3 bg-gray-800 border-none rounded px-2 py-2 text-xs text-white placeholder-gray-500 focus:ring-1 focus:ring-primary"
                                                />
                                            </div>

                                            <div className="border-t border-gray-700/50 pt-2 mt-2">
                                                <p className="mb-1 text-gray-400">Forma de Pagamento:</p>
                                                <div className="flex gap-2">
                                                    <select
                                                        value={editPaymentMethod}
                                                        onChange={e => setEditPaymentMethod(e.target.value as PaymentMethod)}
                                                        className="bg-gray-800 border-none rounded px-2 py-1 text-xs text-white focus:ring-1 focus:ring-primary flex-grow"
                                                    >
                                                        <option value="Cartão">Cartão</option>
                                                        <option value="Dinheiro">Dinheiro</option>
                                                        <option value="PIX">PIX</option>
                                                    </select>
                                                </div>
                                                {editPaymentMethod === 'Dinheiro' && (
                                                    <div className="mt-2 flex items-center gap-2 animate-fade-in">
                                                        <label className="whitespace-nowrap text-gray-400">Troco para:</label>
                                                        <input
                                                            type="number"
                                                            value={editChangeFor}
                                                            onChange={e => setEditChangeFor(e.target.value)}
                                                            placeholder="R$ 50,00"
                                                            className="w-full bg-gray-800 border-none rounded px-2 py-2 text-xs text-white placeholder-gray-500 focus:ring-1 focus:ring-primary"
                                                        />
                                                    </div>
                                                )}
                                                {editPaymentMethod === 'PIX' && (
                                                    <div className="mt-2 bg-gray-800 rounded p-3 flex flex-col gap-2 border border-primary/20 animate-fade-in">
                                                        <div className="flex items-start gap-2">
                                                            <span className="text-yellow-500">ℹ️</span>
                                                            <div>
                                                                <p className="text-[10px] font-bold text-white">Pagamento via PIX:</p>
                                                                <p className="text-[9px] text-gray-400 leading-tight">
                                                                    O QR Code ou chave PIX será fornecida no momento do pagamento (entrega ou balcão).
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex justify-end gap-2 mt-4">
                                                <button
                                                    onClick={() => setIsEditingAddress(false)}
                                                    className="text-xs text-gray-400 hover:text-white px-3 py-2"
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    onClick={handleSaveAddress}
                                                    disabled={isSavingAddress}
                                                    className="text-xs bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-bold transition-colors disabled:opacity-50"
                                                >
                                                    {isSavingAddress ? 'Salvando...' : 'Salvar'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Upsell Tip */}
                                {finalTotal < 35 && (
                                    <div className="mb-3 bg-blue-500/10 border border-blue-500/30 rounded-lg p-2.5 flex items-start gap-2 animate-fade-in">
                                        <span className="text-blue-400 text-lg">💡</span>
                                        <div className="text-xs text-blue-200">
                                            <p className="font-bold text-blue-300">Quase lá!</p>
                                            <p className="leading-tight mt-0.5">
                                                Faltam <strong className="text-white">R$ {(35 - finalTotal).toFixed(2)}</strong> para ganhar um selo fidelidade neste pedido.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {lastOrder?.orderType === 'Entrega' && finalTotal < MIN_ORDER_VALUE && (
                                    <div className="mb-3 p-2 bg-red-600/20 border border-red-600 rounded-lg text-red-500 text-center font-black text-[10px] animate-pulse">
                                        Pedido mínimo de R$ {MIN_ORDER_VALUE.toFixed(2)} não atingido para entrega
                                    </div>
                                )}

                                <button
                                    onClick={() => onRepeatOrder(itemsToRepeat)}
                                    disabled={isLoadingRepeat || !isStoreOpen || itemsToRepeat.length === 0 || (lastOrder?.orderType === 'Entrega' && finalTotal < MIN_ORDER_VALUE)}
                                    className={`w-full py-3 text-white font-bold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 text-sm ${!isStoreOpen || itemsToRepeat.length === 0 || (lastOrder?.orderType === 'Entrega' && finalTotal < MIN_ORDER_VALUE) ? 'bg-gray-600 cursor-not-allowed opacity-50' : 'bg-green-600 hover:bg-green-500 hover:shadow-green-500/20 disabled:opacity-50'}`}
                                >

                                    {isLoadingRepeat ? 'Processando...' : <><LucideRepeat size={16} /> Repetir Pedido (R$ {finalTotal.toFixed(2)})</>}
                                </button>
                            </div>
                        ) : (
                            // ...
                            <div className="text-center py-8 text-gray-500 bg-background/30 rounded-xl border border-dashed border-gray-700">
                                <p>Nenhum pedido recente salvo.</p>
                            </div>
                        )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-700">
                        {isStoreOpen ? (
                            <button
                                onClick={onNewOrder}
                                className="w-full py-3 bg-surface border border-primary text-primary hover:bg-primary hover:text-white font-bold rounded-xl transition-all text-sm flex items-center justify-center gap-2"
                            >
                                <LucideUtensils size={16} /> Abrir Cardápio Completo
                            </button>
                        ) : (
                            <div className="text-center p-2 bg-red-500/10 border border-red-500/30 rounded-xl">
                                <p className="text-red-400 font-bold text-sm uppercase tracking-wide">🔴 Loja Fechada</p>
                                <p className="text-gray-400 text-xs">Aguarde o horário de abertura para fazer pedidos.</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="w-full md:w-1/2 p-6 bg-gradient-to-br from-gray-900 to-black flex flex-col relative min-h-[400px]">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full filter blur-3xl transform translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>

                    <div className="relative z-10 flex-grow flex flex-col">
                        {/* Order Tracking Card (NEW) */}
                        {lastOrder && (lastOrder.status !== 'Entregue' && lastOrder.status !== 'Cancelado') && (
                            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-primary/30 shadow-lg mb-6 animate-fade-in-up">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                        <Clock size={16} className="text-primary animate-pulse" /> Status do Pedido
                                    </h4>
                                    <span className="text-[10px] text-gray-400 font-mono">#{lastOrder.dailyOrderNumber}</span>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-primary/20 rounded-full">
                                        {lastOrder.status === 'Novo' && <AlertCircle className="text-blue-400 animate-bounce" size={24} />}
                                        {lastOrder.status === 'Em Produção' && <Package className="text-yellow-400 animate-pulse" size={24} />}
                                        {(lastOrder.status === 'A Caminho' || lastOrder.status === 'No Portão') && <Truck className="text-green-400 animate-bounce" size={24} />}
                                        {lastOrder.status === 'Conta Solicitada' && <Clock className="text-purple-400" size={24} />}
                                    </div>
                                    <div className="flex-grow">
                                        <p className="text-lg font-black text-white leading-none mb-1">
                                            {lastOrder.status === 'Novo' && 'Pedido na fila de produção'}
                                            {lastOrder.status === 'Em Produção' && 'Sendo Preparado'}
                                            {lastOrder.status === 'A Caminho' && 'Saiu para Entrega'}
                                            {lastOrder.status === 'No Portão' && 'Chegou no Portão!'}
                                            {lastOrder.status === 'Conta Solicitada' && 'Aguardando Pagamento'}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            {lastOrder.status === 'Novo' && 'Vamos te atualizar sobre o pedido'}
                                            {lastOrder.status === 'Em Produção' && 'Nossa equipe já está montando seu pedido.'}
                                            {lastOrder.status === 'A Caminho' && 'O entregador está a caminho do seu endereço.'}
                                            {lastOrder.status === 'No Portão' && 'O entregador está na porta! Prepare o pagamento.'}
                                            {lastOrder.status === 'Conta Solicitada' && 'Seu pedido está pronto para o pagamento.'}
                                        </p>
                                        
                                        {/* Address and Change Details */}
                                        <div className="mt-3 pt-3 border-t border-white/5 flex flex-col gap-1.5">
                                            {lastOrder.orderType === 'Entrega' && (
                                                <div className="flex items-center gap-2 text-[10px] text-gray-300">
                                                    <MapPin size={12} className="text-primary" />
                                                    <span className="font-medium">{lastOrder.address}</span>
                                                </div>
                                            )}
                                            {lastOrder.paymentMethod === 'Dinheiro' && lastOrder.changeFor && (
                                                <div className="flex items-center gap-2 text-[10px] text-gray-300">
                                                    <span className="text-green-400">💵</span>
                                                    <span>Troco para: <strong className="text-white">R$ {parseFloat(lastOrder.changeFor).toFixed(2)}</strong></span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Progress Bar */}
                                <div className="mt-4 flex gap-1 h-1.5">
                                    <div className={`flex-1 rounded-full transition-all duration-500 ${['Novo', 'Em Produção', 'A Caminho', 'No Portão'].includes(lastOrder.status) ? 'bg-primary' : 'bg-gray-800'}`}></div>
                                    <div className={`flex-1 rounded-full transition-all duration-500 ${['Em Produção', 'A Caminho', 'No Portão'].includes(lastOrder.status) ? 'bg-primary' : 'bg-gray-800'}`}></div>
                                    <div className={`flex-1 rounded-full transition-all duration-500 ${['A Caminho', 'No Portão'].includes(lastOrder.status) ? 'bg-primary' : 'bg-gray-800'}`}></div>
                                    <div className={`flex-1 rounded-full transition-all duration-500 ${lastOrder.status === 'No Portão' ? 'bg-primary animate-pulse' : 'bg-gray-800'}`}></div>
                                </div>
                            </div>
                        )}

                        <h3 className="text-xl font-display text-white mb-1 flex items-center gap-2">
                            <span className="text-yellow-500 text-2xl">🎟️</span> Fidelidade Papaléguas
                        </h3>
                        <p className="text-xs text-gray-400 mb-6">Junte 10 selos e ganhe R$ 20,00 ou um X-Tudo!</p>

                        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/10 shadow-inner flex-grow flex flex-col justify-center min-h-[300px]">
                            {isLoadingLoyalty ? (
                                <div className="flex flex-col items-center justify-center h-40">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-2"></div>
                                    <p className="text-gray-400 text-xs">Buscando seus selos...</p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-5 gap-3 mb-4">
                                        {Array.from({ length: 10 }).map((_, i) => {
                                            const filled = i < currentProgress;
                                            return (
                                                <div key={i} className={`aspect-square rounded-full flex items-center justify-center border-2 transition-all duration-500 ${filled ? 'bg-yellow-500 border-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.5)] transform scale-110' : 'bg-gray-800/50 border-gray-700'}`}>
                                                    {filled ? (
                                                        <span className="text-black text-xl md:text-2xl animate-pulse">🍔</span>
                                                    ) : (
                                                        <span className="text-gray-600 text-xs font-mono">{i + 1}</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm font-bold text-white mb-1">
                                            {currentProgress} / 10 Selos
                                        </p>
                                        <div className="w-full bg-gray-700/50 rounded-full h-2 overflow-hidden">
                                            <div
                                                className="bg-yellow-500 h-full transition-all duration-1000 ease-out"
                                                style={{ width: `${(currentProgress / 10) * 100}%` }}
                                            ></div>
                                        </div>
                                        <p className="text-[10px] text-yellow-400 font-bold mt-2 uppercase tracking-wide">Pedidos acima de R$ 35,00 pontuam.</p>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="mt-6">
                            {rewardsAvailable > 0 ? (
                                <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-xl p-4 text-center animate-pulse-slow">
                                    <p className="text-yellow-400 font-bold mb-2">🎉 Você tem {rewardsAvailable} recompensa(s) disponível!</p>
                                    <button
                                        onClick={() => {
                                            onClose();
                                            onTriggerReward();
                                        }}
                                        className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-black uppercase tracking-wide rounded-xl shadow-lg transform hover:scale-105 transition-all text-sm"
                                    >
                                        RESGATAR PRÊMIO AGORA
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center p-4 opacity-50">
                                    <p className="text-sm text-gray-400">Faltam {10 - currentProgress} selos para seu prêmio.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoyaltyProfileModal;
