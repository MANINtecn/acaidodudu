import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../contexts/StoreContext';
import { fetchMenuForCustomer, createOrder, fetchOccupiedTables, fetchAllOpenOrdersForTable, batchUpdateTableOrders, updateOrder, fetchActiveOrders, fetchSettings, supabase } from '../services/supabaseService';
import { Category, MenuItem, CartItem, Order, PaymentMethod, Settings, Addon } from '../types';
import { Search, Plus, Minus, X, ChevronRight, Bike, User, LogOut, Sun, Moon, DollarSign } from 'lucide-react';
import { normalizeString } from '../utils/searchUtils';
import { Notification, NotificationType } from '../components/Notification';
import { CounterTab } from '../components/CounterTab';
import { WaiterCheckoutModal } from '../components/WaiterCheckoutModal';

export default function WaiterPage() {
    const { currentStore, loading: storeLoading } = useStore();
    const navigate = useNavigate();

    // Theme Logic
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
            root.classList.remove('light-mode');
        } else {
            root.classList.remove('dark');
            root.classList.add('light-mode');
        }
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    // Data State
    const [categories, setCategories] = useState<Category[]>([]);
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [addons, setAddons] = useState<Addon[]>([]);
    const [settings, setSettings] = useState<Settings | null>(null);
    const [loadingMenu, setLoadingMenu] = useState(true);
    const [occupiedTables, setOccupiedTables] = useState<number[]>([]);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [pin, setPin] = useState('');
    const WAITER_PIN = 'papa012026';

    // Order State
    const [tableNumber, setTableNumber] = useState<string>('');
    const [isTableSelected, setIsTableSelected] = useState(false); 
    const [cart, setCart] = useState<CartItem[]>([]);
    const [existingItems, setExistingItems] = useState<CartItem[]>([]);
    const [baseDailyOrderNumber, setBaseDailyOrderNumber] = useState<number | null>(null);

    // View Mode
    const [viewMode, setViewMode] = useState<'tables' | 'counter'>('tables');
    const [activeOrders, setActiveOrders] = useState<Order[]>([]);
    const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);

    // UI State
    const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'all'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isPrintConfirmModalOpen, setIsPrintConfirmModalOpen] = useState(false);
    const [isCustomItemModalOpen, setIsCustomItemModalOpen] = useState(false);
    const [customItemName, setCustomItemName] = useState('');
    const [customItemPrice, setCustomItemPrice] = useState('');

    // Notification State
    const [notification, setNotification] = useState<{ show: boolean; message: string; type: NotificationType }>({
        show: false,
        message: '',
        type: 'success'
    });

    const showNotify = (message: string, type: NotificationType = 'success') => {
        setNotification({ show: true, message, type });
    };

    // Initial Load
    useEffect(() => {
        const savedAuth = localStorage.getItem('waiter_auth');
        if (savedAuth === 'true') {
            setIsAuthenticated(true);
        }
    }, []);

    useEffect(() => {
        if (isAuthenticated && !storeLoading && currentStore) {
            loadMenu();
            loadTables();
            loadSettings();
            
            // Fallback polling
            const interval = setInterval(() => {
                loadTables();
            }, 5000); 

            // Real-time listener for instant table updates
            const channel = supabase.channel('waiter_orders_changes')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `store_id=eq.${currentStore.id}` }, () => {
                    loadTables();
                })
                .subscribe();

            return () => {
                clearInterval(interval);
                supabase.removeChannel(channel);
            };
        }
    }, [currentStore, storeLoading, isAuthenticated]);

    const loadSettings = async () => {
        if (!currentStore) return;
        try {
            const data = await fetchSettings(currentStore.id);
            setSettings(data);
        } catch (error) {
            console.error(error);
        }
    };

    // Enhanced Table Loading
    const loadTables = async () => {
        if (!currentStore) return;
        try {
            // CENTRAL SYNC: Fetch all active orders to derive table status
            // This matches the logic used in the Admin executable for consistency
            const orders = await fetchActiveOrders(currentStore.id);
            setActiveOrders(orders);

            const occupiedFromOrders = orders
                .map(o => Number(o.table_number))
                .filter(n => n > 0);
            
            setOccupiedTables(Array.from(new Set(occupiedFromOrders)));
        } catch (error) {
            console.error("Error loading tables/orders:", error);
        }
    }

    const loadMenu = async () => {
        if (!currentStore) return;
        try {
            setLoadingMenu(true);
            const data = await fetchMenuForCustomer(currentStore.id);
            setCategories(data.categories);
            setMenuItems(data.menuItems);
            setAddons(data.addons || []);
        } catch (error) {
            console.error('Error loading menu:', error);
        } finally {
            setLoadingMenu(false);
        }
    };

    const handleSelectTable = async (num: string) => {
        if (!currentStore) return;
        
        setTableNumber(num);
        setIsTableSelected(true);
        
        const isOccupied = occupiedTables.includes(parseInt(num));
        
        if (isOccupied) {
            try {
                // Fetch ALL open orders for this table
                const orders = await fetchAllOpenOrdersForTable(currentStore.id, parseInt(num));
                if (orders.length > 0) {
                    // Combine all items into existingItems for visual reference
                    const allItems = orders.flatMap(o => o.items || []);
                    setExistingItems(allItems);
                    setBaseDailyOrderNumber(orders[0].dailyOrderNumber);
                    setCart([]); // Fresh cart for new additions
                    setIsCartOpen(true);
                    showNotify(`Mesa ${num} aberta. Adicione novos itens!`, 'success');
                } else {
                    setExistingItems([]);
                    setCart([]);
                }
            } catch (error) {
                console.error("Error fetching existing orders:", error);
                showNotify("Erro ao carregar itens da mesa.", "error");
            }
        } else {
            setExistingItems([]);
            setCart([]);
        }
    };

    // Addon Selection State
    const [itemWithAddonsToSelect, setItemWithAddonsToSelect] = useState<MenuItem | null>(null);
    const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);

    // Filter Logic
    const filteredItems = useMemo(() => {
        let items = menuItems;
        if (selectedCategoryId !== 'all' && !searchTerm) {
            items = items.filter(i => i.categoryId === selectedCategoryId);
        }
        items = items.filter(i => i.isAvailable !== false);
        if (searchTerm) {
            const normalizedSearch = normalizeString(searchTerm);
            items = items.filter(i => 
                normalizeString(i.name).includes(normalizedSearch) || 
                i.id.toString().includes(normalizedSearch)
            );
        }
        return items;
    }, [menuItems, selectedCategoryId, searchTerm]);

    // Cart Logic
    const addToCart = (item: MenuItem) => {
        const relevantAddons = (item.selectedAddons && item.selectedAddons.length > 0) ? item.selectedAddons : (item.addons || []);
        const availableAddons = relevantAddons.filter(a => a.isAvailable !== false);
        if (availableAddons.length > 0) {
            setItemWithAddonsToSelect(item);
            setSelectedAddonIds([]); 
            return;
        }
        addItemToCartState(item, []);
    };

    const confirmAddonsToCart = () => {
        if (!itemWithAddonsToSelect) return;
        const relevantAddons = (itemWithAddonsToSelect.selectedAddons && itemWithAddonsToSelect.selectedAddons.length > 0) ? itemWithAddonsToSelect.selectedAddons : (itemWithAddonsToSelect.addons || []);
        const availableAddons = relevantAddons.filter(a => a.isAvailable !== false);
        const addonsToAdd = availableAddons.filter(a => selectedAddonIds.includes(a.id)) || [];
        addItemToCartState(itemWithAddonsToSelect, addonsToAdd);
        setItemWithAddonsToSelect(null);
        setSelectedAddonIds([]);
    };

    const addItemToCartState = (item: MenuItem, addons: any[]) => {
        setCart(prev => {
            return [...prev, {
                ...item,
                cartId: Math.random().toString(36),
                quantity: 1,
                notes: '',
                selectedAddons: addons
            }];
        });
    }

    const handleAddCustomItem = () => {
        if (!customItemName || !customItemPrice) return;
        const price = parseFloat(customItemPrice.replace(',', '.'));
        if (isNaN(price)) return;
        const newItem: any = {
            id: -Date.now(),
            name: customItemName,
            description: 'Item Avulso',
            price: price,
            categoryId: -1,
            eligibleForCombo: false,
            isCombo: false,
            selectedAddons: [],
            store_id: currentStore?.id,
            isAvailable: true,
            cartId: `custom-${Date.now()}`,
            quantity: 1,
            notes: ''
        };
        setCart(prev => [...prev, newItem]);
        setCustomItemName('');
        setCustomItemPrice('');
        setIsCustomItemModalOpen(false);
    };

    const toggleAddonSelection = (addonId: string) => {
        setSelectedAddonIds(prev =>
            prev.includes(addonId) ? prev.filter(id => id !== addonId) : [...prev, addonId]
        );
    }

    const updateItemNote = (cartId: string, note: string) => {
        setCart(prev => prev.map(i => i.cartId === cartId ? { ...i, notes: note } : i));
    };

    const removeFromCart = (cartId: string) => {
        setCart(prev => prev.filter(i => i.cartId !== cartId));
    };

    const updateQuantity = (cartId: string, delta: number) => {
        setCart(prev => prev.map(i => {
            if (i.cartId === cartId) {
                return { ...i, quantity: Math.max(1, i.quantity + delta) };
            }
            return i;
        }));
    };

    const cartTotal = cart.reduce((sum, item) => {
        const addonsPrice = item.selectedAddons?.reduce((acc: number, addon: any) => acc + (Number(addon.price) || 0), 0) || 0;
        return sum + (((Number(item.price) || 0) + addonsPrice) * item.quantity);
    }, 0);

    const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    
    const handleConfirmSubmit = async (printMode: 'KITCHEN' | 'NONE') => {
        if (!tableNumber || cart.length === 0 || !currentStore) return;
        
        setIsPrintConfirmModalOpen(false);
        setIsSubmitting(true);
        try {
            let dailyNumber = baseDailyOrderNumber;
            if (!dailyNumber) {
                const { getNextDailyOrderNumber } = await import('../services/supabaseService');
                dailyNumber = await getNextDailyOrderNumber(currentStore.id);
            }

            const orderPayload: any = {
                store_id: currentStore.id,
                status: 'Novo',
                orderType: 'Balcão',
                paymentMethod: 'Dinheiro', 
                table_number: parseInt(tableNumber),
                items: cart,
                total: cartTotal,
                customerName: `Mesa ${tableNumber}`,
                phone: '',
                observation: printMode === 'KITCHEN' ? '[SO_COZINHA]' : '',
                dailyOrderNumber: dailyNumber,
                origin: printMode === 'KITCHEN' ? 'WAITER_KITCHEN' : 'WAITER',
                printed: printMode === 'NONE' ? true : false
            };

            await createOrder(orderPayload);

            setCart([]);
            setExistingItems([]);
            setTableNumber('');
            setIsTableSelected(false); 
            setIsCartOpen(false);
            showNotify(printMode === 'KITCHEN' ? 'Pedido enviado e impresso na cozinha!' : 'Pedido enviado com sucesso!');

        } catch (error) {
            console.error(error);
            showNotify('Erro ao enviar pedido.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async () => {
        if (!tableNumber) return showNotify('Mesa não selecionada!', 'error');
        if (cart.length === 0) return showNotify('Carrinho vazio!', 'warning');
        
        setIsPrintConfirmModalOpen(true);
    };

    const handleCheckout = async (paymentMethod: PaymentMethod, changeFor?: number) => {
        if (!tableNumber || !currentStore) return;

        setIsSubmitting(true);
        try {
            // Find ALL open orders for this table and close them
            await batchUpdateTableOrders(currentStore.id, parseInt(tableNumber), {
                status: 'Entregue',
                payment_method: paymentMethod,
                change_for: changeFor ? changeFor.toString() : null
            });

            // Refresh table status
            await loadTables();

            // Clear local state
            setCart([]);
            setExistingItems([]);
            setTableNumber('');
            setIsTableSelected(false);
            setIsCartOpen(false);
            setIsCheckoutModalOpen(false);
            
            showNotify('Mesa fechada com sucesso! 💰', 'success');

        } catch (error) {
            console.error("Checkout error:", error);
            showNotify('Erro ao fechar conta.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (pin === WAITER_PIN) {
            setIsAuthenticated(true);
            localStorage.setItem('waiter_auth', 'true');
        } else {
            showNotify('PIN Incorreto', 'error');
        }
    };

    const handleLogout = () => {
        setIsAuthenticated(false);
        localStorage.removeItem('waiter_auth');
    };

    if (storeLoading) return <div className="h-screen flex items-center justify-center bg-gray-950 text-gray-500">Iniciando Sistema...</div>;
    if (!currentStore) return <div className="p-10 text-center text-white bg-black h-screen">Loja não encontrada.</div>;

    if (!isAuthenticated) return (
        <div className="h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
            <Notification show={notification.show} message={notification.message} type={notification.type} onClose={() => setNotification(p => ({ ...p, show: false }))} />
            <div className="w-full max-w-md bg-gray-900 p-8 rounded-2xl shadow-2xl border border-gray-800">
                <div className="flex flex-col items-center mb-8">
                    <User size={40} className="text-primary mb-4" />
                    <h1 className="text-2xl font-bold text-white">Portal do Garçom</h1>
                    <p className="text-gray-500 text-sm">{currentStore.name}</p>
                </div>
                <form onSubmit={handleLogin} className="space-y-6">
                    <input
                        type="password"
                        value={pin}
                        onChange={e => setPin(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-4 text-white text-center text-2xl tracking-[1em] focus:border-primary outline-none"
                        placeholder="••••"
                        autoFocus
                    />
                    <button type="submit" className="w-full py-4 bg-primary text-background font-black rounded-xl hover:opacity-90 active:scale-95 transition-all">
                        Entrar
                    </button>
                    <button type="button" onClick={() => navigate(`/${currentStore.slug}`)} className="w-full text-gray-500 text-sm hover:text-white">Voltar ao Cardápio</button>
                </form>
            </div>
        </div>
    );

    if (loadingMenu) return <div className="h-screen flex items-center justify-center bg-gray-950 text-gray-500 italic">Carregando cardápio...</div>;

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans transition-colors duration-300">
            <Notification show={notification.show} message={notification.message} type={notification.type} onClose={() => setNotification(p => ({ ...p, show: false }))} />
            
            {viewMode === 'counter' ? (
                <div className="min-h-screen md:h-screen w-full bg-gray-100 dark:bg-gray-900 overflow-y-auto md:overflow-hidden">
                     <CounterTab 
                        categories={categories}
                        menuItems={menuItems}
                        addons={addons}
                        settings={settings}
                        storeId={currentStore.id}
                        onOrderComplete={async (order) => {
                             if (order.id) await updateOrder(order.id, order);
                             else await createOrder(order);
                             await loadTables(); 
                        }}
                        activeOrders={activeOrders}
                        onBack={() => setViewMode('tables')}
                     />
                </div>
            ) : !isTableSelected ? (
                <div className="h-screen overflow-hidden p-4 flex flex-col items-center justify-center">
                    <header className="w-full max-w-md flex flex-col items-center mb-6 text-center">
                        <div className="w-full flex justify-between items-center mb-2">
                            <h1 className="text-lg font-bold text-gray-900 dark:text-white uppercase">{currentStore.name}</h1>
                            <div className="flex gap-2">
                                <button onClick={toggleTheme} className="text-gray-500 dark:text-gray-400 p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
                                    {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                                </button>
                                <button onClick={handleLogout} className="text-red-500 bg-red-100 dark:bg-red-950/20 p-2 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors"><LogOut size={20} /></button>
                            </div>
                        </div>
                        <p className="text-sm text-gray-500">Selecione uma mesa</p>
                    </header>
                    <div className="flex justify-center gap-4 mb-4 text-[10px] uppercase font-bold text-gray-600">
                        <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-gray-800"></div> Livre</div>
                        <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-900"></div> Ocupada</div>
                    </div>
                    <div className="grid grid-cols-5 gap-2 w-full max-w-md mb-6">
                        {Array.from({ length: 30 }, (_, i) => i + 1).map(num => {
                            const isOccupied = occupiedTables.includes(num);
                            return (
                                <button
                                    key={num}
                                    onClick={() => handleSelectTable(num.toString())}
                                    className={`h-12 rounded-lg flex items-center justify-center text-lg font-bold transition-all border outline-none
                                        ${isOccupied ? 'bg-red-950/20 border-red-900/50 text-red-700' : 'bg-gray-900 border-gray-800 text-gray-500 hover:border-gray-500 active:scale-95'}`}
                                >
                                    {num}
                                </button>
                            );
                        })}
                    </div>
                    <button onClick={() => setViewMode('counter')} className="w-full max-w-md bg-white text-black py-4 rounded-xl font-black flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95">
                        <Bike size={24} /> DELIVERY / AVULSO
                    </button>
                </div>
            ) : (
                <div className="pb-24">
                    <header className="bg-white dark:bg-gray-900 p-3 sticky top-0 z-10 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 shadow-sm transition-colors duration-300">
                        <button onClick={() => setIsTableSelected(false)} className="bg-gray-100 dark:bg-gray-800 p-2 rounded-full text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors">
                            <ChevronRight className="rotate-180" size={20} />
                        </button>
                        <div className="flex-1">
                            <h2 className="font-bold leading-tight text-gray-900 dark:text-white mb-0.5">Mesa {tableNumber === '0' ? 'Balcão/Delivery' : tableNumber}</h2>
                            <p className="text-xs text-green-600 dark:text-green-500 font-bold uppercase tracking-widest animate-pulse">Serviço Ativo</p>
                        </div>
                        <button onClick={toggleTheme} className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                             {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                        </button>
                        <button onClick={() => setIsCustomItemModalOpen(true)} className="bg-green-100 dark:bg-green-950/50 text-green-600 dark:text-green-500 hover:bg-green-200 dark:hover:bg-green-900 px-3 py-1.5 rounded-full text-[10px] font-black border border-green-200 dark:border-green-900 hover:border-green-300 transition-all uppercase tracking-wider">
                            ITENS AVULSO
                        </button>
                    </header>

                    <div className="pt-3 pb-3 px-3 mb-2 overflow-x-auto flex gap-2 hide-scrollbar sticky top-[60px] z-10 bg-white/95 dark:bg-gray-950/80 backdrop-blur-md transition-colors duration-300 border-b border-gray-100 dark:border-gray-800">
                        <button onClick={() => setSelectedCategoryId('all')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all border ${selectedCategoryId === 'all' ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white' : 'bg-gray-100 dark:bg-gray-900 text-gray-500 border-gray-200 dark:border-gray-800'}`}>Todos</button>
                        {categories.map(cat => (
                            <button key={cat.id} onClick={() => setSelectedCategoryId(cat.id)} className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all border ${selectedCategoryId === cat.id ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white' : 'bg-gray-100 dark:bg-gray-900 text-gray-500 border-gray-200 dark:border-gray-800'}`}>{cat.name}</button>
                        ))}
                    </div>

                    <div className="p-3 space-y-2">
                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input 
                                type="text"
                                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-1 focus:ring-primary outline-none transition-colors" 
                                placeholder="O que o cliente deseja?" 
                                value={searchTerm} 
                                onChange={e => setSearchTerm(e.target.value)}
                                enterKeyHint="search"
                            />
                        </div>
                        {filteredItems.map(item => (
                            <div key={item.id} className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800 flex justify-between items-center active:bg-gray-50 dark:active:bg-gray-800 transition-all cursor-pointer shadow-sm" onClick={() => addToCart(item)}>
                                <div className="flex-1 pr-2">
                                    <h3 className="font-black text-gray-900 dark:text-white text-lg leading-tight">{item.name}</h3>
                                    {item.description && <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{item.description}</p>}
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <span className="text-primary font-black text-lg">R$ {item.price.toFixed(2)}</span>
                                    <div className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white p-1 rounded-lg"><Plus size={16} /></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Modals & Cart Logic (Keeping standard wait-logic for stability) */}
            {itemWithAddonsToSelect && (
                <div className="fixed inset-0 bg-black/90 z-50 flex items-end p-2 animate-fade-in">
                    <div className="bg-gray-900 w-full rounded-2xl flex flex-col p-4 border border-gray-800">
                        <h3 className="font-black text-xl text-white mb-4">Personalizar {itemWithAddonsToSelect.name}</h3>
                        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                            {(() => {
                                const relAddons = (itemWithAddonsToSelect.selectedAddons && itemWithAddonsToSelect.selectedAddons.length > 0) ? itemWithAddonsToSelect.selectedAddons : (itemWithAddonsToSelect.addons || []);
                                return relAddons.filter(a => a.isAvailable !== false).map(addon => {
                                    const isSelected = selectedAddonIds.includes(addon.id);
                                    return (
                                        <div key={addon.id} onClick={() => toggleAddonSelection(addon.id)} className={`p-4 rounded-xl border transition-all flex justify-between items-center ${isSelected ? 'bg-primary/20 border-primary' : 'bg-gray-950 border-gray-800'}`}>
                                            <span className="font-bold text-gray-300">{addon.name}</span>
                                            <span className="text-primary font-black">+ R$ {addon.price.toFixed(2)}</span>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                        <div className="mt-4 flex gap-2">
                            <button onClick={() => setItemWithAddonsToSelect(null)} className="flex-1 py-4 bg-gray-800 rounded-xl font-bold text-gray-500">FECHAR</button>
                            <button onClick={confirmAddonsToCart} className="flex-[2] py-4 bg-primary text-background font-black rounded-xl">ADICIONAR</button>
                        </div>
                    </div>
                </div>
            )}

            {cartCount > 0 && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-950/80 backdrop-blur-lg border-t border-gray-800 z-20">
                    <button onClick={() => setIsCartOpen(true)} className="w-full bg-primary text-background p-4 rounded-xl shadow-2xl flex justify-between items-center active:scale-95 transition-all">
                        <div className="flex items-center gap-2">
                             <div className="bg-black/20 px-2 py-0.5 rounded font-black">{cartCount}</div>
                             <span className="font-black uppercase tracking-tight">Revisar Pedido</span>
                        </div>
                        <span className="font-black text-xl">R$ {cartTotal.toFixed(2)}</span>
                    </button>
                </div>
            )}

            {isCartOpen && (
                <div className="fixed inset-0 bg-black/95 z-50 flex items-end animate-fade-in">
                    <div className="bg-gray-900 w-full rounded-t-3xl h-[90vh] flex flex-col p-4">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-black text-white uppercase tracking-tighter">Conferência: Mesa {tableNumber === '0' ? 'Balcão' : tableNumber}</h2>
                            <button onClick={() => setIsCartOpen(false)}><X size={32} className="text-gray-500" /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                            {/* NEW: Display Existing Items as Read-Only */}
                            {existingItems.length > 0 && (
                                <div className="space-y-2 opacity-60">
                                    <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-2">Itens já lançados</h3>
                                    {existingItems.map((item, idx) => (
                                        <div key={`existing-${idx}`} className="bg-gray-800/30 p-3 rounded-xl border border-gray-800 flex justify-between items-center grayscale">
                                            <div className="text-xs flex flex-col">
                                                <span className="font-bold text-gray-400">{item.quantity}x {item.name}</span>
                                                <span className="text-[10px] text-gray-500">
                                                    R$ {(((Number(item.price) || 0) + (item.selectedAddons?.reduce((a: number, b: any) => a + (Number(b.price) || 0), 0) || 0)) * item.quantity).toFixed(2)}
                                                </span>
                                            </div>
                                            <span className="text-[10px] bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">Na Mesa</span>
                                        </div>
                                    ))}
                                    <div className="h-4"></div>
                                    <h3 className="text-[10px] font-black text-primary uppercase tracking-widest pl-2">Novos Acréscimos</h3>
                                </div>
                            )}

                            {cart.map(item => (
                                <div key={item.cartId} className="bg-gray-950 p-4 rounded-2xl border border-gray-800">
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-black text-white text-lg">{item.name}</h4>
                                        <span className="font-black text-primary">R$ {((item.price + (item.selectedAddons?.reduce((a, b) => a + b.price, 0) || 0)) * item.quantity).toFixed(2)}</span>
                                    </div>
                                    <div className="space-y-2">
                                        <input 
                                            type="text"
                                            placeholder="Obs (Ex: Sem cebola)" 
                                            className="w-full bg-gray-900 border border-gray-800 animate-pulse-border rounded-lg p-3 text-sm text-gray-200" 
                                            value={item.notes} 
                                            onChange={e => updateItemNote(item.cartId, e.target.value)} 
                                        />
                                        <div className="flex items-center justify-between">
                                            <button onClick={() => removeFromCart(item.cartId)} className="text-red-500 text-xs font-black uppercase">Excluir</button>
                                            <div className="flex items-center gap-4 bg-gray-900 rounded-xl p-1 px-4 border border-gray-800">
                                                <button onClick={() => updateQuantity(item.cartId, -1)}><Minus size={20} /></button>
                                                <span className="font-black text-xl w-6 text-center">{item.quantity}</span>
                                                <button onClick={() => updateQuantity(item.cartId, 1)}><Plus size={20} /></button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="pt-6 border-t border-gray-800">
                            <div className="flex gap-4">
                                <button onClick={() => setIsCartOpen(false)} className="flex-1 py-4 bg-gray-800 text-gray-400 font-bold rounded-2xl uppercase text-xs flex flex-col items-center justify-center leading-tight">
                                    <span>Voltar ao</span>
                                    <span>Cardápio</span>
                                </button>
                                <button onClick={() => setIsCustomItemModalOpen(true)} className="flex-1 py-4 bg-green-950/20 text-green-500 border border-green-500/30 font-bold rounded-2xl uppercase text-xs">+ Avulso</button>
                                <button onClick={handleSubmit} disabled={isSubmitting} className="flex-[2] py-4 bg-primary text-background font-black rounded-2xl uppercase shadow-lg text-lg">
                                    {isSubmitting ? 'Enviando...' : 'Confirmar Pedido'}
                                </button>
                            </div>
                            {(existingItems.length > 0 || cart.length > 0) && (
                                <button 
                                    onClick={() => setIsCheckoutModalOpen(true)}
                                    className="w-full mt-3 py-4 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-200 border border-gray-200 dark:border-gray-700 font-extrabold rounded-2xl uppercase shadow-sm flex items-center justify-center gap-2"
                                >
                                    <DollarSign size={20} className="text-green-600 dark:text-green-500" />
                                    Fechar Conta (R$ {(existingItems.reduce((acc, item) => {
                                        const addonsPrice = item.selectedAddons?.reduce((a: number, b: any) => a + (Number(b.price) || 0), 0) || 0;
                                        return acc + (((Number(item.price) || 0) + addonsPrice) * item.quantity);
                                    }, 0) + cartTotal).toFixed(2)})
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <WaiterCheckoutModal 
                isOpen={isCheckoutModalOpen}
                onClose={() => setIsCheckoutModalOpen(false)}
                total={existingItems.reduce((acc, item) => {
                    const addonsPrice = item.selectedAddons?.reduce((a: number, b: any) => a + (Number(b.price) || 0), 0) || 0;
                    return acc + (((Number(item.price) || 0) + addonsPrice) * item.quantity);
                }, 0) + cartTotal}
                tableName={`Mesa ${tableNumber}`}
                onConfirm={handleCheckout}
            />

            {isCustomItemModalOpen && (
                <div className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4" onClick={() => setIsCustomItemModalOpen(false)}>
                    <div className="bg-gray-900 w-full max-w-sm rounded-2xl p-6 border border-gray-800" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-black text-white mb-4 uppercase">Item Avulso</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nome</label>
                                <input type="text" value={customItemName} onChange={e => setCustomItemName(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-xl p-4 text-white" placeholder="Ex: Cigarro" autoFocus />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Preço (R$)</label>
                                <input 
                                    type="text" 
                                    inputMode="decimal"
                                    value={customItemPrice} 
                                    onChange={e => setCustomItemPrice(e.target.value)} 
                                    className="w-full bg-gray-950 border border-gray-800 rounded-xl p-4 text-white font-bold" 
                                    placeholder="0.00" 
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setIsCustomItemModalOpen(false)} className="flex-1 py-4 bg-gray-800 text-gray-400 font-bold rounded-xl uppercase">Cancelar</button>
                                <button onClick={handleAddCustomItem} className="flex-1 py-4 bg-primary text-background font-black rounded-xl uppercase">Adicionar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isPrintConfirmModalOpen && (
                <ConfirmPrintModal 
                    isOpen={isPrintConfirmModalOpen}
                    onClose={() => setIsPrintConfirmModalOpen(false)}
                    onConfirm={handleConfirmSubmit}
                />
            )}

            {notification.show && (
                <Notification 
                    message={notification.message}
                    type={notification.type}
                    onClose={() => setNotification(prev => ({ ...prev, show: false }))}
                />
            )}
        </div>
    );
}

// Sub-components
function ConfirmPrintModal({ isOpen, onClose, onConfirm }: { isOpen: boolean, onClose: () => void, onConfirm: (mode: 'KITCHEN' | 'NONE') => void }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-gray-950 w-full max-w-sm rounded-[32px] overflow-hidden border border-gray-800 shadow-2xl">
                <div className="p-8 text-center">
                    <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <DollarSign size={40} className="text-primary" />
                    </div>
                    <h3 className="text-2xl font-black text-white mb-2 uppercase">Confirmar Pedido</h3>
                    <p className="text-gray-400 text-sm mb-8">Escolha como deseja prosseguir com a impressão deste pedido.</p>
                    
                    <div className="space-y-4">
                        <button 
                            onClick={() => onConfirm('KITCHEN')}
                            className="w-full py-5 bg-primary text-background font-black rounded-2xl uppercase shadow-lg shadow-primary/20 flex flex-col items-center justify-center leading-tight transition-transform active:scale-95"
                        >
                            <span className="text-lg">Confirmar e Imprimir</span>
                            <span className="text-[10px] opacity-80 uppercase mt-0.5">(Apenas na Cozinha)</span>
                        </button>
                        
                        <button 
                            onClick={() => onConfirm('NONE')}
                            className="w-full py-5 bg-gray-900 text-white border border-gray-800 font-bold rounded-2xl uppercase transition-all active:scale-95 hover:bg-gray-800"
                        >
                            Apenas Confirmar
                        </button>
                        
                        <button 
                            onClick={onClose}
                            className="w-full py-3 text-gray-500 font-bold uppercase text-xs hover:text-gray-400"
                        >
                            Voltar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
