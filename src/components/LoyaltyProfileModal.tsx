import React, { useState, useEffect } from 'react';
import { X as LucideX, History as LucideHistory, Utensils as LucideUtensils, MapPin, Gift as LucideGift } from 'lucide-react';
import {
    fetchCustomerLoyaltyHistory, submitBolaoGuess, fetchBolaoGuessByPhone, fetchPublicSettings,
    fetchLoyaltyRewardItems, fetchCustomerPointsBalance, resgatarPontos,
} from '../services/supabaseService';
import type { LoyaltyRewardItem } from '../types';


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
    /** Chega do banco como STRING ("1"). Use mesmaMesa()/Number() para comparar. */
    table_number?: number | string;
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
    /**
     * Chamado quando o cliente resgata um produto no modelo de PONTOS. O
     * pai (CustomerPageModern/Classic) faz o mesmo que faz para o resgate
     * por selo: fecha este modal, seta pendingReward e reabre no carrinho —
     * pedido do Ikarus, 21/09/2026: "resgata e vai para o carrinho", sempre
     * dentro da aba de fidelidade, nunca direto no carrinho.
     */
    onRedeemPointsReward?: (item: MenuItem) => void;
}

// lastOrder/onRepeatOrder/isLoadingRepeat continuam no contrato de props
// (CustomerPageModern ainda os usa para o mecanismo de repetir pedido em
// outro lugar), mas este modal nao mostra mais o ultimo pedido nem tem
// botao de repetir — pedido do Icaro, 21/09/2026. Recebidos e ignorados.
const LoyaltyProfileModal: React.FC<LoyaltyProfileModalProps> = ({ isOpen, onClose, customer, onNewOrder, storeId, isStoreOpen, onUpdateAddress, onTriggerReward, pendingReward, onRedeemPointsReward }) => {
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

    // ── Modelo de fidelidade por PONTOS (21/09/2026) ──
    // 'selo' e' o padrao ate confirmarmos qual modelo a loja usa, para nunca
    // piscar a tela errada por uma fracao de segundo.
    const [loyaltyModel, setLoyaltyModel] = useState<'selo' | 'pontos'>('selo');
    const [pointsBalance, setPointsBalance] = useState(0);
    const [rewardItems, setRewardItems] = useState<LoyaltyRewardItem[]>([]);
    const [isLoadingPoints, setIsLoadingPoints] = useState(true);
    const [redeemingItemId, setRedeemingItemId] = useState<string | null>(null);

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

    // Nao mostramos mais o ultimo pedido (pedido do Icaro, 21/09/2026) — este
    // efeito so cuida do item RESGATADO por fidelidade, que ainda precisa
    // chegar ao carrinho normalmente via pendingReward.
    useEffect(() => {
        if (!isOpen) {
            setItemsToRepeat([]);
            return;
        }
        if (pendingReward?.type === 'item') {
            setItemsToRepeat([{
                ...pendingReward.item,
                cartId: `reward-${Date.now()}`,
                quantity: 1,
                notes: 'Fidelidade - GRÁTIS',
                price: 0
            }]);
        } else {
            setItemsToRepeat([]);
        }
    }, [isOpen, pendingReward]);

    // Descobre qual modelo a loja usa e, se for 'pontos', busca saldo do
    // cliente + produtos resgataveis configurados. So faz a query pesada
    // (historico de selos) quando o modelo realmente for 'selo'.
    useEffect(() => {
        if (!isOpen || !customer || !storeId) return;
        let cancelado = false;

        fetchPublicSettings(storeId)
            .then(settings => {
                if (cancelado) return;
                const modelo = settings.loyaltyModel === 'pontos' ? 'pontos' : 'selo';
                setLoyaltyModel(modelo);

                if (modelo === 'pontos') {
                    setIsLoadingPoints(true);
                    Promise.all([
                        fetchCustomerPointsBalance(customer.phone, storeId),
                        fetchLoyaltyRewardItems(storeId),
                    ])
                        .then(([saldo, itens]) => {
                            if (cancelado) return;
                            setPointsBalance(saldo);
                            setRewardItems(itens);
                        })
                        .catch(err => console.error('[Fidelidade] erro ao carregar pontos:', err))
                        .finally(() => { if (!cancelado) setIsLoadingPoints(false); });
                }
            })
            .catch(err => console.error('[Fidelidade] erro ao carregar configuracao:', err));

        return () => { cancelado = true; };
    }, [isOpen, customer, storeId]);

    const handleResgatarPontos = async (reward: LoyaltyRewardItem) => {
        if (!customer || redeemingItemId) return;
        if (pointsBalance < reward.points_cost) return; // botao ja fica desabilitado, dupla checagem
        setRedeemingItemId(reward.id);
        try {
            await resgatarPontos(customer.phone, storeId, reward.id, reward.points_cost);
            setPointsBalance(prev => prev - reward.points_cost);
            onRedeemPointsReward?.({
                id: reward.menu_item_id,
                name: reward.menu_item_name,
                description: 'Resgatado com pontos de fidelidade',
                price: 0,
                categoryId: -1,
                eligibleForCombo: false,
                isCombo: false,
                selectedAddons: [],
                store_id: storeId,
                isAvailable: true,
            });
        } catch (err: any) {
            console.error('[Fidelidade] erro ao resgatar pontos:', err);
            alert(err?.message || 'Não foi possível resgatar. Tente novamente.');
        } finally {
            setRedeemingItemId(null);
        }
    };

    // Formulario de endereco/pagamento independe do modelo de fidelidade —
    // sempre inicializa ao abrir o modal.
    useEffect(() => {
        if (isOpen && customer) {
            const parts = (customer.address || '').split(',');
            if (parts.length > 1) {
                setEditAddress(parts[0].trim());
                setEditNumber(parts[1].trim());
            } else {
                setEditAddress(customer.address || '');
                setEditNumber('');
            }
            setEditReference(customer.reference_point || '');
        }
    }, [isOpen, customer]);

    // Historico de selos so e' buscado quando o modelo ativo for 'selo' —
    // evita uma query cara e desnecessaria quando a loja usa pontos.
    useEffect(() => {
        if (isOpen && customer && storeId && loyaltyModel === 'selo') {
            setIsLoadingLoyalty(true);
            fetchCustomerLoyaltyHistory(customer.phone, storeId)
                .then(orders => setLoyaltyHistory(orders || []))
                .catch(err => console.error("Failed to fetch loyalty:", err))
                .finally(() => setIsLoadingLoyalty(false));
        }
    }, [isOpen, customer, storeId, loyaltyModel]);

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
                            
                            <h2 className="text-2xl font-black text-white uppercase tracking-widest mb-1 relative z-10 drop-shadow-md">Bolão da Copa</h2>
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
                        {/* Nao mostramos mais o "Ultimo Pedido" nem "Repetir Pedido" —
                            pedido do Icaro, 21/09/2026. Os dados do cliente (endereco,
                            pagamento) ficam sempre visiveis ao reconhecer o telefone,
                            independente de ja ter pedido antes. O item resgatado por
                            fidelidade (pendingReward) ainda aparece aqui, e chega ao
                            carrinho normalmente ao abrir o cardapio. */}
                        <div className="bg-background/50 rounded-xl p-4 border-2 border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.1)] relative">
                            {pendingReward?.type === 'item' && itemsToRepeat.length > 0 && (
                                <div className="mb-4">
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                        <LucideHistory size={12} /> Resgate de Fidelidade
                                    </h3>
                                    <div className="space-y-2">
                                        {itemsToRepeat.map((item, idx) => (
                                            <div key={idx} className="bg-black/20 rounded p-2 border border-gray-800 flex justify-between text-sm text-gray-200">
                                                <span className="font-medium text-yellow-500">{item.quantity}x {item.name}</span>
                                                <span className="text-xs text-yellow-500 font-bold bg-yellow-500/10 px-2 rounded">GRÁTIS</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {pendingReward?.type === 'discount' && (
                                <div className="mb-4 flex justify-between text-sm text-yellow-500 font-bold bg-black/20 rounded p-2 border border-gray-800 animate-pulse">
                                    <span>Desconto Fidelidade</span>
                                    <span>- R$ {pendingReward.value.toFixed(2)}</span>
                                </div>
                            )}

                            <div className="mt-4 mb-4 text-xs text-text-light bg-black/30 p-3 rounded-xl border border-white/5 w-full text-left relative group">
                                {!isEditingAddress ? (
                                    <>
                                        <div className="flex justify-between items-start">
                                            <p className="font-bold text-gray-300 mb-1 flex items-center gap-1">Endereço de Entrega:</p>
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
                        </div>
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
                                <p className="text-red-400 font-bold text-sm uppercase tracking-wide">Loja Fechada</p>
                                <p className="text-gray-400 text-xs">Aguarde o horário de abertura para fazer pedidos.</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="w-full md:w-1/2 p-6 bg-gradient-to-br from-gray-900 to-black flex flex-col relative min-h-[400px]">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full filter blur-3xl transform translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>

                    <div className="relative z-10 flex-grow flex flex-col">
                        {/* Status do pedido em tempo real removido — pedido do Icaro,
                            21/09/2026. Este modal nao acompanha mais o ultimo pedido. */}

                        {loyaltyModel === 'pontos' ? (
                            <>
                                <h3 className="text-xl font-display text-white mb-1 flex items-center gap-2">
                                    <LucideGift size={20} className="text-yellow-400" /> Fidelidade Açaí do Dudu
                                </h3>
                                <p className="text-xs text-gray-400 mb-6">Acumule pontos a cada pedido e troque por produtos!</p>

                                <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-5 border border-white/10 shadow-inner mb-4 text-center">
                                    {isLoadingPoints ? (
                                        <div className="flex flex-col items-center justify-center h-16">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
                                        </div>
                                    ) : (
                                        <>
                                            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-1">Seu saldo</p>
                                            <p className="text-4xl font-black text-yellow-400">{pointsBalance}</p>
                                            <p className="text-[10px] text-gray-500 uppercase tracking-wide">pontos</p>
                                        </>
                                    )}
                                </div>

                                <div className="flex-grow flex flex-col gap-2 overflow-y-auto">
                                    {!isLoadingPoints && rewardItems.length === 0 && (
                                        <p className="text-sm text-gray-500 text-center py-6">
                                            Nenhum produto resgatável configurado ainda.
                                        </p>
                                    )}
                                    {rewardItems.map(reward => {
                                        const podeResgatar = pointsBalance >= reward.points_cost;
                                        const resgatando = redeemingItemId === reward.id;
                                        return (
                                            <div
                                                key={reward.id}
                                                className={`rounded-xl p-3 border flex items-center justify-between gap-3 transition-all ${
                                                    podeResgatar
                                                        ? 'border-yellow-500/40 bg-yellow-500/5'
                                                        : 'border-gray-700 bg-black/20 opacity-60'
                                                }`}
                                            >
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-white truncate">{reward.menu_item_name}</p>
                                                    <p className="text-[11px] text-yellow-400 font-bold">{reward.points_cost} pontos</p>
                                                </div>
                                                <button
                                                    onClick={() => handleResgatarPontos(reward)}
                                                    disabled={!podeResgatar || resgatando}
                                                    className="shrink-0 px-3 py-2 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-700 disabled:text-gray-500 text-black text-xs font-black rounded-lg transition-all active:scale-95 uppercase tracking-wide"
                                                >
                                                    {resgatando ? '...' : 'Resgatar'}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        ) : (
                            <>
                                <h3 className="text-xl font-display text-white mb-1 flex items-center gap-2">
                                    Fidelidade Açaí do Dudu
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
                                                                <span className="text-black text-xs font-bold font-mono">✓</span>
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
                                            <p className="text-yellow-400 font-bold mb-2">Você tem {rewardsAvailable} recompensa(s) disponível!</p>
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
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoyaltyProfileModal;
