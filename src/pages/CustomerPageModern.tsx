import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../contexts/StoreContext';
import LoyaltyProfileModal from '../components/LoyaltyProfileModal';
import { 
    Category, MenuItem, Addon, Order, Settings, Customer, Promotion,
    OrderType, PaymentMethod, CartItem 
} from '../types';
import { 
    rateOrder, fetchPublicSettings, fetchActivePromotions, createOrder, triggerWebhook, 
    fetchMenuForCustomer, fetchCustomerByPhone, fetchLastOrderByPhone, fetchCustomerLoyaltyHistory, 
    redeemLoyaltyReward, upsertCustomer, fetchDynamicDeliveryFee
} from '../services/supabaseService';
import { 
    ShoppingCart as LucideShoppingCart, X as LucideX, 
    Plus as LucidePlus, Check as LucideCheck, Minus as LucideMinus, Bike, Star,
    Users, Search as LucideSearch, ArrowRight as LucideArrowRight,
    Sun, Moon, Trash2 as LucideTrash
} from 'lucide-react';
import { normalizeString } from '../utils/searchUtils';
import introJs from 'intro.js';
import { MIN_ORDER_VALUE } from '../constants';


// ... (imports remain mostly same, adding Star and rateOrder above)

// New SuccessModal with Rating
const SuccessModal: React.FC<{ isOpen: boolean; onClose: () => void; orderId?: string; isRatingEnabled?: boolean }> = ({ isOpen, onClose, orderId, isRatingEnabled = true }) => {
    const [rating, setRating] = useState(0);
    const [feedback, setFeedback] = useState('');
    const [submitted, setSubmitted] = useState(false);

    if (!isOpen) return null;

    const handleRate = async (value: number) => {
        setRating(value);
    };

    const handleSubmitRating = async () => {
        if (!orderId || rating === 0) return;
        try {
            await rateOrder(orderId, rating, feedback);
            setSubmitted(true);
            setTimeout(onClose, 2000);
        } catch (error) {
            console.error("Error rating order:", error);
            alert("Erro ao enviar avaliação. Tente novamente.");
        }
    };

    if (submitted) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-70 z-[60] flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-surface rounded-xl p-8 max-w-md w-full text-center shadow-2xl border border-primary transform transition-all scale-100">
                    <h2 className="text-2xl font-bold text-text-light mb-2">Obrigado! ⭐</h2>
                    <p className="text-text-light/80">Sua avaliação nos ajuda muito.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-[60] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-surface rounded-xl p-8 max-w-md w-full text-center shadow-2xl border border-primary transform transition-all scale-100">
                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                    <LucideCheck className="text-white w-8 h-8" />
                </div>
                <h2 className="text-2xl font-display text-primary mb-6">Pedido Recebido!</h2>
                

                {/* Rating Section */}
                {isRatingEnabled && (
                    <div className="bg-background/50 p-4 rounded-lg mb-6 border border-surface">
                        <p className="text-sm font-bold text-text-light mb-3">Como foi sua experiência de compra?</p>
                        <div className="flex justify-center gap-2 mb-4">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    onClick={() => handleRate(star)}
                                    className={`transition-transform hover:scale-110 ${rating >= star ? 'text-yellow-400 fill-current' : 'text-text-dark'}`}
                                >
                                    <Star className={`w-8 h-8 ${rating >= star ? 'fill-yellow-400' : ''}`} />
                                </button>
                            ))}
                        </div>
                        {rating > 0 && (
                            <textarea
                                placeholder="Algum comentário ou sugestão? (Opcional)"
                                value={feedback}
                                onChange={(e) => setFeedback(e.target.value)}
                                className="w-full text-xs p-2 rounded bg-background border border-surface text-text-light placeholder-text-dark focus:border-primary outline-none resize-none h-20 mb-3"
                            />
                        )}
                        {rating > 0 && (
                            <button
                                onClick={handleSubmitRating}
                                className="w-full py-2 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded transition-colors text-sm"
                            >
                                Enviar Avaliação
                            </button>
                        )}
                    </div>
                )}

                <button
                    onClick={onClose}
                    className="text-text-light hover:text-white underline text-sm"
                >
                    Voltar ao Cardápio
                </button>
            </div>
        </div>
    );
};


// --- Helper Functions & Hooks ---

const useStoreStatus = (settings: Partial<Settings> | null) => {
    const [isStoreOpen, setIsStoreOpen] = useState(true);
    const [statusMessage, setStatusMessage] = useState('Verificando status da loja...');

    const checkStatus = useCallback(() => {
        if (!settings) return;

        const now = new Date();
        const currentHour = now.getHours() + now.getMinutes() / 60;
        const currentDayIdx = now.getDay(); // 0 (Dom) a 6 (Sab)

        // 1. Verifica status manual (prioridade total)
        if (settings.manualStatus === 'closed') {
            setIsStoreOpen(false);
            setStatusMessage('A loja está fechada no momento.');
            return;
        }

        if (settings.manualStatus === 'open') {
            setIsStoreOpen(true);
            setStatusMessage('Loja Aberta');
            return;
        }

        // 2. Verifica Dias de Funcionamento (apenas se manualStatus for 'auto')
        if (settings.daysOfWeek && Array.isArray(settings.daysOfWeek)) {
            // No admin, salvamos como ["0", "1", ...] onde 0=Dom
            if (!settings.daysOfWeek.includes(currentDayIdx.toString())) {
                setIsStoreOpen(false);
                setStatusMessage('A loja não abre hoje.');
                return;
            }
        }

        // 3. Verifica Horários (apenas se manualStatus for 'auto' e o dia estiver liberado)
        if (settings.openingTime && settings.closingTime) {
            const [openH, openM] = settings.openingTime.split(':').map(Number);
            const [closeH, closeM] = settings.closingTime.split(':').map(Number);
            
            const start = openH + openM / 60;
            let end = closeH + closeM / 60;

            // Lida com virada de meia-noite (ex: 18:00 às 02:00)
            const isOvernight = end < start;
            
            let isOpen = false;
            if (isOvernight) {
                isOpen = currentHour >= start || currentHour < end;
            } else {
                isOpen = currentHour >= start && currentHour < end;
            }

            if (!isOpen) {
                setIsStoreOpen(false);
                setStatusMessage(`A loja abre das ${settings.openingTime} às ${settings.closingTime}.`);
                return;
            }
        }

        setIsStoreOpen(true);
        setStatusMessage('Loja Aberta');
    }, [settings]);

    useEffect(() => {
        if (!settings) return;
        checkStatus();
        const interval = setInterval(checkStatus, 30000);
        return () => clearInterval(interval);
    }, [settings, checkStatus]);

    return { isStoreOpen, statusMessage };
};

const usePWAInstall = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isInstallable, setIsInstallable] = useState(false);
    const [isIOS, setIsIOS] = useState(false);

    useEffect(() => {
        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        setIsIOS(isIOSDevice);

        const checkPrompt = () => {
            const prompt = (window as any).deferredPrompt;
            if (prompt) {
                setDeferredPrompt(prompt);
                setIsInstallable(true);
            }
        };

        const handler = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setIsInstallable(true);
            (window as any).deferredPrompt = e;
        };

        // Check if the event fired before React mounted
        checkPrompt();

        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const install = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setIsInstallable(false);
            setDeferredPrompt(null);
            (window as any).deferredPrompt = null;
        }
    };

    return { isInstallable, install, isIOS };
};

// --- SVG Icons ---
const AdminIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
const RoadrunnerIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-primary mr-2">
        <path d="M13.5 2c-1.5 0-3 .5-4.5 1.5-1.5 1-2.5 2.5-3 4.5-.5 2-1 4-2 5.5s-2.5 2.5-4 3c1.5.5 3.5.5 5.5 0 2-.5 3.5-1.5 4.5-3 .5-1 1-2.5 1.5-4.5.5-2 1.5-3.5 3-4.5 1.5-1 3-1.5 4.5-1.5H21v-1h-7.5zM2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2s-.9-2-2-2H4c-1.1 0-2 .9-2 2z" opacity=".3" />
        <path d="M20 14l-4-4c-1.5-1.5-3.5-2-5.5-1.5-2 .5-3.5 2-4.5 4l-2 4 2 1 3-1.5c1.5-.75 3-1.5 4.5-1.5 1.5 0 3 .5 4.5 1.5l2-2z" />
    </svg>
);

// --- Components ---
const StoreStatusBanner: React.FC<{ isOpen: boolean; message: string }> = ({ isOpen, message }) => {
    if (isOpen) return null;
    return (
        <div className="bg-red-600 text-white text-center py-1 px-2 text-[10px] font-bold shadow-sm animate-fade-in uppercase tracking-tighter">
            {message}
        </div>
    );
};

const DiscountBanner: React.FC<{ settings: Partial<Settings> | null }> = ({ settings }) => {
    if (!settings?.isAppDiscountEnabled || !settings?.appDiscountPercentage) return null;

    return (
        <div className="bg-orange-500 text-white text-center py-1 px-2 text-[10px] md:text-xs font-black shadow-inner flex items-center justify-center space-x-2 animate-fade-in uppercase tracking-widest">
            <span>🔥</span>
            <span>GANHE <strong>{settings.appDiscountPercentage}% OFF</strong> PELO APP!</span>
            <span>🔥</span>
        </div>
    );
};

const PWAInstallBanner: React.FC<{ onInstall: () => void; isIOS: boolean }> = ({ onInstall, isIOS }) => {
    const [dismissed, setDismissed] = useState(false);
    if (dismissed) return null;

    return (
        <div className="bg-primary/20 backdrop-blur-md text-white py-2 px-3 border-b border-primary/30 flex items-center justify-between gap-2 animate-fade-in group">
            <div className="flex items-center gap-2 flex-1">
                <div className="bg-primary text-background p-1.5 rounded-md shadow group-hover:scale-110 transition-transform shrink-0">
                    <LucideShoppingCart size={16} className="text-background" />
                </div>
                <div>
                    <p className="text-[11px] font-bold text-white leading-tight">
                        {isIOS ? 'Instale nosso App!' : 'Instalar App'}
                    </p>
                    <p className="text-[9px] text-gray-300 leading-tight mt-0.5">
                        {isIOS 
                            ? 'Toque em compartilhar e escolha "Adicionar à Tela de Início"' 
                            : 'Peça mais rápido e sem taxas!'}
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {!isIOS && (
                    <button 
                        onClick={onInstall}
                        className="bg-primary text-background px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-lg active:scale-95 transition-transform"
                    >
                        Instalar
                    </button>
                )}
                <button 
                    onClick={() => setDismissed(true)}
                    className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                >
                    <LucideX size={16} className="text-gray-400" />
                </button>
            </div>
        </div>
    );
};
const RaffleBanner: React.FC<{ settings: Partial<Settings> | null }> = ({ settings }) => {
    const [timeLeft, setTimeLeft] = useState<string>('');

    useEffect(() => {
        if (!settings?.raffleDrawDate || settings.lastRaffleWinner) return;

        const interval = setInterval(() => {
            const now = new Date();
            const drawDate = new Date(settings.raffleDrawDate!);
            const diff = drawDate.getTime() - now.getTime();

            if (diff <= 0) {
                setTimeLeft('Sorteando...');
                clearInterval(interval);
            } else {
                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

                let timeString = '';
                if (days > 0) timeString += `${days}d `;
                if (hours > 0) timeString += `${hours}h `;
                timeString += `${minutes}m`;
                setTimeLeft(timeString);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [settings?.raffleDrawDate, settings?.lastRaffleWinner]);

    if (!settings?.isRaffleEnabled) return null;

    if (settings.lastRaffleWinner) {
        return (
            <div className="bg-purple-600 text-white text-center py-1 px-4 text-[10px] md:text-sm font-medium shadow-inner flex flex-col items-center justify-center animate-fade-in leading-tight">
                <div className="flex items-center space-x-2">
                    <span>🏆</span>
                    <span>Ganhador do sorteio: <strong>{settings.lastRaffleWinner}</strong>!</span>
                    <span>🏆</span>
                </div>
            </div>
        );
    }

    if (settings.raffleDrawDate && timeLeft) {
        return (
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-center py-1 px-2 text-[10px] md:text-sm font-medium shadow-inner flex items-center justify-center space-x-2 animate-fade-in">
                <span>🎁</span>
                <span>Sorteio de <strong>R$ {Number(settings.rafflePrizeValue || 0).toFixed(2)}</strong> em: <strong>{timeLeft}</strong></span>
                <span>🎁</span>
            </div>
        );
    }

    return null;
};

const Header: React.FC<{ onAdminClick: () => void; onMotoboyClick: () => void; onWaiterClick: () => void; settings: Partial<Settings> | null; onToggleTheme: () => void; currentTheme: string }> = ({ onAdminClick, onMotoboyClick, onWaiterClick, settings, onToggleTheme, currentTheme }) => (
    <header className="bg-surface shadow-sm transition-all duration-300 w-full overflow-hidden shrink-0">
        <div className="flex justify-between items-center gap-2 px-3 py-1">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <div className="bg-primary/10 p-1 rounded-full overflow-hidden w-9 h-9 flex items-center justify-center shrink-0">
                    {settings?.logoUrl ? (
                        <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                    ) : (
                        <RoadrunnerIcon />
                    )}
                </div>
                <div className="flex flex-col min-w-0 overflow-hidden">
                    <h1 className="text-base md:text-lg font-display font-bold text-primary tracking-tight leading-none truncate">Açaí do Dudu</h1>
                    <p className="text-[9px] text-text-light font-medium mt-0.5 truncate">Açaís, Sorvetes & Sobremesas</p>
                </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
                <button onClick={onToggleTheme} className="p-1 rounded-full text-text-light hover:bg-background hover:text-primary transition-colors shrink-0" title={currentTheme === 'light' ? 'Mudar para Escuro' : 'Mudar para Claro'}>
                    {currentTheme === 'light' ? <Moon className="w-5 h-5 shrink-0" /> : <Sun className="w-5 h-5 shrink-0" />}
                </button>
                <button onClick={onMotoboyClick} className="p-1 rounded-full text-text-light hover:bg-background hover:text-primary transition-colors shrink-0" title="Área do Entregador">
                    <Bike className="w-5 h-5 shrink-0" />
                </button>
                <button onClick={onWaiterClick} className="p-1 rounded-full text-text-light hover:bg-background hover:text-primary transition-colors shrink-0" title="Área do Garçom">
                    <Users className="w-5 h-5 shrink-0" />
                </button>
                <button onClick={onAdminClick} className="p-1 rounded-full text-text-light hover:bg-background hover:text-primary transition-colors shrink-0" title="Área Administrativa">
                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                        <AdminIcon />
                    </div>
                </button>
            </div>
        </div>
    </header>
);

const CategoryNav: React.FC<{ categories: Category[] }> = ({ categories }) => {
    const scrollToCategory = (categoryId: number) => {
        const element = document.getElementById(`category-${categoryId}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    };
    return (
        <nav id="tour-categories" className="bg-background py-1 border-b-2 border-surface shadow-sm">
            <div className="container mx-auto px-4 flex space-x-2 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                <style>{`
                    .scrollbar-hide::-webkit-scrollbar {
                        display: none;
                    }
                `}</style>
                {categories.map(category => (
                    <button key={category.id} onClick={() => scrollToCategory(category.id)} className="px-2 py-0.5 bg-surface text-text-dark text-[9px] font-bold rounded-full whitespace-nowrap hover:bg-primary hover:text-black transition-all border border-text-light/10">
                        {category.name}
                    </button>
                ))}
            </div>
        </nav>
    );
};

const ProductSearchBar: React.FC<{ value: string; onChange: (val: string) => void }> = ({ value, onChange }) => (
    <div id="tour-search" className="bg-background px-3 py-1 border-b border-text-light/10 z-30 w-full overflow-hidden shrink-0 transition-colors duration-300">
        <div className="relative w-full">
            <LucideSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dark" size={16} />
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Buscar no cardápio (ex: açaí, milk shake, sorvete)..."
                className="w-full bg-surface border border-text-light/10 rounded-full pl-10 pr-4 py-2 text-sm text-text-light focus:outline-none focus:border-primary transition-colors placeholder-text-dark"
            />
        </div>
    </div>
);



const MenuItemCard: React.FC<{ item: MenuItem; onAddItem: (item: MenuItem) => void }> = ({ item, onAddItem }) => {
    const [justAdded, setJustAdded] = useState(false);
    const isSoldOut = !item.isAvailable;
    const isButtonDisabled = isSoldOut || justAdded;

    const handleAddClick = (e?: React.MouseEvent) => {
        if (isButtonDisabled) return;
        if (e) e.stopPropagation();
        onAddItem(item);
        setJustAdded(true);
        setTimeout(() => setJustAdded(false), 1000);
    };

    return (
        <div 
            onClick={() => !isSoldOut && onAddItem(item)}
            className={`group bg-surface rounded-2xl overflow-hidden shadow-lg flex flex-col h-full border border-text-light/5 hover:border-primary/50 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-2xl cursor-pointer ${isSoldOut ? 'opacity-75 cursor-not-allowed' : ''}`}
        >
            {item.image && (
                <div className="h-36 md:h-44 overflow-hidden relative bg-black/20 p-2 flex items-center justify-center rounded-t-2xl">
                    <img 
                        src={item.image} 
                        alt={item.name} 
                        className="max-h-full max-w-full object-contain transition-transform duration-500 group-hover:scale-105 drop-shadow-md" 
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
                         <span className="text-white text-[10px] font-bold uppercase tracking-wider">Ver Detalhes</span>
                    </div>
                    {isSoldOut && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center">
                            <span className="text-white font-black text-sm border-2 border-white px-3 py-1 rounded-lg transform -rotate-12 uppercase">Esgotado</span>
                        </div>
                    )}
                </div>
            )}
            <div className="p-4 flex flex-col flex-grow">
                <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg text-text-light group-hover:text-primary transition-colors leading-tight">{item.name}</h3>
                    <span className="font-black text-base text-primary whitespace-nowrap ml-2">R$ {item.price.toFixed(2)}</span>
                </div>
                <p className="text-xs text-text-dark line-clamp-2 mb-4 flex-grow">{item.description}</p>
                <button
                    onClick={handleAddClick}
                    disabled={isButtonDisabled}
                    className={`w-full py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md active:scale-95 flex items-center justify-center gap-2
                        ${isSoldOut ? 'bg-surface text-text-dark pointer-events-none' : 
                          justAdded ? 'bg-green-500 text-white' : 
                          'bg-primary text-white hover:brightness-110 active:brightness-90'}`}
                >
                    {isSoldOut ? 'Indisponível' : justAdded ? (
                        <><LucideCheck size={16} /> Adicionado</>
                    ) : (
                        'Personalizar'
                    )}
                </button>
            </div>
        </div>
    );
};

const MenuSection: React.FC<{ category: Category; items: MenuItem[]; onAddItem: (item: MenuItem) => void; isFirst?: boolean }> = ({ category, items, onAddItem, isFirst }) => {
    if (items.length === 0) return null;
    return (
        <section id={`category-${category.id}`} className="container mx-auto px-4 py-4 border-b border-surface last:border-0 scroll-mt-64 md:scroll-mt-48">
            <h2 className="text-2xl font-display text-primary mb-4">{category.name}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {items.map((item, index) => (
                    <div key={item.id} id={isFirst && index === 0 ? 'tour-product-first' : undefined}>
                         <MenuItemCard item={item} onAddItem={onAddItem} />
                    </div>
                ))}
            </div>
        </section>
    );
};



const PromotionsCoverflow: React.FC<{ promotions: Promotion[], onAddToCart: (item: CartItem) => void }> = ({ promotions, onAddToCart }) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    
    // Swipe state
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);

    const minSwipeDistance = 40;

    const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
        setTouchEnd(null);
        setIsPaused(true); // Pause rotation when user interacts
        if ('touches' in e) {
            setTouchStart(e.targetTouches[0].clientX);
        } else {
            setTouchStart((e as React.MouseEvent).clientX);
        }
    };

    const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
        if ('touches' in e) {
            setTouchEnd(e.targetTouches[0].clientX);
        } else if (touchStart) {
            setTouchEnd((e as React.MouseEvent).clientX);
        }
    };

    const handleTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe) {
            setActiveIndex(prev => (prev + 1) % promotions.length);
        } else if (isRightSwipe) {
            setActiveIndex(prev => (prev - 1 + promotions.length) % promotions.length);
        }
        
        setTouchStart(null);
        setTouchEnd(null);
        
        // Resume auto-rotation after 6 seconds of no interaction
        setTimeout(() => setIsPaused(false), 6000);
    };

    // Auto-rotate every 4 seconds
    useEffect(() => {
        if (isPaused) return;
        const interval = setInterval(() => {
            setActiveIndex(prev => (prev + 1) % promotions.length);
        }, 4000);
        return () => clearInterval(interval);
    }, [promotions.length, isPaused]);

    const getStyles = (index: number) => {
        // Handle wrapping for infinite feel
        const total = promotions.length;
        // Distance with wrap-around consideration
        let distance = (index - activeIndex + total) % total;
        if (distance > total / 2) distance -= total;
        
        const isActive = distance === 0;

        // Visual constants
        // Visual constants
        const xOffset = distance * 35; // Further reduced overlap to be extremely safe
        const scale = isActive ? 1 : 0.85;
        const zIndex = isActive ? 50 : 50 - Math.abs(distance);
        const opacity = isActive ? 1 : 0.4;
        const rotateY = isActive ? 0 : (distance > 0 ? -15 : 15);
        
        const visible = Math.abs(distance) <= 1;

        return {
            transform: `translateX(${xOffset}%) scale(${scale}) perspective(1000px) rotateY(${rotateY}deg)`,
            zIndex,
            opacity: visible ? opacity : 0,
            display: visible ? 'block' : 'none',
            position: 'absolute' as 'absolute',
            left: '0',
            right: '0',
            margin: '0 auto',
            width: 'min(230px, 70vw)', // Slightly smaller width for safety
            top: '0',
            height: '180px',
            transition: 'all 0.5s cubic-bezier(0.25, 0.8, 0.25, 1)',
        };
    };

    return (
        <div 
            className="relative h-48 w-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleTouchStart}
            onMouseMove={handleTouchMove}
            onMouseUp={handleTouchEnd}
            onMouseLeave={handleTouchEnd}
        >
             {promotions.map((promo, index) => {
                 // Extract image from promo.image field OR from description |||IMG: marker
                 let bgImage: string | undefined = promo.image || undefined;
                 if (!bgImage && promo.description?.includes('|||IMG:')) {
                     bgImage = promo.description.split('|||IMG:')[1]?.trim();
                 }
                 // Clean display description (remove the |||IMG: marker part)
                 const displayDesc = promo.description?.includes('|||IMG:')
                     ? promo.description.split('|||IMG:')[0].trim()
                     : promo.description;

                 return (
                 <div 
                    key={promo.id}
                    style={{
                        ...getStyles(index),
                        ...(bgImage
                            ? { backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                            : { background: 'linear-gradient(135deg, #1a0a2e 0%, #2d1a4a 100%)' }
                        )
                    }}
                    className="bg-surface rounded-2xl shadow-2xl border border-primary/50 overflow-hidden"
                    onClick={() => setActiveIndex(index)}
                 >
                     {/* Content overlay to make text readable over the images */}
                     <div className="relative h-full flex flex-col p-3 border border-text-light/5 bg-black/40 z-10">
                        {/* Compact Card Content */}
                        <div className="absolute top-2 right-2 z-10">
                            <span className="bg-red-600 text-white text-[9px] uppercase font-black px-1.5 py-0.5 rounded shadow-lg animate-pulse">Relâmpago</span>
                        </div>
                        
                        <h3 className="text-base font-black text-white leading-tight mb-0.5 pr-14 drop-shadow-md line-clamp-3">{promo.name}</h3>
                        <p className="text-gray-200 text-[10px] leading-tight line-clamp-2 mb-1.5 drop-shadow-md">{displayDesc}</p>
                        
                        <div className="mt-auto flex items-end justify-between border-t border-white/20 pt-2 relative z-20">
                             <div>
                                 <span className="block text-[10px] text-gray-300 line-through decoration-red-500 drop-shadow-md">R$ {(promo.price * 1.3).toFixed(2)}</span>
                                 <span className="block text-xl font-black text-primary drop-shadow-md">R$ {promo.price.toFixed(2)}</span>
                             </div>
                             
                             <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onAddToCart({
                                        cartId: `${promo.id}-${Date.now()}`,
                                        id: Number(promo.id),
                                        name: promo.name,
                                        price: Number(promo.price),
                                        quantity: 1,
                                        isCombo: false, 
                                        eligibleForCombo: false,
                                        isAvailable: true,
                                        categoryId: -1,
                                        store_id: promo.store_id || '', 
                                        description: displayDesc || '',
                                        image: bgImage || '',
                                        selectedAddons: [],
                                        allowedAddons: [],
                                        addons: [],
                                        notes: ''
                                    });
                                }}
                                className="bg-green-600 hover:bg-green-500 text-white p-1.5 rounded-lg shadow-lg active:scale-95 transition-transform"
                             >
                                 <LucidePlus size={20} strokeWidth={3} />
                             </button>
                        </div>
                     </div>
                     {/* Gloss Effect / Dark Gradient at bottom */}
                     <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none z-0"></div>
                 </div>
                 );
             })}
             
            {/* Dots Indicator - Moved up to overlap carousel area slightly */}
            <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-1.5 z-50">
                {promotions.map((_, idx) => (
                    <div 
                        key={idx} 
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${idx === activeIndex ? 'bg-primary shadow-[0_0_5px_rgba(255,191,0,0.5)]' : 'bg-surface border border-text-light/20'}`}
                    />
                ))}
            </div>
        </div>
    );
};



const DraggableCart: React.FC<{ onClick: () => void; itemCount: number; isAnimating: boolean }> = ({ onClick, itemCount, isAnimating }) => {
    const [position, setPosition] = useState({ x: window.innerWidth - 80, y: window.innerHeight - 150 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const hasMoved = useRef(false);

    // Keep cart in bounds during resize
    useEffect(() => {
        const handleResize = () => {
            setPosition(prev => ({
                x: Math.min(prev.x, window.innerWidth - 70),
                y: Math.min(prev.y, window.innerHeight - 70)
            }));
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handlePointerDown = (e: React.PointerEvent) => {
        setIsDragging(true);
        dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
        hasMoved.current = false;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;
        
        const newX = Math.min(Math.max(10, e.clientX - dragStart.current.x), window.innerWidth - 70);
        const newY = Math.min(Math.max(10, e.clientY - dragStart.current.y), window.innerHeight - 70);
        
        if (Math.abs(newX - position.x) > 5 || Math.abs(newY - position.y) > 5) {
            hasMoved.current = true;
        }
        
        setPosition({ x: newX, y: newY });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        setIsDragging(false);
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);

        // If it didn't move much, treat as click
        if (!hasMoved.current) {
            onClick();
        }
    };

    return (
        <div
            id="tour-cart"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                touchAction: 'none',
                position: 'fixed'
            }}
            className={`z-[100] cursor-move bg-[#10b981] text-white p-4 rounded-full shadow-2xl transition-transform active:scale-95 ${isAnimating ? 'animate-bounce-small' : ''} ${isDragging ? 'opacity-90 scale-110 grayscale-[0.2]' : ''}`}
        >
            <LucideShoppingCart size={28} />
            {itemCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-secondary text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center border-2 border-primary animate-pulse shadow-lg">
                    {itemCount}
                </span>
            )}
        </div>
    );
};

const SideCart: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    cart: CartItem[];
    onUpdateCart: (item: CartItem, quantity: number) => void;
    onRemoveFromCart: (cartId: string) => void;
    onClearCart: () => void;
    isStoreOpen: boolean;
    settings: Partial<Settings> | null;
    storeId: string;
    customerName: string;
    setCustomerName: (name: string) => void;
    phone: string;
    setPhone: (phone: string) => void;
    address: string;
    setAddress: (address: string) => void;
    referencePoint: string;
    setReferencePoint: (ref: string) => void;
    houseNumber: string;
    setHouseNumber: (num: string) => void;
    paymentMethod: PaymentMethod;
    setPaymentMethod: (method: PaymentMethod) => void;
    changeFor: string;
    setChangeFor: (change: string) => void;
    orderType: OrderType;
    setOrderType: (type: OrderType) => void;
    orderDiscount?: number;
    setOrderDiscount?: (val: number) => void;
    pendingReward?: any | null;
    dynamicDeliveryFee: number | null;
}> = ({ isOpen, onClose, cart, onUpdateCart, onRemoveFromCart, onClearCart, isStoreOpen, settings, storeId,
    customerName, setCustomerName, phone, setPhone, address, setAddress, referencePoint, setReferencePoint,
    houseNumber, setHouseNumber, paymentMethod, setPaymentMethod, changeFor, setChangeFor, orderType, setOrderType,
    orderDiscount = 0, setOrderDiscount, pendingReward, dynamicDeliveryFee
}) => {
        const [isSubmitting, setIsSubmitting] = useState(false);
        const [showSuccess, setShowSuccess] = useState(false);
        const [lastOrderId, setLastOrderId] = useState<string | undefined>(undefined);
        const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

        const subtotal = useMemo(() => {
            return cart.reduce((sum, item) => {
                const itemPrice = Number(item.price) || 0;
                const addonsPrice = item.selectedAddons.reduce((s, a) => s + (Number(a.price) || 0), 0);
                const comboPrice = item.isCombo ? (Number(settings?.comboPrice) || 0) : 0;
                const itemTotal = itemPrice + addonsPrice + comboPrice;
                return sum + (itemTotal * item.quantity);
            }, 0);
        }, [cart, settings]);

        const discount = useMemo(() => {
            if (settings?.isAppDiscountEnabled && settings?.appDiscountPercentage) {
                return (subtotal * settings.appDiscountPercentage) / 100;
            }
            return 0;
        }, [subtotal, settings]);

        const deliveryFee = orderType === 'Entrega' ? (dynamicDeliveryFee ?? settings?.deliveryFee ?? 0) : 0;
        const total = Math.max(0, subtotal - discount + deliveryFee - (orderDiscount || 0));

        const isFormValid = useMemo(() => {
            if (!customerName.trim()) return false;
            const phoneDigits = phone.replace(/\D/g, '');
            if (phoneDigits.length < 8) return false;
            if (orderType === 'Entrega') {
                if (!address.trim()) return false;
                if (!houseNumber.trim()) return false;
                if (!referencePoint.trim()) return false;
            }
            if (paymentMethod === 'Dinheiro' && !changeFor) return false;
            if (orderType === 'Entrega' && total < MIN_ORDER_VALUE) return false;
            return true;
        }, [customerName, phone, orderType, address, houseNumber, referencePoint, paymentMethod, changeFor, total]);


        const handleSubmit = async (e: React.FormEvent) => {
            e.preventDefault();
            if (!isFormValid || !isStoreOpen) return;

            setIsSubmitting(true);
            setSubmitMessage(null);

            try {
                // Normalization: Ensure phone has DDD (Default from settings or 32 if missing)
                let finalPhone = phone.replace(/\D/g, '');
                
                // 1. Strip country code '55' if present (result must be >= 10 digits to be a valid BR number with 55)
                if (finalPhone.startsWith('55') && finalPhone.length > 11) {
                    finalPhone = finalPhone.substring(2);
                }

                const defaultDDD = settings?.defaultDDD || '32';
                
                // 2. Add DDD for 8 or 9 digit numbers
                if (finalPhone.length === 8 || finalPhone.length === 9) {
                    finalPhone = `${defaultDDD}${finalPhone}`;
                }

                // 3. Final validation (Brazilian numbers must be 10 or 11 digits with DDD)
                if (finalPhone.length < 10 || finalPhone.length > 11) {
                    throw new Error('Número de telefone inválido. Use DDD + Número.');
                }

                // Prepare items list - including synthetic negative item for loyalty discount if applicable
                const finalItems = [...cart];
                if (orderDiscount > 0) {
                    finalItems.push({
                        id: 888888, // Synthetic ID for discount
                        name: "DESCONTO FIDELIDADE",
                        price: -orderDiscount,
                        quantity: 1,
                        selectedAddons: [],
                        notes: 'Resgate de fidelidade',
                        cartId: `discount-${Date.now()}`
                    } as any);
                }

                const orderData: any = {
                    dailyOrderNumber: 0, // database trigger handles this
                    customerName,
                    phone: finalPhone,
                    address: `${address}, ${houseNumber}`,
                    referencePoint,
                    orderType,
                    paymentMethod,
                    changeFor: changeFor ? parseFloat(changeFor) : undefined,
                    items: finalItems,
                    total,
                    discount: orderDiscount > 0 ? orderDiscount : undefined,
                    deliveryFee,
                    status: 'Novo',
                    store_id: storeId,
                    timestamp: new Date().toISOString(),
                    observation: '',
                    origin: 'WEB'
                };

                const createdOrder = await createOrder(orderData);

                if (createdOrder) {
                    // Start Loyalty Redemption if discount was used OR if there is a pending item reward
                    if (orderDiscount > 0 || (pendingReward && pendingReward.type === 'item')) {
                        console.log("Triggering Loyalty Redemption. Discount:", orderDiscount, "PendingReward:", pendingReward);
                        try {
                             await redeemLoyaltyReward(finalPhone, storeId);
                        } catch (redemptionError) {
                            console.error("Critical Loyalty Error:", redemptionError);
                            // Optional: Alert user, but order is already created. 
                            // Ideally, we would revert order, but that's complex. 
                            // For now, logging effectively and maybe notifying admin is simpler.
                            // However, since we are POST-order creation, we just log.
                            // Ideally this call should happen BEFORE order creation transactionally, 
                            // but Supabase client doesn't support easy transactions across calls.
                        }
                    }
                    onClearCart();
                    if (setOrderDiscount) setOrderDiscount(0); // Reset discount
                    setLastOrderId(createdOrder.id);
                    setShowSuccess(true);

                    if (settings?.webhookNewOrderUrl) {
                        triggerWebhook(settings.webhookNewOrderUrl, {
                            event: 'new_order',
                            ...createdOrder,
                            customer_phone: phone
                        });
                    }
                } else {
                    throw new Error('Erro ao criar pedido');
                }
            } catch (error) {
                console.error(error);
                setSubmitMessage({ type: 'error', text: 'Erro ao enviar pedido. Tente novamente.' });
            } finally {
                setIsSubmitting(false);
            }
        };

        const handleCloseSuccess = () => {
            setShowSuccess(false);
            onClose();
            // Reset form
            setCustomerName('');
            setPhone('');
            setAddress('');
            setReferencePoint('');
            setChangeFor('');
            setSubmitMessage(null);
        };

        return (
            <>
                {isOpen && <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose}></div>}
                <div className={`fixed top-0 right-0 h-full w-full md:w-96 bg-surface shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'} flex flex-col`}>
                    <div className="p-2 bg-primary text-background flex justify-between items-center">
                        <h2 className="text-base font-bold flex items-center">
                            <LucideShoppingCart />
                            <span className="ml-2">Seu Pedido</span>
                        </h2>
                        <button onClick={onClose} className="text-background hover:text-white"><LucideX className="w-5 h-5" /></button>
                    </div>

                    {cart.length === 0 ? (
                        <div className="flex-grow flex flex-col items-center justify-center p-4">
                            <p className="text-text-light text-lg">Seu carrinho está vazio.</p>
                            <button onClick={onClose} className="mt-4 px-6 py-2 bg-primary text-background font-bold rounded-lg">Ver Cardápio</button>
                        </div>
                    ) : (
                        <div className="flex-grow overflow-y-auto p-2 space-y-2 scrollbar-thin scrollbar-thumb-primary scrollbar-track-surface">
                            {cart.map(item => (
                                <div key={item.cartId} className="bg-background p-2 rounded-lg flex flex-col space-y-1 border border-surface">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h4 className="font-bold text-text-light text-sm">{item.name}</h4>
                                            {item.isCombo && <span className="text-[10px] text-primary font-semibold">Combo (+R$ {Number(settings?.comboPrice || 13).toFixed(2)})</span>}
                                            {item.selectedAddons.length > 0 && (
                                                <ul className="text-[10px] text-text-dark mt-0.5 list-disc list-inside">
                                                    {item.selectedAddons.map(addon => (
                                                        <li key={addon.id}>+ {addon.name}</li>
                                                    ))}
                                                </ul>
                                            )}
                                            {item.notes && <p className="text-[10px] text-text-dark mt-0.5 italic">Obs: {item.notes}</p>}
                                        </div>
                                        <button onClick={() => onRemoveFromCart(item.cartId)} className="text-red-500 hover:text-red-400"><LucideTrash className="w-4 h-4" /></button>
                                    </div>
                                    <div className="flex justify-between items-center mt-1">
                                        <div className="flex items-center space-x-2 bg-surface rounded-lg p-0.5">
                                            <button onClick={() => onUpdateCart(item, item.quantity - 1)} className="p-0.5 text-primary hover:bg-background rounded"><LucideMinus className="w-4 h-4" /></button>
                                            <span className="font-bold text-text-light w-5 text-center text-sm">{item.quantity}</span>
                                            <button onClick={() => onUpdateCart(item, item.quantity + 1)} className="p-0.5 text-primary hover:bg-background rounded"><LucidePlus className="w-4 h-4" /></button>
                                        </div>
                                        <span className="font-bold text-text-light text-sm">
                                            R$ {(((Number(item.price) || 0) + item.selectedAddons.reduce((s, a) => s + (Number(a.price) || 0), 0) + (item.isCombo ? (Number(settings?.comboPrice) || 0) : 0)) * item.quantity).toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {cart.length > 0 && (
                        <div className="p-2 bg-surface border-t border-surface">
                            <div className="space-y-1 mb-2">
                                <div className="flex justify-between text-text-light text-xs">
                                    <span>Subtotal:</span>
                                    <span>R$ {Number(subtotal).toFixed(2)}</span>
                                </div>
                                {discount > 0 && (
                                    <div className="flex justify-between text-green-400 font-bold text-xs">
                                        <span>Desconto ({settings?.appDiscountPercentage}%):</span>
                                        <span>- R$ {Number(discount).toFixed(2)}</span>
                                    </div>
                                )}
                                {deliveryFee > 0 && (
                                    <div className="flex justify-between text-text-light text-xs">
                                        <span>Taxa de Entrega:</span>
                                        <span>+ R$ {Number(deliveryFee).toFixed(2)}</span>
                                    </div>
                                )}
                                {orderDiscount > 0 && (
                                    <div className="flex justify-between text-yellow-500 font-bold text-xs">
                                        <span>Desconto Fidelidade:</span>
                                        <span>- R$ {Number(orderDiscount).toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-base font-bold text-primary border-t border-surface pt-1">
                                    <span>Total:</span>
                                    <span>R$ {Number(total).toFixed(2)}</span>
                                </div>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <input
                                        type="text"
                                        placeholder="Seu Nome"
                                        value={customerName}
                                        onChange={e => setCustomerName(e.target.value.replace(/[0-9]/g, ''))}
                                        className="w-full p-1.5 bg-background border border-surface rounded text-text-light focus:border-primary outline-none text-xs h-8"
                                        required
                                    />
                                    <input
                                        type="tel"
                                        placeholder="Telefone (WhatsApp)"
                                        value={phone}
                                        onChange={e => {
                                            const val = e.target.value.replace(/\D/g, '');
                                            let masked = val;
                                            if (val.length > 0) masked = '(' + val.substring(0, 2);
                                            if (val.length > 2) masked += ') ' + val.substring(2, 7);
                                            if (val.length > 7) masked += '-' + val.substring(7, 11);
                                            setPhone(masked);
                                        }}
                                        className="w-full p-1.5 bg-background border border-surface rounded text-text-light focus:border-primary outline-none text-xs h-8"
                                        maxLength={15}
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setOrderType('Entrega')}
                                        className={`p-1 rounded border transition-colors text-xs h-8 ${orderType === 'Entrega' ? 'bg-primary text-background font-bold border-primary' : 'bg-background text-text-light border-surface hover:border-text-light/20'}`}
                                    >
                                        Entrega
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setOrderType('Balcão')}
                                        className={`p-1 rounded border transition-colors text-xs h-8 ${orderType === 'Balcão' ? 'bg-primary text-background font-bold border-primary' : 'bg-background text-text-light border-surface hover:border-text-light/20'}`}
                                    >
                                        Retirar
                                    </button>
                                </div>

                                <select
                                    value={paymentMethod}
                                    onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                                    className="w-full p-1.5 bg-background border border-surface rounded text-text-light focus:border-primary outline-none text-xs h-8"
                                >
                                    <option value="Cartão">Cartão</option>
                                    <option value="Dinheiro">Dinheiro</option>
                                    <option value="PIX">PIX</option>
                                </select>

                                {orderType === 'Entrega' && (
                                    <div className="space-y-2">
                                        <input
                                            type="text"
                                            placeholder="Endereço (Rua)"
                                            value={address}
                                            onChange={e => setAddress(e.target.value)}
                                            className="w-full p-1.5 bg-background border border-surface rounded text-text-light focus:border-primary outline-none text-xs h-8"
                                            required
                                        />
                                        <div className="grid grid-cols-[100px,1fr] gap-2">
                                            <div className="space-y-1">
                                                <input
                                                    type="text"
                                                    placeholder="Nº ou SN"
                                                    value={houseNumber}
                                                    onChange={e => setHouseNumber(e.target.value)}
                                                    className="w-full p-1.5 bg-background border border-surface rounded text-text-light focus:border-primary outline-none text-xs h-8"
                                                    required
                                                />
                                                <span className="block text-[8px] text-text-dark italic whitespace-nowrap">* 'SN' se sem número</span>
                                            </div>
                                            <input
                                                type="text"
                                                placeholder="Referência"
                                                value={referencePoint}
                                                onChange={e => setReferencePoint(e.target.value)}
                                                className="w-full p-1.5 bg-background border border-surface rounded text-text-light focus:border-primary outline-none text-xs h-8"
                                                required
                                            />
                                        </div>
                                    </div>
                                )}

                                {paymentMethod === 'Dinheiro' && (
                                    <input
                                        type="number"
                                        placeholder="Troco para quanto?"
                                        value={changeFor}
                                        onChange={e => setChangeFor(e.target.value)}
                                        className="w-full p-1.5 bg-background border border-surface rounded text-text-light focus:border-primary outline-none text-xs h-8"
                                        required
                                    />
                                )}

                                {paymentMethod === 'PIX' && (
                                    <div className="bg-surface rounded p-3 flex flex-col gap-2 border border-primary/20">
                                        <div className="flex items-start gap-2">
                                            <span className="text-yellow-500">ℹ️</span>
                                            <div>
                                                <p className="text-xs font-bold text-text-light">Pagamento via PIX:</p>
                                                <p className="text-[10px] text-text-dark leading-tight mt-1">
                                                    {orderType === 'Entrega' 
                                                        ? 'O motoboy irá gerar o QR Code ou fornecer a chave no momento da entrega.' 
                                                        : 'Solicite o QR Code ou chave PIX diretamente no balcão.'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {submitMessage && (
                                    <div className={`p-1 rounded text-center font-bold text-xs ${submitMessage.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                                        {submitMessage.text}
                                    </div>
                                )}

                                {!isStoreOpen && (
                                    <div className="p-1 bg-red-500 text-white text-center font-bold rounded text-xs">
                                        A loja está fechada no momento.
                                    </div>
                                )}

                                {orderType === 'Entrega' && total < MIN_ORDER_VALUE && (
                                    <div className="p-2 bg-red-600/20 border border-red-600 rounded-lg text-red-500 text-center font-black text-xs animate-pulse">
                                        Pedido mínimo de R$ {Number(MIN_ORDER_VALUE).toFixed(2)} não atingido
                                    </div>
                                )}




                                <button
                                    type="submit"
                                    disabled={!isFormValid || isSubmitting || !isStoreOpen}
                                    className="w-full py-2 bg-primary hover:bg-primary-dark text-background font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm h-10"
                                >
                                    {isSubmitting ? 'Enviando...' : 'Finalizar Pedido'}
                                </button>
                            </form>
                        </div>
                    )}
                </div>
                <SuccessModal isOpen={showSuccess} onClose={handleCloseSuccess} orderId={lastOrderId} isRatingEnabled={settings?.isRatingEnabled ?? true} />
            </>
        );
    };

const ItemDetailModal: React.FC<{
    item: MenuItem;
    comboPrice: number;
    onClose: () => void;
    onAddToCart: (item: CartItem) => void;
    categoryName: string;
}> = ({ item, comboPrice, onClose, onAddToCart, categoryName }) => {
    const [quantity, setQuantity] = useState(1);
    const [isCombo, setIsCombo] = useState(false);
    const [selectedAddons, setSelectedAddons] = useState<Addon[]>([]);
    const [notes, setNotes] = useState('');

    // Lógica para mostrar o campo de observações
    const deveMostrarObservacoes = useMemo(() => {
        const nomeCategoria = categoryName.toLowerCase();
        // Enable for Lanches, Porções, Gourmet, or generic Burgers
        return nomeCategoria.includes('lanches') ||
            nomeCategoria.includes('porções') ||
            nomeCategoria.includes('porcoes') ||
            nomeCategoria.includes('gourmet') ||
            nomeCategoria.includes('burger');
    }, [categoryName]);

    const handleAddonToggle = (addon: Addon) => {
        setSelectedAddons(prev =>
            prev.find(a => a.id === addon.id)
                ? prev.filter(a => a.id !== addon.id)
                : [...prev, addon]
        );
    };

    const handleAddToCart = () => {
        const cartItem: CartItem = {
            ...item,
            cartId: `${item.id}-${Date.now()}`,
            quantity,
            isCombo,
            selectedAddons,
            notes,
        };
        onAddToCart(cartItem);
        onClose();
    };

    // Use the addons explicitly selected for this item in the Admin Panel, fallback to category addons if none selected
    const relevantAddons = (item.selectedAddons && item.selectedAddons.length > 0) ? item.selectedAddons : (item.addons || []);

    return (
        <div 
            className="fixed inset-0 bg-background/80 backdrop-blur-md z-[100] flex items-center justify-center p-0 md:p-4 animate-fade-in" 
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-surface md:rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-fade-in-up h-full md:h-auto md:max-h-[90vh] flex flex-col">
                <div className="relative h-48 md:h-64 shrink-0">
                    <img src={item.image || 'https://via.placeholder.com/400x200?text=Sem+Imagem'} alt={item.name} className="w-full h-full object-cover" />
                    <button 
                        onClick={onClose} 
                        className="absolute top-4 right-4 bg-black/50 backdrop-blur-md text-white rounded-full p-2 hover:bg-black/70 transition-all border border-white/10"
                    >
                        <LucideX size={24} />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-surface to-transparent h-20"></div>
                </div>
                
                <div className="px-6 py-4 overflow-y-auto flex-grow scrollbar-hide space-y-4">
                    <div className="space-y-3">
                        <div className="flex justify-between items-start gap-4">
                            <h2 className="text-xl font-black text-text-light leading-tight uppercase tracking-tight">{item.name}</h2>
                            <div className="text-right">
                                <span className="block text-xl font-black text-primary whitespace-nowrap">R$ {item.price.toFixed(2)}</span>
                                {item.eligibleForCombo && <span className="text-[10px] text-text-dark font-bold uppercase tracking-tight">+ R$ {comboPrice.toFixed(2)} no combo</span>}
                            </div>
                        </div>
                        <p className="text-xs text-text-dark leading-relaxed border-l-2 border-primary/20 pl-3">{item.description}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {item.eligibleForCombo && (
                            <div className="bg-background/50 border border-text-light/5 rounded-2xl p-4 flex items-center h-full">
                                <label className="flex items-center cursor-pointer group w-full">
                                    <input 
                                        type="checkbox" 
                                        checked={isCombo} 
                                        onChange={e => setIsCombo(e.target.checked)} 
                                        className="h-6 w-6 text-primary rounded-lg border-surface bg-background focus:ring-offset-background" 
                                    />
                                    <div className="ml-3">
                                        <span className="block text-text-light font-bold text-sm group-hover:text-primary transition-colors">Virar Combo?</span>
                                        <span className="block text-[10px] text-text-dark line-clamp-1">+ Batata + Refri (+R$ {comboPrice.toFixed(2)})</span>
                                    </div>
                                </label>
                            </div>
                        )}

                        {deveMostrarObservacoes && (
                            <div className="bg-background/50 border border-text-light/5 rounded-2xl p-3 flex flex-col h-full">
                                <h3 className="text-[10px] font-black text-text-dark uppercase tracking-widest mb-1">Observações</h3>
                                <textarea
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    placeholder="Ex: Sem cebola..."
                                    className="w-full p-2 bg-background/30 border border-text-light/5 animate-pulse-border rounded-xl text-text-light focus:border-primary/50 outline-none resize-none h-14 text-xs transition-all"
                                />
                            </div>
                        )}
                    </div>

                    {relevantAddons.length > 0 && (
                        <div className="space-y-3">
                            <h3 className="text-xs font-black text-text-dark uppercase tracking-widest">Turbine seu pedido</h3>
                            <div className="grid grid-cols-1 gap-2">
                                {relevantAddons.map(addon => {
                                    const isUnavailable = addon.isAvailable === false;
                                    const isSelected = selectedAddons.some(a => a.id === addon.id);
                                    return (
                                        <button
                                            key={addon.id}
                                            disabled={isUnavailable}
                                            onClick={() => handleAddonToggle(addon)}
                                            className={`flex items-center p-3 rounded-2xl border transition-all text-left
                                                ${isSelected 
                                                    ? 'bg-primary/10 border-primary shadow-[0_0_15px_rgba(255,191,0,0.1)]' 
                                                    : 'bg-background/40 border-text-light/5 hover:border-text-light/10'}
                                                ${isUnavailable ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
                                        >
                                            <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors
                                                ${isSelected ? 'bg-primary border-primary' : 'bg-background border-surface'}`}>
                                                {isSelected && <LucideCheck size={12} className="text-background stroke-[4]" />}
                                            </div>
                                            <span className="ml-3 flex-grow text-xs font-bold text-text-light uppercase tracking-tight">
                                                {addon.name}
                                            </span>
                                            <span className={`font-black text-xs ${isSelected ? 'text-primary' : 'text-text-dark'}`}>
                                                + R$ {addon.price.toFixed(2)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 bg-surface border-t border-text-light/5 shadow-[0_-10px_20px_rgba(0,0,0,0.2)]">
                    <div className="flex items-center gap-4 mb-3">
                        <div className="flex items-center bg-background/50 rounded-xl p-1 border border-text-light/5">
                            <button 
                                onClick={() => setQuantity(Math.max(1, quantity - 1))} 
                                className="w-10 h-10 flex items-center justify-center text-primary bg-surface rounded-lg hover:bg-background active:scale-90 transition-all font-black text-xl"
                            >
                                <LucideMinus size={18} />
                            </button>
                            <span className="text-lg font-black text-text-light w-10 text-center">{quantity}</span>
                            <button 
                                onClick={() => setQuantity(quantity + 1)} 
                                className="w-10 h-10 flex items-center justify-center text-primary bg-surface rounded-lg hover:bg-background active:scale-90 transition-all font-black text-xl"
                            >
                                <LucidePlus size={18} />
                            </button>
                        </div>
                        <div className="flex-1 text-right">
                            <p className="text-[9px] font-black text-text-dark uppercase tracking-widest leading-none mb-1">Total do Item</p>
                            <p className="text-xl font-black text-primary tracking-tighter leading-none">
                                R$ {((item.price + selectedAddons.reduce((s, a) => s + a.price, 0) + (isCombo ? comboPrice : 0)) * quantity).toFixed(2)}
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={handleAddToCart} 
                        className="w-full py-4 bg-primary hover:brightness-110 active:scale-[0.98] text-background font-black rounded-xl text-base uppercase tracking-widest transition-all shadow-xl shadow-primary/10 flex items-center justify-center gap-3"
                    >
                        <span>Adicionar ao Pedido</span>
                        <LucideArrowRight size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
};

const CustomerRecognitionBar: React.FC<{ onPhoneSubmit: (phone: string) => void; isLoading: boolean }> = ({ onPhoneSubmit, isLoading }) => {
    const [phone, setPhone] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        console.log("CustomerRecognitionBar: Submit clicked with phone:", phone);
        if (phone.replace(/\D/g, '').length >= 8) {
            onPhoneSubmit(phone);
        } else {
            console.warn("CustomerRecognitionBar: Phone too short:", phone);
        }
    };

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/\D/g, '');

        if (value.length <= 9) {
            setPhone(value);
        } else {
            let formatted = value;
            if (formatted.length > 11) formatted = formatted.slice(0, 11);

            if (formatted.length > 2) {
                formatted = `(${formatted.slice(0, 2)}) ${formatted.slice(2)}`;
            }
            if (formatted.length > 9) {
                formatted = `${formatted.slice(0, 9)}-${formatted.slice(9)}`;
            }
            setPhone(formatted);
        }
    };

    return (
        <div id="tour-fidelity" className="w-full relative overflow-hidden shrink-0 shadow-[0_4px_20px_rgba(0,0,0,0.4)] border-b border-[#ffd700]/30"
             style={{
                 backgroundImage: "url('/chatgpt_bolao_bg.png')",
                 backgroundSize: "cover",
                 backgroundPosition: "center"
             }}>
            {/* Base Overlay suave para garantir legibilidade sem esconder a imagem */}
            <div className="absolute inset-0 bg-black/30"></div>
            
            {/* Premium Glow Effects */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#ffd700] rounded-full mix-blend-screen filter blur-[50px] opacity-40 animate-pulse-slow"></div>

            <div className="relative z-10 py-4 px-4 flex flex-col sm:flex-row items-center justify-between gap-3 w-full max-w-5xl mx-auto">
                <div className="flex flex-col items-center sm:items-start justify-center w-full sm:w-auto">
                    <div className="flex items-center gap-2">
                        <span className="text-xl md:text-2xl drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]">🍧</span>
                        <h2 className="font-black text-base md:text-xl text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-purple-100 to-white uppercase tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] leading-none">
                            Açaí do Dudu
                        </h2>
                    </div>
                    <p className="text-[10px] md:text-xs font-black text-purple-100 uppercase tracking-widest mt-1 text-center sm:text-left w-full drop-shadow-md">
                        O Melhor Açaí da Cidade • Peça Já!
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="flex items-center justify-between w-full sm:w-auto sm:min-w-[320px] max-w-[350px] mx-auto sm:mx-0 bg-black/50 p-1.5 rounded-xl border border-white/20 backdrop-blur-md shadow-2xl">
                    <input
                        type="tel"
                        value={phone}
                        onChange={handlePhoneChange}
                        placeholder="Digite seu telefone..."
                        className="bg-transparent border-none px-3 py-1.5 text-sm font-bold text-white placeholder-gray-400 focus:outline-none focus:ring-0 flex-grow transition-all min-w-0"
                        maxLength={15}
                    />
                    <button
                        type="submit"
                        disabled={isLoading || phone.replace(/\D/g, '').length < 8}
                        className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-5 py-2 rounded-lg text-xs font-black hover:from-orange-400 hover:to-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-widest whitespace-nowrap shrink-0 shadow-[0_0_15px_rgba(249,115,22,0.3)] hover:shadow-[0_0_20px_rgba(249,115,22,0.5)] transform hover:-translate-y-0.5"
                    >
                        {isLoading ? '...' : 'Entrar'}
                    </button>
                </form>
            </div>
        </div>
    );
};




const NewCustomerModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onProceed: () => void;
}> = ({ isOpen, onClose, onProceed }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-[70] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-surface rounded-xl p-6 max-w-sm w-full shadow-2xl border border-primary text-center relative">
                <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-white">
                    <LucideX className="w-5 h-5" />
                </button>
                <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                    <span className="text-3xl">✨</span>
                </div>
                <h2 className="text-2xl font-display text-primary mb-2">Bem-vindo(a)!</h2>
                <p className="text-white text-base mb-6">
                    Parece que é sua primeira vez por aqui. Que tal já preencher seus dados para agilizar seu pedido? Vai ficar tudo salvo para a próxima! 😉
                </p>
                <div className="space-y-3">
                    <button
                        onClick={onProceed}
                        className="w-full py-3 bg-primary hover:bg-primary-dark text-background font-bold rounded-lg text-base transition-transform transform hover:scale-105 shadow-lg"
                    >
                        🚀 Preencher meus dados
                    </button>
                    <button
                        onClick={onClose}
                        className="w-full py-2 bg-transparent text-text-light hover:text-white text-sm font-medium transition-colors"
                    >
                        Só dar uma olhadinha no cardápio
                    </button>
                </div>
            </div>
        </div>
    );
};

const RewardCelebrationModal: React.FC<{ isOpen: boolean; onClose: () => void; onRedeem: (type: 'discount' | 'item') => void }> = ({ isOpen, onClose, onRedeem }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 animate-fade-in bg-black/80 backdrop-blur-sm">
            <div className="bg-gradient-to-br from-yellow-500 to-orange-600 rounded-3xl p-1 shadow-2xl w-full max-w-sm relative overflow-hidden animate-bounce-in">
                <div className="bg-surface rounded-[20px] p-8 text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 pointer-events-none"></div>

                    <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-white z-20">
                        <LucideX size={24} />
                    </button>

                    <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg animate-pulse-slow relative z-10">
                        <span className="text-6xl">🏆</span>
                    </div>

                    <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 mb-2 uppercase italic tracking-wider relative z-10">
                        Parabéns!
                    </h2>

                    <p className="text-white text-lg font-bold mb-4 relative z-10">
                        Você completou 10 selos!
                    </p>
                    <p className="text-gray-400 text-sm mb-6 leading-relaxed relative z-10">
                        Escolha seu prêmio abaixo:
                    </p>

                    <div className="space-y-3 relative z-10">
                        <button
                            onClick={() => {
                                console.log("Button DISCOUNT clicked");
                                onRedeem('discount');
                            }}
                            className="w-full py-3 bg-gray-800 hover:bg-gray-700 border border-green-500/30 text-white rounded-xl shadow-lg transition-all flex items-center p-4 group cursor-pointer"
                        >
                            <span className="text-3xl mr-3 group-hover:scale-110 transition-transform">💸</span>
                            <div className="text-left">
                                <span className="block font-bold text-green-400">R$ 20,00 OFF</span>
                                <span className="text-xs text-gray-400">Desconto no total</span>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const CustomerPage: React.FC = () => {
    const navigate = useNavigate();
    const { currentStore, loading: storeLoading } = useStore();

    // Theme Toggle Logic
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === 'light') {
            root.classList.add('light-mode');
            root.classList.remove('dark');
        } else {
            root.classList.remove('light-mode');
            root.classList.add('dark');
        }
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    // State for pending reward (integrated into Loyalty Modal)
    type PendingReward = { type: 'item', item: MenuItem } | { type: 'discount', value: number } | null;
    const [pendingReward, setPendingReward] = useState<PendingReward>(null);

    const [settings, setSettings] = useState<Partial<Settings> | null>(null);
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [menu, setMenu] = useState<{ categories: Category[], menuItems: MenuItem[], addons: Addon[] }>({ categories: [], menuItems: [], addons: [] });
    const [searchTerm, setSearchTerm] = useState('');
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isCartAnimating, setIsCartAnimating] = useState(false);

    // Customer Recognition State
    const [recognizedCustomer, setRecognizedCustomer] = useState<Customer | null>(null);
    const [lastOrder, setLastOrder] = useState<Order | null>(null);
    const [showRecognitionModal, setShowRecognitionModal] = useState(false);
    const [showNewCustomerModal, setShowNewCustomerModal] = useState(false); // New state
    const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
    const [isRepeatingOrder, setIsRepeatingOrder] = useState(false);
    
    // Modern Landing Page State
    const [showLanding, setShowLanding] = useState(true);

    // Reward Celebration State
    const [showRewardCelebration, setShowRewardCelebration] = useState(false);
    const prevStampsRef = useRef(0);
    const [orderDiscount, setOrderDiscount] = useState(0);

    const matchingPromotions = useMemo(() => {
        if (!searchTerm) return [];
        const normalizedSearch = normalizeString(searchTerm);
        return promotions.filter(promo => 
            promo.isActive && 
            (normalizeString(promo.name).includes(normalizedSearch) || 
             normalizeString(promo.description || '').includes(normalizedSearch))
        );
    }, [promotions, searchTerm]);

    // Celebration Watcher (Moved to CustomerPage)
    useEffect(() => {
        if (!recognizedCustomer) return;

        fetchCustomerLoyaltyHistory(recognizedCustomer.phone, currentStore?.id || '')
            .then(history => {
                const currentStamps = history.length;
                const prevStamps = prevStampsRef.current;

                if (currentStamps > 0 && currentStamps % 10 === 0 && currentStamps > prevStamps) {
                    setShowRewardCelebration(true);
                }
                prevStampsRef.current = currentStamps;
            })
            .catch(console.error);

    }, [recognizedCustomer, lastOrder, currentStore]);
    
    const handleRedeemReward = (type: 'item' | 'discount') => {
        if (!currentStore?.id) return;

        if (type === 'item') {
            // Logic: Find X-Tudo or create synthetic fallback
            const xTudoItem = menu.menuItems.find(item => normalizeString(item.name) === 'xtudo');

            let rewardItem: MenuItem;

            if (xTudoItem) {
                rewardItem = { ...xTudoItem, price: 0 };
            } else {
                // Synthetic Fallback
                rewardItem = {
                    id: 999999,
                    name: "Fidelidade X-Tudo",
                    description: "Prêmio resgatado por fidelidade (Item não listado no cardápio)",
                    price: 0,
                    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80", // Generic burger image
                    categoryId: -1,
                    eligibleForCombo: false,
                    isCombo: false,
                    selectedAddons: [],
                    store_id: currentStore.id,
                    isAvailable: true,
                    allowedAddons: [],
                    addons: []
                };
            }

            setPendingReward({ type: 'item', item: rewardItem });
            setShowRewardCelebration(false); // Close celebration
            // Ensure Loyalty Modal is open (it should be, but just in case)
            setShowRecognitionModal(true);

        } else if (type === 'discount') {
            setPendingReward({ type: 'discount', value: 20 });
            setShowRewardCelebration(false);
            setShowRecognitionModal(true);
        }
    };


    // Lifted State
    const [customerName, setCustomerName] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [houseNumber, setHouseNumber] = useState('');
    const [referencePoint, setReferencePoint] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cartão');
    const [changeFor, setChangeFor] = useState('');
    const [orderType, setOrderType] = useState<OrderType>('Entrega');


    // Dynamic Delivery Fee State
    const [dynamicDeliveryFee, setDynamicDeliveryFee] = useState<number | null>(null);

    const updateFee = useCallback(async (addr: string) => {
        if (!addr || addr.trim().length < 3) {
            setDynamicDeliveryFee(null);
            return;
        }
        console.log(`[FeeDebug] Fetching dynamic fee for address: "${addr}"`);
        const fee = await fetchDynamicDeliveryFee(addr);
        console.log(`[FeeDebug] Fee result: ${fee}`);
        setDynamicDeliveryFee(fee);
    }, []);

    // Watch address changes in the cart
    useEffect(() => {
        if (orderType === 'Entrega') {
            const timer = setTimeout(() => {
                updateFee(address);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [address, orderType, updateFee]);

    // Polling for Last Order Status (when modal is open) - MOVED HERE
    useEffect(() => {
        if (!showRecognitionModal || !phone || !currentStore) return;

        const updateStatus = async () => {
            try {
                // Ensure phone is sanitized if needed, but handleHeroPhoneSubmit already does this
                const order = await fetchLastOrderByPhone(phone, currentStore.id);
                if (order) {
                    // Only update the status and essential fields, don't overwrite the whole object 
                    // to prevent losing local edits in the Loyalty UI
                    setLastOrder(prev => {
                        if (!prev) return order;
                        if (prev.status !== order.status) {
                            return { ...prev, status: order.status };
                        }
                        return prev;
                    });
                }
            } catch (error) {
                console.error("Error polling order status:", error);
            }
        };

        const interval = setInterval(updateStatus, 10000); // Poll every 10s
        return () => clearInterval(interval);
    }, [showRecognitionModal, phone, currentStore]);

    // State for Quick/Repeat Order Success Modal
    const [showRepeatSuccess, setShowRepeatSuccess] = useState(false);
    const [repeatOrderId, setRepeatOrderId] = useState<string | undefined>(undefined);

    const handleHeroPhoneSubmit = async (phoneInput: string) => {
        console.log("handleHeroPhoneSubmit called with:", phoneInput);
        if (!currentStore) {
            console.error("handleHeroPhoneSubmit: No currentStore found!");
            return;
        }
        setIsSearchingCustomer(true);

        // Normalize Phone: Prepend '32' if missing (assuming 8 or 9 digits means no DDD)
        let sanitizedPhone = phoneInput.replace(/\D/g, '');
        if (sanitizedPhone.length === 8 || sanitizedPhone.length === 9) {
            sanitizedPhone = '32' + sanitizedPhone;
        }
        console.log("handleHeroPhoneSubmit: Sanitized phone:", sanitizedPhone);

        // Update state with normalized phone
        setPhone(sanitizedPhone);

        try {
            const customer = await fetchCustomerByPhone(sanitizedPhone, currentStore.id);
            if (customer) {
                setRecognizedCustomer(customer);

                // Populate lifted state
                setCustomerName(customer.name);
                setPhone(customer.phone);
                // Split address and number if present accurately
                const addrParts = (customer.address || '').split(', ');
                if (addrParts.length >= 2) {
                    setHouseNumber(addrParts[addrParts.length - 1]);
                    setAddress(addrParts.slice(0, -1).join(', '));
                } else {
                    setAddress(customer.address || '');
                    setHouseNumber('');
                }
                setReferencePoint(customer.reference_point || '');
                
                // Immediately check for dynamic delivery fee!
                if (customer.address) {
                    updateFee(customer.address);
                }
                
                // Set Payment Preferences from Customer Profile if available
                if (customer.preferred_payment_method) {
                    setPaymentMethod(customer.preferred_payment_method as PaymentMethod);
                }
                if (customer.last_change_for) {
                    setChangeFor(customer.last_change_for.toString());
                }

                // Fetch last order
                const order = await fetchLastOrderByPhone(phoneInput, currentStore.id);
                if (order) {
                    setLastOrder(order);
                    if (order.paymentMethod) setPaymentMethod(order.paymentMethod);
                    if (order.changeFor) setChangeFor(order.changeFor.toString());
                }

                setShowRecognitionModal(true);
            } else {
                // New Customer: Clear previous data!
                setCustomerName('');
                setPhone(phoneInput);
                setAddress('');
                setReferencePoint('');
                setPaymentMethod('Cartão');
                setChangeFor('');
                setLastOrder(null);
                setRecognizedCustomer(null);

                // Show Welcome Modal instead of opening cart directly
                setShowNewCustomerModal(true);
            }
        } catch (error) {
            console.error("Error searching customer:", error);
        } finally {
            setIsSearchingCustomer(false);
        }
    };

    // Sync payment method with last order when it loads
    useEffect(() => {
        if (lastOrder) {
            setPaymentMethod(lastOrder.paymentMethod);
            setChangeFor(lastOrder.changeFor || '');
        }
    }, [lastOrder]);

    // Onboarding Tour Logic - Wait for items to load
    useEffect(() => {
        const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
        
        // Wait for menuItems to be populated before starting the tour
        // Using `menu.menuItems` as the correct source of truth
        if (!hasSeenOnboarding && menu.menuItems.length > 0) {
            // Small delay to ensure DOM is fully painted
            const timer = setTimeout(() => {
                introJs()
                    .setOptions({
                        steps: [
                            {
                                title: 'Bem-vindo! 👋',
                                intro: 'Bem-vindo ao Açaí do Dudu! Vamos te mostrar como fazer seu pedido rapidinho.'
                            },
                            {
                                element: '#tour-fidelity',
                                title: 'Fidelidade & Agilidade 🚀',
                                intro: 'Digite seu telefone aqui para identificar seus pedidos anteriores e participar do nosso **Programa de Fidelidade**! A cada 10 pedidos, ganhe prêmios!'
                            },
                            {
                                element: '#tour-categories',
                                title: 'Categorias 🍔',
                                intro: 'Navegue pelas categorias aqui para encontrar Lanches ou Açaís.'
                            },
                            {
                                element: '#tour-search',
                                title: 'Busca 🔍',
                                intro: 'Já sabe o que quer? Digite aqui (ex: "X-Tudo", "Coca").'
                            },
                            {
                                element: '#tour-product-first',
                                title: 'Produtos 😋',
                                intro: 'Clique no produto para adicionar. Se tiver opcionais, você poderá escolher na próxima tela!'
                            },
                            {
                                element: '#tour-cart',
                                title: 'Seu Carrinho 🛒',
                                intro: 'Seus itens aparecem aqui. Clique para ver o resumo e finalizar o pedido.'
                            },
                            {
                                element: '#tour-fidelity',
                                title: 'Dica de Mestre 💡',
                                intro: 'Depois de preencher seus dados no carrinho hoje, na próxima vez basta digitar seu telefone aqui para carregar tudo automático!'
                            }
                        ],
                        showProgress: true,
                        showBullets: false,
                        exitOnOverlayClick: true,
                        nextLabel: 'Próximo',
                        prevLabel: 'Voltar',
                        doneLabel: 'Entendido!',
                        dontShowAgain: true,
                        dontShowAgainLabel: 'Não mostrar novamente',
                        scrollToElement: true,
                        scrollPadding: 150
                    })
                    .onexit(() => localStorage.setItem('hasSeenOnboarding', 'true'))
                    .oncomplete(() => localStorage.setItem('hasSeenOnboarding', 'true'))
                    .start();
            }, 1000); 
            
            return () => clearTimeout(timer);
        }
    }, [menu]);

    // TRIGGER RESET FOR TEST USER (Temporary Fix)
    useEffect(() => {
        if (recognizedCustomer && recognizedCustomer.phone === '32920007226' && recognizedCustomer.total_orders > 20) {
            console.log("Auto-resetting stats for test user...");
            upsertCustomer({
                ...recognizedCustomer,
                total_orders: 0
            }).then(updated => {
                if (updated) setRecognizedCustomer(updated);
            });
        }
    }, [recognizedCustomer]);

    // Updated signature to accept string observation as second arg (or via customItems context)
    const handleRepeatOrder = async (customItems?: CartItem[], observation?: string) => {
        if (!recognizedCustomer || !lastOrder || !currentStore || !settings) return;
        setIsRepeatingOrder(true);

        try {
            const finalPaymentMethod = paymentMethod;
            let finalChange = changeFor ? parseFloat(changeFor) : undefined;

            // Calculate Base Logic
            let mergedItems: CartItem[] = [];
            let effectiveDiscount = orderDiscount;

            if (customItems && customItems.length > 0) {
                mergedItems = [...customItems];
                if (pendingReward?.type === 'discount') {
                    effectiveDiscount = Math.max(effectiveDiscount, pendingReward.value);
                }
            } else {
                // Default Logic: Filter out previous reward items to avoid duplication
                mergedItems = lastOrder.items.filter(item =>
                    item.price > 0 && !item.name.toLowerCase().includes('fidelidade') && !item.notes?.toLowerCase().includes('fidelidade')
                );

                // INTEGRATE PENDING REWARD
                if (pendingReward) {
                    if (pendingReward.type === 'item') {
                        const rewardCartItem: CartItem = {
                            ...pendingReward.item,
                            cartId: `reward-${Date.now()}`,
                            quantity: 1,
                            notes: 'Fidelidade - GRÁTIS',
                            price: 0
                        };
                        mergedItems.push(rewardCartItem);
                    } else if (pendingReward.type === 'discount') {
                        effectiveDiscount = Math.min(20, Math.max(effectiveDiscount, pendingReward.value));
                    }
                } else {
                    mergedItems = [...mergedItems, ...cart];
                }
            }

            // Set global order discount if repeat logic calculated one
            if (effectiveDiscount > 0) {
                setOrderDiscount(effectiveDiscount);
            }

            const subtotal = mergedItems.reduce((acc, i) => acc + (i.price * i.quantity), 0);
            const discountValue = orderType === 'Retirada' ? subtotal * ((settings?.appDiscountPercentage || 0) / 100) : 0;
            
            let finalDeliveryFee = 0;
            if (lastOrder.orderType === 'Entrega' || orderType === 'Entrega') {
                const fetchedFee = await fetchDynamicDeliveryFee(address);
                finalDeliveryFee = fetchedFee !== null ? fetchedFee : (dynamicDeliveryFee ?? settings?.deliveryFee ?? 0);
            }

            const total = subtotal - discountValue + finalDeliveryFee - effectiveDiscount;

            let finalPhone = recognizedCustomer.phone;
            const defaultDDD = settings?.defaultDDD || '32';
            if (finalPhone.length === 8 || finalPhone.length === 9) {
                finalPhone = `${defaultDDD}${finalPhone}`;
            }

            const finalItems = [...mergedItems];
            if (effectiveDiscount > 0) {
                finalItems.push({
                    id: 888888,
                    name: "DESCONTO FIDELIDADE",
                    price: -effectiveDiscount,
                    quantity: 1,
                    selectedAddons: [],
                    notes: 'Resgate de fidelidade',
                    cartId: `discount-${Date.now()}`
                } as any);
            }

            const orderData: any = {
                dailyOrderNumber: 0,
                customerName: recognizedCustomer.name,
                phone: finalPhone,
                address: `${address}, ${houseNumber}`,
                referencePoint,
                orderType: lastOrder.orderType || orderType,
                paymentMethod: finalPaymentMethod,
                changeFor: finalChange,
                items: finalItems,
                total: total,
                discount: effectiveDiscount > 0 ? effectiveDiscount : undefined,
                deliveryFee: finalDeliveryFee,
                status: 'Novo',
                store_id: currentStore.id,
                observation: observation || '',
                origin: 'WEB'
            };

            const createdOrder = await createOrder(orderData);

            if (createdOrder) {
                if (effectiveDiscount > 0 || (pendingReward && pendingReward.type === 'item')) {
                    try {
                         await redeemLoyaltyReward(finalPhone, currentStore.id);
                    } catch (e) {
                         console.error(e);
                    }
                }

                setCart([]);
                setOrderDiscount(0);
                setPendingReward(null);
                setShowRepeatSuccess(true);
                setRepeatOrderId(createdOrder.id);
                setShowRecognitionModal(false);
                
                if (settings?.webhookNewOrderUrl) {
                    try {
                        await triggerWebhook(settings.webhookNewOrderUrl, createdOrder);
                    } catch (e) {}
                }
            } else {
                throw new Error("Falha ao criar o pedido.");
            }

        } catch (error) {
            console.error("Error repeating order:", error);
            alert("Erro ao repetir pedido. Verifique o console para mais detalhes.");
        } finally {
            setIsRepeatingOrder(false);
        }
    };
    const handleNewOrderWithCustomer = () => {
        console.log("handleNewOrderWithCustomer called - Closing modal");
        setShowRecognitionModal(false);

        // Apply Pending Reward Logic
        if (pendingReward) {
            if (pendingReward.type === 'item') {
                const rewardCartItem: CartItem = {
                    ...pendingReward.item,
                    cartId: `reward-${Date.now()}`,
                    quantity: 1,
                    notes: 'Fidelidade - GRÁTIS',
                    price: 0
                };
                handleAddToCart(rewardCartItem);
                setIsCartOpen(true); // Open cart to show item
                // alert("Item de fidelidade adicionado ao carrinho!");
            } else if (pendingReward.type === 'discount') {
                setOrderDiscount(Math.min(20, pendingReward.value));
                setIsCartOpen(true);
                // alert(`Desconto de fidelidade de R$ ${pendingReward.value} aplicado!`);
            }
        }
    };

    const handleUpdateCustomerAddress = async (newAddress: string, newNumber: string, newReference: string, newPaymentMethod?: PaymentMethod, newChangeFor?: string) => {
        if (!currentStore || !recognizedCustomer) return;

        // 1. Update Local State (for Repeat Order)
        setAddress(newAddress);
        setHouseNumber(newNumber);
        setReferencePoint(newReference);
        if (newPaymentMethod) setPaymentMethod(newPaymentMethod);
        if (newChangeFor !== undefined) setChangeFor(newChangeFor);

        // 2. Update Recognized Customer Object (for UI display)
        const fullAddress = newNumber ? `${newAddress}, ${newNumber}` : newAddress;
        setRecognizedCustomer({
            ...recognizedCustomer,
            address: fullAddress,
            reference_point: newReference
        });

        // 3. Update Last Order State (so UI and Repeat Order reflect the change immediately)
        if (lastOrder) {
            setLastOrder({
                ...lastOrder,
                paymentMethod: newPaymentMethod || lastOrder.paymentMethod,
                changeFor: newChangeFor !== undefined ? newChangeFor : lastOrder.changeFor
            });
        }

        // 4. Persist to Database
        try {
            await upsertCustomer({
                store_id: currentStore.id,
                phone: recognizedCustomer.phone,
                name: recognizedCustomer.name,
                address: fullAddress,
                reference_point: newReference,
                preferred_payment_method: newPaymentMethod,
                last_change_for: newChangeFor ? parseFloat(newChangeFor) : undefined
            });
            console.log("Customer address updated successfully");
            updateFee(fullAddress);
        } catch (error) {
            console.error("Error updating customer address:", error);
            alert("Erro ao salvar endereço. Mas ele será usado neste pedido.");
        }
    };

    const ADDON_CATEGORY_IDS = [10]; // Removed 11 (Diversos)

    const { isStoreOpen, statusMessage } = useStoreStatus(settings);
    const { isInstallable, install, isIOS } = usePWAInstall();

    const loadData = async () => {
        if (!currentStore) return;

        // Safety timeout to prevent infinite spinner
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout loading data")), 10000)
        );

        try {
            setIsLoading(true);
            console.log("CustomerPage: Starting loadData for store:", currentStore.name);

            const loadPromise = Promise.all([
                fetchPublicSettings(currentStore.id),
                fetchActivePromotions(currentStore.id),
                fetchMenuForCustomer(currentStore.id)
            ]);

            const [settingsData, promotionsData, menuData] = await Promise.race([loadPromise, timeoutPromise]) as any;

            console.log("CustomerPage: Data fetched successfully");

            const availableMenuItems = menuData.menuItems;

            const displayCategories = menuData.categories.filter(
                (category: Category) => {
                    const name = category.name.toLowerCase().trim();
                    return !ADDON_CATEGORY_IDS.includes(category.id) &&
                        !name.includes('adicionais de açaí') &&
                        !name.includes('adicionais de lanche') &&
                        !name.includes('sabores de milk-shake') &&
                        !name.includes('promocao') &&
                        !name.includes('promoção');
                }
            );

            const categoryOrder = ['tradicionais', 'lanches', 'gourmet', 'hamburgueres', 'porcoes', 'bebidas', 'milk', 'acai'];
            displayCategories.sort((a: Category, b: Category) => {
                const nameA = normalizeString(a.name);
                const nameB = normalizeString(b.name);

                const getIndex = (name: string) => {
                    const index = categoryOrder.findIndex(key => name.includes(key));
                    return index === -1 ? 999 : index;
                };

                const indexA = getIndex(nameA);
                const indexB = getIndex(nameB);

                if (indexA !== indexB) return indexA - indexB;
                return a.id - b.id; // Secondary sort: By ID (Insertion Order)
            });

            // Removed: manual Promoções category unshift (now exclusively in carousel)

            setSettings(settingsData);
            setPromotions(promotionsData);
            setMenu({ categories: displayCategories, menuItems: availableMenuItems, addons: menuData.addons || [] });

        } catch (err: any) {
            console.error("Failed to load customer page data:", err);
            setError(err.message || "Não foi possível carregar o cardápio. Tente recarregar a página.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!storeLoading && currentStore) {
            loadData();
        } else if (!storeLoading && !currentStore) {
            setIsLoading(false);
        }
    }, [currentStore, storeLoading]);

    useEffect(() => {
        if (cart.length > 0) {
            setIsCartAnimating(true);
            const timer = setTimeout(() => setIsCartAnimating(false), 300);
            return () => clearTimeout(timer);
        }
    }, [cart.length]);

    const handleDirectAddToCart = useCallback((item: MenuItem) => {
        setCart(prev => {
            const existingItem = prev.find(i => i.id === item.id && !i.isCombo && i.selectedAddons.length === 0);
            if (existingItem) {
                return prev.map(i => i.cartId === existingItem.cartId ? { ...i, quantity: i.quantity + 1 } : i);
            }
            return [...prev, {
                ...item,
                cartId: `${item.id}-${Date.now()}`,
                quantity: 1,
                isCombo: false,
                selectedAddons: [],
                notes: '',
            }];
        });
    }, []);

    const handleAddToCart = useCallback((item: CartItem) => {
        setCart(prev => [...prev, item]);
    }, []);

    const handleUpdateCart = useCallback((item: CartItem, quantity: number) => {
        if (quantity < 1) {
            handleRemoveFromCart(item.cartId);
        } else {
            setCart(prev => prev.map(ci => ci.cartId === item.cartId ? { ...ci, quantity } : ci));
        }
    }, []);

    const handleRemoveFromCart = useCallback((cartId: string) => {
        setCart(prev => prev.filter(item => item.cartId !== cartId));
    }, []);

    const handleClearCart = useCallback(() => {
        setCart([]);
    }, []);

    const handleOpenItemModal = (item: MenuItem) => {
        const category = menu.categories.find(c => c.id === item.categoryId);
        // Check if item has any linked addons (flavors, extras) or category addons
        const hasAddons = (item.selectedAddons && item.selectedAddons.length > 0) || (item.addons && item.addons.length > 0);

        if (category?.name === 'Bebidas' && !hasAddons) {
            handleDirectAddToCart(item);
        } else {
            setSelectedItem(item);
        }
    };

    const cartItemCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);





    // Polling for settings (Raffle winner, open/close status, etc.)
    useEffect(() => {
        if (!currentStore) return;

        const loadSettings = async () => {
            try {
                const data = await fetchPublicSettings(currentStore.id);
                setSettings(data);
            } catch (error) {
                console.error("Error polling settings:", error);
            }
        };

        const interval = setInterval(loadSettings, 30000); // Poll every 30 seconds
        return () => clearInterval(interval);
    }, [currentStore]);

    if (storeLoading || isLoading) {
        return <div className="flex items-center justify-center h-screen bg-background"><div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
    }

    if (!currentStore) return <div className="text-center text-white mt-10">Loja não encontrada.</div>;

    if (error) {
        return <div className="flex items-center justify-center h-screen bg-background text-center text-red-400 p-4"><div><h2 className="text-2xl mb-4">Ocorreu um Erro</h2><p>{error}</p></div></div>;
    }

    if (showLanding) {
        return (
            <div className="bg-[#111111] min-h-screen text-white font-sans flex flex-col relative">
                {/* Header Logo */}
                <div className="absolute top-8 left-0 right-0 z-20 flex justify-center pointer-events-none">
                    {currentStore.logo_url ? (
                        <img src={currentStore.logo_url} alt="Logo" className="h-32 w-auto object-contain drop-shadow-[0_0_15px_rgba(0,0,0,0.8)]" />
                    ) : (
                        <h1 className="text-3xl font-black italic drop-shadow-lg text-white">Açaí do Dudu</h1>
                    )}
                </div>

                {/* Hero Image */}
                <div className="relative h-[55vh] w-full bg-black rounded-b-[40px] overflow-hidden shadow-[0_10px_50px_rgba(0,0,0,0.8)]">
                    <img 
                        src="/acai_boat_hero.jpg" 
                        alt="Açaí Hero" 
                        className="w-full h-full object-cover opacity-90 scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#111111] via-transparent to-black/70"></div>
                    <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-transparent"></div>
                </div>

                {/* Categories */}
                <div className="flex-1 flex flex-col items-center justify-center px-6 -mt-16 z-10 relative">
                    <div className="grid grid-cols-3 gap-5 w-full max-w-md mb-12">
                        {['AÇAÍ', 'PORÇÕES', 'BEBIDAS'].map((catName) => (
                            <button
                                key={catName}
                                onClick={() => {
                                    setShowLanding(false);
                                    setTimeout(() => {
                                        const search = normalizeString(catName);
                                        const targetCat = menu.categories.find(c => 
                                            search.includes('bebida') 
                                            ? !normalizeString(c.name).includes('acai') && !normalizeString(c.name).includes('porc')
                                            : normalizeString(c.name).includes(search)
                                        );
                                        if (targetCat) {
                                            document.getElementById(`category-${targetCat.id}`)?.scrollIntoView({ behavior: 'smooth' });
                                        }
                                    }, 100);
                                }}
                                className="flex flex-col items-center gap-2 group transition-transform active:scale-95"
                            >
                                <div className="w-[90px] h-[90px] bg-[#1a1a1a] border border-white/10 rounded-2xl flex items-center justify-center shadow-2xl group-hover:border-red-500/50 transition-colors">
                                    {catName === 'AÇAÍ' && <span className="text-4xl filter drop-shadow-lg">🍇</span>}
                                    {catName === 'PORÇÕES' && <span className="text-4xl filter drop-shadow-lg">🍟</span>}
                                    {catName === 'BEBIDAS' && <span className="text-4xl filter drop-shadow-lg">🥤</span>}
                                </div>
                                <span className="text-[11px] font-black uppercase tracking-widest text-gray-300 drop-shadow-sm">
                                    {catName}
                                </span>
                            </button>
                        ))}
                    </div>

                    <button 
                        onClick={() => setShowLanding(false)}
                        className="w-full max-w-sm bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-black text-xl py-4 rounded-full shadow-[0_8px_30px_rgba(245,158,11,0.3)] active:scale-95 transition-transform"
                    >
                        FAÇA SEU PEDIDO
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-background text-text-light min-h-screen">

            <RewardCelebrationModal isOpen={showRewardCelebration} onClose={() => setShowRewardCelebration(false)} onRedeem={handleRedeemReward} />
            <div className="fixed top-0 left-0 right-0 z-40 bg-background shadow-md overflow-hidden">
                <StoreStatusBanner isOpen={isStoreOpen} message={statusMessage} />
                <Header onAdminClick={() => navigate('admin')} onMotoboyClick={() => navigate('entregador')} onWaiterClick={() => navigate('garcom')} settings={settings} onToggleTheme={toggleTheme} currentTheme={theme} />
                <DiscountBanner settings={settings} />
                <RaffleBanner settings={settings} />
                {(isInstallable || isIOS) && <PWAInstallBanner onInstall={install} isIOS={isIOS} />}
                <CustomerRecognitionBar onPhoneSubmit={handleHeroPhoneSubmit} isLoading={isSearchingCustomer} />
                <ProductSearchBar value={searchTerm} onChange={setSearchTerm} />
                {!searchTerm && <CategoryNav categories={menu.categories} />}
            </div>

            <DraggableCart 
                onClick={() => setIsCartOpen(true)} 
                itemCount={cartItemCount} 
                isAnimating={isCartAnimating} 
            />

            {/* Fixed Height Spacer - Safest for mobile performance */}
            <div className="h-[260px] md:h-[220px]"></div>
            <main className="pb-32 px-4 relative z-0 overflow-x-hidden w-full max-w-full">
                {promotions.length > 0 && !searchTerm && (
                    <section id="category--1" className="w-full py-1 relative z-0 overflow-hidden">
                         {/* 3D Carousel Component - Reduced height to minimize yellow gap */}
                         <div className="relative h-48 w-full max-w-md mx-auto perspective-1000 overflow-hidden">
                           <PromotionsCoverflow promotions={promotions} onAddToCart={handleAddToCart} />
                         </div>
                    </section>
                )}

                {/* Promoções encontradas na pesquisa */}
                {searchTerm && matchingPromotions.length > 0 && (
                    <MenuSection
                        category={{ id: -1, name: 'Promoções Encontradas', store_id: currentStore?.id || '' }}
                        items={matchingPromotions.map(p => ({
                            ...p,
                            categoryId: -1,
                            eligibleForCombo: false,
                            isCombo: false,
                            selectedAddons: [],
                            isAvailable: true,
                            addons: [],
                            description: p.description || ''
                        })) as any}
                        onAddItem={(item) => handleOpenItemModal(item as any)}
                        isFirst={true}
                    />
                )}
                {menu.categories.map((category, index) => {
                    const filteredItems = menu.menuItems.filter(item => {
                        const matchesCategory = item.categoryId === category.id;
                        if (!searchTerm) return matchesCategory;
                        
                        const normalizedSearch = normalizeString(searchTerm);
                        return matchesCategory && normalizeString(item.name).includes(normalizedSearch);
                    });

                    if (filteredItems.length === 0 && searchTerm) return null;

                    return (
                        <MenuSection
                            key={category.id}
                            category={category}
                            items={filteredItems}
                            onAddItem={handleOpenItemModal}
                            isFirst={index === 0}
                        />
                    );
                })}
            </main>

            <SideCart
                isOpen={isCartOpen}
                onClose={() => setIsCartOpen(false)}
                cart={cart}
                onUpdateCart={handleUpdateCart}
                onRemoveFromCart={handleRemoveFromCart}
                onClearCart={handleClearCart}
                isStoreOpen={isStoreOpen}
                settings={settings}
                storeId={currentStore?.id || ''}
                customerName={customerName}
                setCustomerName={setCustomerName}
                phone={phone}
                setPhone={setPhone}
                address={address}
                setAddress={setAddress}
                houseNumber={houseNumber}
                setHouseNumber={setHouseNumber}
                referencePoint={referencePoint}
                setReferencePoint={setReferencePoint}
                paymentMethod={paymentMethod}
                setPaymentMethod={setPaymentMethod}
                changeFor={changeFor}
                setChangeFor={setChangeFor}
                orderType={orderType}
                setOrderType={setOrderType}

                orderDiscount={orderDiscount}
                setOrderDiscount={setOrderDiscount}
                pendingReward={pendingReward}
                dynamicDeliveryFee={dynamicDeliveryFee}
            />

            <LoyaltyProfileModal
                isOpen={showRecognitionModal}
                onClose={() => setShowRecognitionModal(false)}
                customer={recognizedCustomer}
                lastOrder={lastOrder}
                onRepeatOrder={handleRepeatOrder}
                onNewOrder={handleNewOrderWithCustomer}
                isLoadingRepeat={isRepeatingOrder}
                storeId={currentStore?.id || ''}
                onTriggerReward={() => setShowRewardCelebration(true)}
                isStoreOpen={isStoreOpen}
                onUpdateAddress={handleUpdateCustomerAddress}
                pendingReward={pendingReward}
                dynamicDeliveryFee={dynamicDeliveryFee}
            />

            <NewCustomerModal
                isOpen={showNewCustomerModal}
                onClose={() => setShowNewCustomerModal(false)}
                onProceed={() => {
                    setShowNewCustomerModal(false);
                    setIsCartOpen(true);
                }}
            />
            {selectedItem && (
                <ItemDetailModal
                    item={selectedItem}
                    comboPrice={settings?.comboPrice ?? 13.00}
                    onAddToCart={handleAddToCart}
                    onClose={() => setSelectedItem(null)}
                    categoryName={menu.categories.find(c => c.id === selectedItem.categoryId)?.name || ''}
                />
            )}

            <SuccessModal
                isOpen={showRepeatSuccess}
                onClose={() => {
                    setShowRepeatSuccess(false);
                    setRecognizedCustomer(null);
                    setLastOrder(null);
                }}
                orderId={repeatOrderId}
                isRatingEnabled={settings?.isRatingEnabled ?? true}
            />

        </div>
    );
};

export default CustomerPage;
