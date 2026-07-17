import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Notification, NotificationType } from '../components/Notification';
import {
    ShoppingBag,
    UtensilsCrossed,
    Settings,
    Plus,
    Edit,
    Trash2,
    DollarSign,
    Percent,
    LogOut,
    ExternalLink,
    Sun,
    Moon,
    Monitor,
    MessageSquare,
    Gift,
    Bike,
    Eye,
    EyeOff,
    Image as ImageIcon,
    History,
    Menu,
    X as LucideX,
    Search
} from 'lucide-react';
import { normalizeString } from '../utils/searchUtils';
import CounterTab from '../components/CounterTab';
import RaffleTab from '../components/RaffleTab';
import { AdsTab } from '../components/AdsTab';
import { ReviewsTab } from '../components/ReviewsTab';
import {
    fetchMenuForAdmin,
    createCategory,
    updateCategory,
    deleteCategory,
    createMenuItem,
    updateMenuItem,
    deleteMenuItem,
    fetchActiveOrders,
    updateOrderStatus,
    fetchSettings,
    updateSettings,
    fetchAllPromotions,
    createPromotion,
    updatePromotion,
    deletePromotion,

    updateOrder,
    createOrder,
    supabase,

    fetchEligibleCustomersForRaffle,
    markOrderItemsAsPrinted,
    deleteOrder,
    createAddon,
    updateAddon,
    deleteAddon,
    mapOrderFromDB,
    batchUpdateTableOrders,
    fetchOrderById
} from '../services/supabaseService';
import OrderCard from '../components/OrderCard';
import TableGroupCard from '../components/TableGroupCard';
import { printOrder } from '../services/printerService';
import type { Category, MenuItem, Order, Settings as SettingsType, Promotion, Addon, OrderStatus } from '../types';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../contexts/StoreContext';
import { CategoryModal as CategoryModalComponent } from '../components/CategoryModal';
import { MenuItemModal as MenuItemModalComponent } from '../components/MenuItemModal';
import { AddonModal as AddonModalComponent } from '../components/AddonModal';
import { CheckoutModal, PaymentDetails } from '../components/CheckoutModal';
import { EditOrderModal as EditOrderModalComponent } from '../components/EditOrderModal';
import SalesHistory from '../components/SalesHistory';


import { SettingsTab } from '../components/SettingsTab';
import { PromotionTab } from '../components/PromotionTab';
import { AvailabilityReminderModal } from '../components/AvailabilityReminderModal';
import { PrintStatusSplash } from '../components/PrintStatusSplash';
import { WhatsAppBotTab } from '../components/WhatsAppBotTab';









import CashFlowTab from '../components/CashFlowTab';
import { UpdateNotification } from '../components/UpdateNotification';
import { CouriersTab } from '../components/CouriersTab';



const AdminPage = () => {
    const navigate = useNavigate();
    const { currentStore, loading: storeLoading } = useStore();

    // Notification State
    const [notification, setNotification] = useState<{ show: boolean; message: string; type: NotificationType }>({
        show: false,
        message: '',
        type: 'success'
    });

    const showNotify = (message: string, type: NotificationType = 'success') => {
        setNotification({ show: true, message, type });
    };
    const [activeTab, setActiveTab] = useState<'orders' | 'kitchen' | 'menu' | 'settings' | 'promotions' | 'cash' | 'addons' | 'counter' | 'raffle' | 'ads' | 'reviews' | 'history' | 'couriers' | 'whatsapp-bot'>('orders');
    const [menuSubTab, setMenuSubTab] = useState<'items' | 'addons'>('items');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [orders, setOrders] = useState<Order[]>([]);
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [addons, setAddons] = useState<Addon[]>([]);
    const [settings, setSettings] = useState<SettingsType | null>(null);
    const settingsRef = useRef<SettingsType | null>(null);

    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [isItemModalOpen, setIsItemModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | undefined>(undefined);
    const [editingItem, setEditingItem] = useState<MenuItem | undefined>(undefined);
    const [isAddonModalOpen, setIsAddonModalOpen] = useState(false);
    const [editingAddon, setEditingAddon] = useState<Addon | undefined>(undefined);
    const [lastSelectedCategoryId, setLastSelectedCategoryId] = useState<number | undefined>(undefined);
    const [menuSearchTerm, setMenuSearchTerm] = useState('');
    const [showAvailabilityReminder, setShowAvailabilityReminder] = useState(false);
    const [isEditOrderModalOpen, setIsEditOrderModalOpen] = useState(false);
    const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
    const [checkoutOrder, setCheckoutOrder] = useState<Order | null>(null);
    const [showPrintSplash, setShowPrintSplash] = useState(false);
    const [darkMode, setDarkMode] = useState(() => {
        const saved = localStorage.getItem('theme');
        return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    });

    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [darkMode]);

    useEffect(() => {
        if (activeTab === 'kitchen') {
            document.documentElement.classList.add('kitchen-mode');
            document.body.classList.add('kitchen-mode');
            
            return () => {
                document.documentElement.classList.remove('kitchen-mode');
                document.body.classList.remove('kitchen-mode');
            }
        } else {
            document.documentElement.classList.remove('kitchen-mode');
            document.body.classList.remove('kitchen-mode');
        }
    }, [activeTab]);

    const [installPrompt, setInstallPrompt] = (useState as any)(null);

    useEffect(() => {
        const checkPrompt = () => {
            const prompt = (window as any).deferredPrompt;
            if (prompt) {
                setInstallPrompt(prompt);
            }
        };

        const handler = (e: any) => {
            e.preventDefault();
            setInstallPrompt(e);
            (window as any).deferredPrompt = e;
        };

        checkPrompt();

        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstallClick = async () => {
        if (!installPrompt) return;
        installPrompt.prompt();
        const { outcome } = await installPrompt.userChoice;
        if (outcome === 'accepted') {
            setInstallPrompt(null);
            (window as any).deferredPrompt = null;
        }
    };

    const ordersRef = useRef<Order[]>([]);
    const tvChannelRef = useRef<any>(null);

    useEffect(() => {
        ordersRef.current = orders;
    }, [orders]);

    const loadData = async (silent = false) => {
        if (!currentStore) return;
        try {
            if (!silent) setLoading(true);
            const [ordersData, menuData, settingsData, promotionsData] = await Promise.all([
                fetchActiveOrders(currentStore.id),
                fetchMenuForAdmin(currentStore.id),
                fetchSettings(currentStore.id),
                fetchAllPromotions(currentStore.id)
            ]);

            setOrders(ordersData);
            setCategories(menuData.categories);
            setMenuItems(menuData.menuItems);
            setAddons(menuData.addons || []);
            setSettings(settingsData);
            setPromotions(promotionsData);
        } catch (error) {
            console.error("Error loading admin data:", error);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    // Lightweight refresh for real-time updates
    const refreshOrdersOnly = async () => {
        if (!currentStore) return;
        try {
            console.log(`[Polling] Checking for new orders... Store ID: ${currentStore.id}`);
            const ordersData = await fetchActiveOrders(currentStore.id);
            
            // REDUNDANCY: Check for unprinted orders in the poll result
            if ((window as any).electron) {
                const unprinted = ordersData.filter(o => 
                    !o.printed && 
                    (o.dailyOrderNumber > 0 || o.origin === 'BALCÃO' || o.origin === 'WEB' || o.origin === 'AI') &&
                    !currentlyPrintingIds.current.has(o.id) &&
                    !printedOrderIds.current.has(o.id)
                );

                if (unprinted.length > 0) {
                    console.log(`[Polling] Found ${unprinted.length} unprinted orders. Triggering redundancy print.`);
                    unprinted.forEach(order => {
                        handlePrintOrder({ ...order, settings: settingsRef.current } as any);
                    });
                }

                // Sound for new orders not seen before
                const hasNew = ordersData.some(o => !ordersRef.current.find(lo => lo.id === o.id));
                if (hasNew && notificationSound.current) {
                    console.log(`[Polling] New order(s) detected via polling. Playing sound.`);
                    notificationSound.current.play().catch(e => console.warn('Sound play blocked:', e));
                }
            }

            setOrders(ordersData);
        } catch (error) {
            console.error("Error refreshing orders:", error);
        }
    };

    // Sound notification ref
    const notificationSound = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        // High quality "ding-dong" or chime sound
        notificationSound.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        notificationSound.current.volume = 0.8;
    }, []);

    useEffect(() => {
        if (!currentStore) return;
        loadData();
        const interval = setInterval(() => refreshOrdersOnly(), 30000); // Poll orders every 30s

        // Real-time subscription
        const subscription = supabase
            .channel('public:orders')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `store_id=eq.${currentStore?.id}` }, (payload) => {
                console.log('New order received via real-time:', payload.new);
                
                // Play sound for all new orders IMMEDIATELY
                if (notificationSound.current) {
                    notificationSound.current.play().catch(e => console.warn('Sound play blocked:', e));
                }

                showNotify(`Novo pedido recebido!`, 'success');

                const newOrder = mapOrderFromDB(payload.new);
                
                if ((window as any).electron) {
                    console.log(`[RealTime] New order received (#${newOrder.dailyOrderNumber}). ID: ${newOrder.id}`);
                    // Automatic print for orders that already have a number
                    // Fallback: Also print WEB/AI orders even if number is 0 to avoid losing prints
                    const isManualSource = newOrder.origin === 'BALCÃO' || newOrder.origin === 'WEB' || newOrder.origin === 'AI';
                    if (!newOrder.printed && (newOrder.dailyOrderNumber > 0 || isManualSource)) {
                         console.log(`[RealTime] Triggering auto-print (INSERT) for #${newOrder.id} (Origin: ${newOrder.origin})`);
                         handlePrintOrder({ ...newOrder, settings: settingsRef.current } as any);
                    } else {
                         console.log(`[RealTime] INSERT for #${newOrder.id} - Queueing for number assignment...`);
                    }
                }

                refreshOrdersOnly();
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `store_id=eq.${currentStore?.id}` }, async (payload) => {
                console.log(`[RealTime] UPDATE received for #${payload.new.id}. Daily: ${payload.new.daily_order_number}, Status: ${payload.new.status}`);
                
                const updatedOrder = mapOrderFromDB(payload.new);
                
                // ROBUST LOOP PROTECTION: Compare against LOCAL state
                const localOrder = ordersRef.current.find(o => o.id === updatedOrder.id);

                if (localOrder) {
                    const itemsChanged = JSON.stringify(updatedOrder.items) !== JSON.stringify(localOrder.items);
                    const statusChanged = updatedOrder.status !== localOrder.status;
                    const numberInitialized = updatedOrder.dailyOrderNumber > 0 && localOrder.dailyOrderNumber === 0;

                    // PRINT TRIGGER: If it's NOT printed yet AND (just got a number OR items changed OR status changed)
                    const shouldTryPrint = !updatedOrder.printed && (numberInitialized || itemsChanged || (updatedOrder.dailyOrderNumber > 0 && !(localOrder?.printed)));

                    if (statusChanged) {
                        // Notificação via robô local removida (agora é via Trigger do Banco de Dados)
                        if (!itemsChanged && !numberInitialized && !shouldTryPrint) {
                            setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
                            return;
                        }
                    } else if (!itemsChanged && !statusChanged && !numberInitialized && !shouldTryPrint) {
                        console.log(`[RealTime] Skipping update trigger for #${updatedOrder.dailyOrderNumber} - No structural change.`);
                        setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
                        return;
                    }

                    if (numberInitialized) {
                        console.log(`[RealTime] Order number initialized (#${updatedOrder.dailyOrderNumber}).`);
                    }
                    
                    console.log(`[RealTime] shouldTryPrint: ${shouldTryPrint}, statusChanged: ${statusChanged}, itemsChanged: ${itemsChanged}`);
                }
                
                // Trigger print on update if running in Electron (only if not Entregue/Cancelado/Conta Solicitada for tables)
                if ((window as any).electron) {
                    const skipPrintStatuses = ['Entregue', 'Cancelado'];
                    const isTableRequestingBill = updatedOrder.status === 'Conta Solicitada' && updatedOrder.table_number;
                    const isTableUpdate = updatedOrder.table_number && !isTableRequestingBill;
                    
                    if (!skipPrintStatuses.includes(updatedOrder.status) && !isTableRequestingBill) {
                        // Skip automatic prints for table updates (manual only as requested)
                        if (isTableUpdate && !updatedOrder.items?.some((i: any) => !i.printed)) {
                            console.log(`[RealTime] Skipping automatic print for TABLE UPDATE #${updatedOrder.dailyOrderNumber} - No new items.`);
                        } else if (!updatedOrder.printed || updatedOrder.items?.some((i: any) => !i.printed)) {
                            let orderItems = (updatedOrder.items && updatedOrder.items.length > 0) 
                                ? updatedOrder.items 
                                : (localOrder?.items || []);

                            let finalOrder = {
                                ...(localOrder || {}),
                                ...updatedOrder,
                                items: orderItems,
                                settings: settingsRef.current
                            };

                            // ROBUST FETCH: If items are STILL missing, fetch the full order from DB
                            if (!orderItems || orderItems.length === 0) {
                                console.log(`[RealTime] Items missing for order #${updatedOrder.id}. Fetching full record...`);
                                const fullOrder = await fetchOrderById(updatedOrder.id);
                                if (fullOrder && fullOrder.items && fullOrder.items.length > 0) {
                                    finalOrder = { ...fullOrder, settings: settingsRef.current };
                                    orderItems = fullOrder.items;
                                } else {
                                    console.warn(`[RealTime] Skipping auto-print for #${updatedOrder.id} - STILL NO ITEMS FOUND.`);
                                    return;
                                }
                            }

                            console.log(`[RealTime] Auto-print TRIGGER (UPDATE) for order #${finalOrder.dailyOrderNumber || finalOrder.id}`);
                            setTimeout(() => handlePrintOrder(finalOrder as any), 800); 
                        }
                    }
                }

                refreshOrdersOnly();
            })
            .subscribe((status) => {
                console.log(`[RealTime] Subscription Status: ${status}. Filter Store ID: ${currentStore?.id}`);
            });

        // Initialize TV Channel connection
        tvChannelRef.current = supabase.channel('tv_overlay_events');
        tvChannelRef.current.subscribe();

        return () => {
            clearInterval(interval);
            supabase.removeChannel(subscription);
            if (tvChannelRef.current) {
                supabase.removeChannel(tvChannelRef.current);
            }
        };
    }, [currentStore]);

    // Availability Reminder Logic - Adjusted frequency
    useEffect(() => {
        if (!menuItems.length && !addons.length) return;

        const unavailableCount = menuItems.filter(i => !i.isAvailable).length + addons.filter(a => !a.isAvailable).length;
        if (unavailableCount === 0) return;

        // Check if enough time has passed since last reminder (e.g., 4 hours)
        const lastShownTimestamp = localStorage.getItem('availability_reminder_last_shown');
        const now = Date.now();
        const FOUR_HOURS = 4 * 60 * 60 * 1000;

        if (!lastShownTimestamp || (now - parseInt(lastShownTimestamp) > FOUR_HOURS)) {
            // Only show if we are on the dashboard (orders) or explicitly entering the menu to fix it
            if (activeTab === 'orders' || activeTab === 'menu') {
                setShowAvailabilityReminder(true);
                localStorage.setItem('availability_reminder_last_shown', now.toString());
            }
        }
    }, [activeTab, menuItems.length, addons.length]);

    // Menu Filtering Logic
    const filteredMenuItems = useMemo(() => {
        if (!menuSearchTerm) return menuItems;
        const search = normalizeString(menuSearchTerm);
        return menuItems.filter(item => 
            normalizeString(item.name).includes(search) || 
            normalizeString(item.description || '').includes(search) ||
            item.id.toString().includes(search)
        );
    }, [menuItems, menuSearchTerm]);

    const filteredCategories = useMemo(() => {
        if (!menuSearchTerm) return categories;
        const search = normalizeString(menuSearchTerm);
        return categories.filter(cat => {
            const matchesCat = normalizeString(cat.name).includes(search);
            const hasMatchingItem = menuItems.some(item => 
                item.categoryId === cat.id && 
                (normalizeString(item.name).includes(search) || normalizeString(item.description || '').includes(search))
            );
            return matchesCat || hasMatchingItem;
        });
    }, [categories, menuItems, menuSearchTerm]);

    const filteredAddons = useMemo(() => {
        if (!menuSearchTerm) return addons;
        const search = normalizeString(menuSearchTerm);
        return addons.filter(addon => normalizeString(addon.name).includes(search));
    }, [addons, menuSearchTerm]);

    const printedOrderIds = useRef<Set<string>>(new Set());
    const currentlyPrintingIds = useRef<Set<string>>(new Set());


    // Global Auto-Draw Logic
    useEffect(() => {
        if (!currentStore || !settings?.isRaffleEnabled || !settings?.raffleDrawDate || settings.lastRaffleWinner) return;

        const checkAndRunRaffle = async () => {
            const now = new Date();
            const drawDate = new Date(settings.raffleDrawDate!);

            if (now >= drawDate) {
                console.log("Auto-Draw: Time reached! Executing raffle...");
                try {
                    // 1. Fetch eligible customers
                    const endDate = new Date(drawDate);
                    const startDate = new Date(drawDate);
                    startDate.setDate(startDate.getDate() - 7);

                    console.log(`Auto-Draw: Searching orders from ${startDate.toISOString()} to ${endDate.toISOString()}`);

                    const customers = await fetchEligibleCustomersForRaffle(
                        currentStore.id,
                        startDate.toISOString(),
                        endDate.toISOString()
                    );

                    if (customers.length > 0) {
                        // 2. Pick a winner
                        const randomIndex = Math.floor(Math.random() * customers.length);
                        const winner = customers[randomIndex];

                        // 3. Save winner
                        await updateSettings(currentStore.id, { lastRaffleWinner: winner.name });
                        console.log("Auto-Draw: Winner saved:", winner.name);

                        // 4. Refresh data
                        await loadData(true);
                        alert(`Sorteio Automático Realizado! Vencedor: ${winner.name}`);
                    } else {
                        console.log("Auto-Draw: No eligible customers found.");
                        alert("Sorteio Automático: Nenhum participante elegível encontrado nos últimos 30 dias.");
                    }
                } catch (error) {
                    console.error("Auto-Draw Error:", error);
                }
            }
        };

        const interval = setInterval(checkAndRunRaffle, 60000);
        checkAndRunRaffle();

        return () => clearInterval(interval);
    }, [currentStore, settings?.isRaffleEnabled, settings?.raffleDrawDate, settings?.lastRaffleWinner]);

    const handleSaveCategory = async (category: Partial<Category>) => {
        if (!currentStore) return;
        try {
            if (category.id) {
                await updateCategory(category.id, { name: category.name });
            } else {
                if (!category.name) throw new Error("Nome da categoria é obrigatório");
                await createCategory({ name: category.name, store_id: currentStore.id });
            }
            await loadData(true);
        } catch (error) {
            console.error("Error saving category:", error);
            alert("Erro ao salvar categoria");
        }
    };

    const handleDeleteCategory = async (id: number) => {
        if (!confirm("Tem certeza? Isso pode afetar itens vinculados.")) return;
        try {
            await deleteCategory(id);
            await loadData(true);
        } catch (error) {
            console.error("Error deleting category:", error);
            alert("Erro ao excluir categoria");
        }
    };

    const handleSaveItem = async (item: Partial<MenuItem>) => {
        if (!currentStore) return;
        try {
            if (item.categoryId) {
                setLastSelectedCategoryId(item.categoryId);
            }

            if (item.id) {
                await updateMenuItem(item.id, item);
            } else {
                // Ensure required fields are present for creation if needed, or rely on backend/types
                await createMenuItem({ ...item, store_id: currentStore.id } as any);
            }
            await loadData();
        } catch (error) {
            console.error("Error saving item:", error);
            alert(`Erro ao salvar item: ${(error as any).message || error}`);
        }
    };

    const handleDeleteItem = async (id: number) => {
        if (!confirm("Tem certeza que deseja excluir este item?")) return;
        try {
            await deleteMenuItem(id);
            await loadData(true);
        } catch (error) {
            console.error("Error deleting item:", error);
            alert("Erro ao excluir item");
        }
    };

    const handleAvailabilityToggle = async (item: MenuItem) => {
        try {
            await updateMenuItem(item.id, { isAvailable: !item.isAvailable });
            setMenuItems(prev => prev.map(i => i.id === item.id ? { ...i, isAvailable: !item.isAvailable } : i));
        } catch (error) {
            console.error("Error toggling availability:", error);
            alert("Erro ao alterar disponibilidade");
        }
    };

    const handleToggleAddonGlobal = async (addon: Addon) => {
        try {
            const updatedAvailable = !addon.isAvailable;

            // Optimistic update for addons list
            setAddons(prev => prev.map(a => a.id === addon.id ? { ...a, isAvailable: updatedAvailable } : a));

            // Optimistic update for menu items
            setMenuItems(prev => prev.map(item => ({
                ...item,
                selectedAddons: item.selectedAddons?.map(a => a.id === addon.id ? { ...a, isAvailable: updatedAvailable } : a) || []
            })));

            await updateAddon(addon.id, { isAvailable: updatedAvailable });
        } catch (error) {
            console.error("Error toggling addon availability:", error);
            alert("Erro ao alterar disponibilidade do adicional");
            loadData(true);
        }
    };

    const handleSaveSettings = async (newSettings: Partial<SettingsType>) => {
        if (!currentStore) return;
        try {
            await updateSettings(currentStore.id, newSettings);
            await loadData(true);
            alert("Configurações salvas com sucesso!");
        } catch (error: any) {
            console.error("Error saving settings:", error);
            if (error.message?.includes("column")) {
                alert("Erro: Colunas faltando no banco. Rode o script SQL!");
            } else {
                alert("Erro ao salvar configurações");
            }
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate(`/${currentStore?.slug}/login`);
    };

    const handleToggleBot = async (forceStatus?: boolean) => {
        if (!currentStore || !settings) return;
        const newStatus = forceStatus !== undefined ? forceStatus : !settings.isBotEnabled;
        try {
            await updateSettings(currentStore.id, { isBotEnabled: newStatus });
            setSettings({ ...settings, isBotEnabled: newStatus });
            
            // Sync with local Electron bot process
            if ((window as any).electron) {
                (window as any).electron.toggleBot(newStatus);
            }
        } catch (error: any) {
            console.error("Error toggling bot:", error);
            if (error.message?.includes("column")) {
                alert("Erro: Coluna 'is_bot_enabled' faltando. Rode o script SQL de correção!");
            } else {
                alert("Erro ao mudar status do robô");
            }
        }
    };

    const handleCreatePromotion = async (promo: Omit<Promotion, 'id'>) => {
        if (!currentStore) return;
        try {
            await createPromotion({ ...promo, store_id: currentStore.id });
            await loadData(true);
        } catch (error) {
            console.error("Error creating promotion:", error);
            alert("Erro ao criar promoção");
        }
    };

    const handleUpdatePromotion = async (id: string | number, updates: Partial<Promotion>) => {
        try {
            await updatePromotion(id, updates);
            await loadData(true);
        } catch (error) {
            console.error("Error updating promotion:", error);
            alert("Erro ao atualizar promoção");
        }
    };

    const handleDeletePromotion = async (id: string | number) => {
        if (!confirm("Excluir promoção?")) return;
        try {
            await deletePromotion(id);
            await loadData(true);
        } catch (error) {
            console.error("Error deleting promotion:", error);
            alert("Erro ao excluir promoção");
        }
    };

    const handleUpdateOrder = async (orderId: string, updates: Partial<Order>) => {
        try {
            await updateOrder(orderId, updates);
            await loadData(true);
            if (selectedOrder?.id === orderId) {
                setSelectedOrder(prev => prev ? { ...prev, ...updates } : null);
            }
        } catch (error) {
            console.error("Error updating order:", error);
            alert("Erro ao atualizar pedido");
        }
    };

    // PROTECTED: handlePrintOrder is the central bridge for all printing.
    // force=true is used for manual button clicks to bypass double-print protection.
    const handlePrintOrder = useCallback(async (order: Order, force = false) => {
        if (!order.id) return;

        // 1. Memory lock to prevent redundant concurrent triggers from real-time events
        if (!force && currentlyPrintingIds.current.has(order.id)) {
            console.log(`[PrintDebug] Job ALREADY in progress for order #${order.id}. Skipping duplicate trigger.`);
            return;
        }

        const hasUnprinted = order.items.some(i => !i.printed);
        
        // 2. CENTRAL BLOCK: Table orders are manual only for UPDATES (requested by user)
        // If it's a new order (order.printed is false), we allow the first auto-print.
        // If it was already printed, subsequent updates are manual-selective only.
        if (!force && order.table_number && (order.printed || printedOrderIds.current.has(order.id))) {
            console.log(`[Printer] Skipping automatic print for TABLE UPDATE #${order.table_number}. Manual selective print only.`);
            return;
        }

        const isFinalStatus = order.status === 'Entregue' || order.status === 'Conta Solicitada';
        const isTableClosure = order.table_number && isFinalStatus;
        
        if (isTableClosure && !force) {
            console.log(`[Printer] Skipping TABLE finalization #${order.id} (Status: ${order.status}) - Automatic printing disabled.`);
            return;
        }

        // 3. Cooldown lock for already printed orders without new items
        // We removed the strict "order.printed === true" check because sometimes real-time updates arrive
        // with old printed=false state before the first print finishes saving to the DB.
        if (!force && !hasUnprinted && printedOrderIds.current.has(order.id)) {
            console.log(`[PrintDebug] HARD LOCK: Pedido #${order.id} já impresso nesta máquina e sem novos itens. Bloqueando.`);
            return;
        }

        if (force) {
            setShowPrintSplash(true);
        }

        console.log(`[PrintDebug] Processing order #${order.id} (Number: #${order.dailyOrderNumber}, Forced: ${force}, HasUnprinted: ${hasUnprinted}, Origin: ${order.origin})`);

        // Add to printing queue
        currentlyPrintingIds.current.add(order.id);

        try {
            const currentSettings = settingsRef.current;
            
            // Pass the items as they are. The printerService will filter for production receipts.
            const success = await printOrder({
                ...order,
                comboPrice: currentSettings?.comboPrice,
                settings: currentSettings
            } as any, force);

            if (success && success.success) {
                // 3. Mark everything as printed in DB (Order + Items)
                await markOrderItemsAsPrinted(order.id);
                
                // Registra na memória que já foi impresso nesta máquina para evitar duplicidade na trava 3
                printedOrderIds.current.add(order.id);
                
                // Update local state and current selection if needed
                const updateFn = (prev: Order[]) => prev.map(o => o.id === order.id ? { ...o, printed: true, items: o.items.map(i => ({...i, printed: true})) } : o);
                setOrders(updateFn);
                
                if (selectedOrder?.id === order.id) {
                    setSelectedOrder(prev => prev ? { ...prev, printed: true, items: prev.items.map(i => ({...i, printed: true})) } : null);
                }
                
                showNotify("Pedido impresso!");
            } else {
                console.warn("Print execution failed:", success?.message);
                if (force) {
                    showNotify(`Erro na Impressora: ${success?.message || 'Verifique o servidor de impressão.'}`, 'error');
                }
            }
        } catch (error) {
            console.error("Print Error:", error);
        } finally {
            // Remove from printing queue after a delay to allow DB sync
            setTimeout(() => {
                if (order.id) currentlyPrintingIds.current.delete(order.id);
            }, 2000);
        }
    }, [printOrder, markOrderItemsAsPrinted]);

    const handleStatusChange = async (orderId: string, newStatus: Order['status']) => {
        if (newStatus === 'Cancelado') {
            const confirmed = window.confirm("⚠️ ATENÇÃO: Você está prestes a CANCELAR este pedido.\n\nEsta ação notificará o cliente e interromperá o fluxo de produção. Deseja continuar?");
            if (!confirmed) return;
        }

        try {
            await updateOrderStatus(orderId, newStatus);
            
            await loadData(true);
        } catch (error) {
            console.error("Error updating status:", error);
            alert("Erro ao atualizar status");
        }
    };

    const handleDeleteOrder = async (orderId: string) => {
        const confirmed = window.confirm("🛑 AVISO PROFISSIONAL: A exclusão de um pedido é IRREVERSÍVEL e removerá todos os registros financeiros associados.\n\nTem certeza que deseja EXCLUIR permanentemente este pedido?");
        if (!confirmed) return;
        try {
            await deleteOrder(orderId);
            await loadData(true);
        } catch (error) {
            console.error("Error deleting order:", error);
            alert("Erro ao excluir pedido.");
        }
    };

    const handleConfirmCheckout = async (details: PaymentDetails) => {
        if (!checkoutOrder || !currentStore) return;

        try {
            // 1. Update Order
            const updates: Partial<Order> = {
                status: 'Entregue',
                paymentMethod: details.method,
                total: details.finalTotal,
                changeFor: details.method === 'Dinheiro' ? details.amountTendered.toString() : undefined,
                discount: details.discount,
                tax: details.tax
            };
            if (checkoutOrder.table_number) {
                // MASS UPDATE for Tables
                await batchUpdateTableOrders(currentStore.id, checkoutOrder.table_number, {
                    status: 'Entregue',
                    paymentMethod: details.method,
                    changeFor: details.method === 'Dinheiro' ? details.amountTendered.toString() : undefined,
                    // Note: individual taxes/discounts might be tricky in batch, 
                    // but for tables we usually apply them to the final closing.
                    // For now, we update the composite state.
                });
            } else {
                // Standard Single Order Update
                await updateOrder(checkoutOrder.id!, updates);
            }

            // 2. Create Cash Transaction - REMOVED (Sales are calculated from orders)
            // const session = await getOpenCashSession(currentStore.id);
            // if (session) {
            //     await createCashTransaction({
            //         session_id: session.id,
            //         store_id: currentStore.id,
            //         type: 'Venda',
            //         amount: details.finalTotal,
            //         justification: `Pedido #${checkoutOrder.dailyOrderNumber} - ${details.method}`
            //     });
            // } else {
            //     alert("Aviso: Nenhum caixa aberto. A venda foi registrada mas não entrou no fluxo de caixa.");
            // }

            // 3. Print Receipt (Skip for Tables as requested)
            const updatedOrder = { ...checkoutOrder, ...updates };
            if (!checkoutOrder.table_number) {
                await handlePrintOrder(updatedOrder, true);
            }

            // 4. Refresh
            await loadData(true);
            setIsCheckoutModalOpen(false);
            setCheckoutOrder(null);

        } catch (error) {
            console.error("Checkout error:", error);
            alert("Erro ao processar checkout.");
        }
    };

    const handleAddItems = (order: Order) => {
        // Find if this is a table order and combine all its active sub-orders
        if (order.table_number) {
            const tableOrders = orders.filter(o => o.table_number === order.table_number && o.status !== 'Entregue' && o.status !== 'Cancelado');
            if (tableOrders.length > 0) {
                const combinedItems = tableOrders.flatMap(o => o.items || []);
                const combinedTotal = tableOrders.reduce((sum, o) => sum + (o.total || 0), 0);
                const virtualOrder = {
                    ...tableOrders[0], // Use first order for base info
                    items: combinedItems,
                    total: combinedTotal
                };
                setSelectedOrder(virtualOrder);
                setIsEditOrderModalOpen(true);
                return;
            }
        }

        // Open Edit Modal to allow adding items (Avulso) to ANY order type
        setSelectedOrder(order);
        setIsEditOrderModalOpen(true);
    };





    // Addon Handlers
    const handleSaveAddon = async (addon: Partial<Addon>) => {
        if (!currentStore) return;
        try {
            if (addon.id) {
                await updateAddon(addon.id, addon);
            } else {
                await createAddon({ ...addon, store_id: currentStore.id } as any);
            }
            await loadData(true);
        } catch (error) {
            console.error("Error saving addon:", error);
            alert("Erro ao salvar adicional");
        }
    };

    const handleDeleteAddon = async (id: string | number) => {
        if (!confirm("Tem certeza? Isso removerá o adicional de todos os itens vinculados.")) return;
        try {
            await deleteAddon(id);
            await loadData(true);
        } catch (error) {
            console.error("Error deleting addon:", error);
            alert("Erro ao excluir adicional");
        }
    };



    const handleCounterOrderComplete = useCallback(async (order: any) => {
        console.log('Attempting to create/update order:', order);
        try {
            if (order.id) {
                await updateOrder(order.id, order);
                console.log('Order updated successfully');
            } else {
                const result = await createOrder(order);
                console.log('Order created successfully:', result);

                if (result) {
                    // Unified flow: Always go to orders tab and try to print.
                    // User requested to remove auto-checkout for Counter/Takeaway.
                    setActiveTab('orders');

                    // Force-merge deliveryFee from input (order.deliveryFee) 
                    // because createOrder might return strict DB columns (which might exclude delivery_fee if column is missing/cached)
                    // This ensures the receipt matches the typed value.
                    const orderToPrint = {
                        ...result,
                        deliveryFee: order.deliveryFee,
                        delivery_fee: order.deliveryFee
                    };
 
                    // Automatic print for ALL new orders created via Counter
                    // Updates (order.id exists) will be handled by handlePrintOrder's printed check
                    await handlePrintOrder(orderToPrint, true);
                }
            }
            if (order.table_number) {
                setActiveTab('orders');
            }
            loadData(true);
        } catch (error) {
            console.error('Error creating/updating order:', error);
            alert('Erro ao salvar pedido. Verifique o console para mais detalhes.');
        }
    }, [currentStore?.id, handlePrintOrder, loadData]);


    const filteredOrders = useMemo(() => {
        return orders.filter(o => {
            if (activeTab === 'orders') return o.status !== 'Entregue' && o.status !== 'Cancelado';
            return true;
        });
    }, [orders, activeTab]);

    useEffect(() => {
        // If the store finished loading but we have no store, we must stop our internal loading spinner
        // Otherwise, it gets stuck in an infinite loop because currentStore is null but loading stays true.
        if (!storeLoading && !currentStore) {
             setLoading(false);
        }
    }, [storeLoading, currentStore]);

    // Auto-disable bot on launch (user request: "ele tem que ficar desligado e a lanchonete liga quando quer usar")
    useEffect(() => {
        if (settings?.isBotEnabled && (window as any).electron && !sessionStorage.getItem('bot_auto_disabled')) {
            sessionStorage.setItem('bot_auto_disabled', 'true');
            handleToggleBot(false);
        } else if (settings && !sessionStorage.getItem('bot_auto_disabled')) {
            // Even if it's already false, mark it as processed so it doesn't run again
            sessionStorage.setItem('bot_auto_disabled', 'true');
        }
    }, [settings]);

    if (storeLoading || loading) return <div className="flex justify-center items-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div></div>;
    if (!currentStore) return <div className="text-center mt-10 text-gray-800 dark:text-gray-200">Loja não encontrada ou acesso inválido.</div>;

    return (
        <div className="h-screen bg-gray-50 dark:bg-gray-900 flex overflow-hidden transition-colors duration-200 relative">
            <UpdateNotification />
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div 
                    className="fixed inset-0 bg-black/50 z-20 md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`fixed md:relative inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-300 ${activeTab === 'kitchen' ? 'hidden' : 'flex'} md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} flex-col`}>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col items-center gap-4">
                    {/* QR Code Staff Portal - Larger and Centered */}
                    <div className="w-full flex justify-center py-2">
                         <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`https://papaleguastocmg.vercel.app/portal-equipe`)}`} 
                            alt="Staff Portal QR" 
                            className="w-32 h-32 rounded-xl border-2 border-gray-100 dark:border-gray-700 shadow-lg bg-white p-2"
                            title="Acesso Staff (Aponte a Câmera)"
                         />
                    </div>
                    <div className="flex w-full justify-between items-center md:hidden">
                        <h1 className="text-lg font-black text-gray-900 dark:text-white leading-tight underline decoration-red-600 decoration-4">ADMIN</h1>
                        <button onClick={() => setIsSidebarOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                            <LucideX size={24} />
                        </button>
                    </div>
                </div>
                
                {/* BOT TOGGLE - SIDECAR */}
                <div className="px-6 mt-4">
                    <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-black text-gray-400 dark:text-gray-500 leading-none">Status</span>
                            <span className={`text-xs font-bold leading-none mt-1 ${settings?.isBotEnabled ? 'text-green-600' : 'text-red-500'}`}>
                                {settings?.isBotEnabled ? 'ROBÔ LIGADO' : 'ROBÔ DESLIGADO'}
                            </span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer scale-90 origin-right">
                            <input
                                type="checkbox"
                                checked={settings?.isBotEnabled ?? true}
                                onChange={() => handleToggleBot()}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-500"></div>
                        </label>
                    </div>
                </div>

                <nav className="p-4 space-y-2 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700" onClick={() => setIsSidebarOpen(false)}>
                    {/* ... Navigation Buttons ... */}
                    <button onClick={() => setActiveTab('counter')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'counter' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                        <Monitor size={20} /> Balcao
                    </button>
                    <button onClick={() => setActiveTab('orders')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'orders' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                        <ShoppingBag size={20} /> Pedidos
                    </button>
                    <button onClick={() => setActiveTab('reviews')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'reviews' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                        <MessageSquare size={20} /> Avaliações
                    </button>
                    <button onClick={() => setActiveTab('whatsapp-bot')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'whatsapp-bot' ? 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                        <MessageSquare size={20} /> WhatsApp AI
                    </button>
                    <button onClick={() => setActiveTab('menu')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'menu' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                        <UtensilsCrossed size={20} /> Cardápio
                    </button>


                    <button onClick={() => setActiveTab('promotions')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'promotions' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                        <Percent size={20} /> Promoções
                    </button>
                    <button onClick={() => setActiveTab('cash')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'cash' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                        <DollarSign size={20} /> Caixa
                    </button>
                    <button onClick={() => setActiveTab('history')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'history' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                        <History size={20} /> Histórico
                    </button>
                    <button onClick={() => setActiveTab('couriers')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'couriers' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                        <Bike size={20} /> Motoboys
                    </button>
                    <button onClick={() => setActiveTab('kitchen')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'kitchen' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                        <UtensilsCrossed size={20} /> Cozinha
                    </button>
                    <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                        <Settings size={20} /> Configurações
                    </button>
                    <button onClick={() => setActiveTab('raffle')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'raffle' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                        <Gift size={20} /> Sorteio
                    </button>
                    <button onClick={() => setActiveTab('ads')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'ads' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                        <ImageIcon size={20} /> Propagandas
                    </button>
                    <button onClick={() => navigate(`/${currentStore.slug}/entregador`)} className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <Bike size={20} /> Área do Entregador
                    </button>
                </nav>
                <div className="w-full p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
                    <button
                        onClick={() => {
                            if (window.confirm("Disparar GOLEADA do Brasil na TV?")) {
                                if (tvChannelRef.current) {
                                    tvChannelRef.current.send({
                                        type: 'broadcast',
                                        event: 'brazil_goal',
                                    });
                                    alert("Goleada disparada! Sorteio iniciado na TV.");
                                } else {
                                    alert("Falha: Canal da TV não conectado.");
                                }
                            }
                        }}
                        className="w-full flex items-center justify-center gap-2 text-green-600 dark:text-green-400 font-bold hover:text-green-700 dark:hover:text-green-500 transition-colors mb-3 bg-green-50 dark:bg-green-900/20 py-2 rounded-lg"
                    >
                        ⚽ GOL DA TV
                    </button>
                    <button
                        onClick={() => {
                            if (window.confirm("Forçar a TV a recarregar a página remotamente?")) {
                                if (tvChannelRef.current) {
                                    tvChannelRef.current.send({
                                        type: 'broadcast',
                                        event: 'reload_tv',
                                    });
                                    alert("Comando de atualização enviado para a TV.");
                                } else {
                                    alert("Falha: Canal da TV não conectado.");
                                }
                            }
                        }}
                        className="w-full flex items-center justify-center gap-2 text-blue-600 dark:text-blue-400 font-bold hover:text-blue-700 dark:hover:text-blue-500 transition-colors mb-3 bg-blue-50 dark:bg-blue-900/20 py-2 rounded-lg"
                    >
                        🔄 RECARREGAR TV
                    </button>
                    {!(window as any).electron && (
                        <button
                            onClick={() => {
                                supabase.channel('tv_overlay_events').send({
                                    type: 'broadcast',
                                    event: 'test_ad_trigger',
                                });
                            }}
                            className="w-full flex items-center justify-center gap-2 text-blue-600 dark:blue-400 font-bold hover:text-blue-700 dark:hover:text-blue-500 transition-colors mb-3 bg-blue-50 dark:bg-blue-900/20 py-2 rounded-lg"
                        >
                            📢 TESTAR PROPAGANDA
                        </button>
                    )}
                    <button
                        onClick={() => setDarkMode(!darkMode)}
                        className="w-full flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors mb-3"
                    >
                        {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                        {darkMode ? 'Modo Claro' : 'Modo Escuro'}
                    </button>
                    <button onClick={() => navigate(`/${currentStore.slug}`)} className="w-full flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors mb-2">
                        <ExternalLink size={18} /> Ver Loja
                    </button>
                    <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                        <LogOut size={18} /> Sair
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className={`flex-1 transition-all duration-300 flex flex-col ${activeTab === 'orders' || activeTab === 'kitchen' || activeTab === 'counter' ? 'overflow-hidden' : 'overflow-y-auto'} ${activeTab === 'counter' || activeTab === 'kitchen' ? 'p-0' : 'p-4 md:p-6'}`}>
                {/* Mobile Header (Hidden in Kitchen Mode) */}
                {activeTab !== 'kitchen' && (
                    <div className="md:hidden flex items-center justify-between mb-4 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                        <h1 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                             <span className="text-red-600">●</span> {activeTab === 'orders' ? 'Pedidos' : activeTab === 'counter' ? 'Balcão' : 'Menu'}
                        </h1>
                        <button onClick={() => setIsSidebarOpen(true)} className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300">
                            <Menu size={24} />
                        </button>
                    </div>
                )}
                {activeTab === 'counter' && currentStore && (
                    <CounterTab
                        categories={categories}
                        menuItems={menuItems}
                        addons={addons}
                        settings={settings}
                        storeId={currentStore.id}
                        activeOrders={orders}
                        onOrderComplete={handleCounterOrderComplete}
                        promotions={promotions}
                    />
                )}

                {(activeTab === 'orders' || activeTab === 'kitchen') && (
                    <div className="flex flex-col lg:flex-row gap-6 flex-1 overflow-hidden pb-4 min-h-0 relative">
                        {activeTab === 'kitchen' && (
                            <button 
                                onClick={() => setActiveTab('orders')}
                                className="absolute top-4 right-4 z-50 bg-black/50 hover:bg-black text-white px-4 py-2 rounded-full font-bold backdrop-blur-sm transition-all shadow-lg hidden md:flex"
                                title="Sair do Modo Cozinha (Apenas Visualização PWA)"
                            >
                                Sair da Cozinha
                            </button>
                        )}
                        {/* Delivery Column */}
                        <div className="flex-1 flex flex-col bg-gray-100 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <div className="p-4 bg-blue-600 text-white font-bold text-lg flex justify-between items-center">
                                <span>Entrega</span>
                                <span className="bg-white text-blue-600 px-2 py-1 rounded-full text-sm">
                                    {filteredOrders.filter(o => o.orderType === 'Entrega').length}
                                </span>
                            </div>
                            <div className="p-4 overflow-y-auto flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-4 content-start scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
                                {filteredOrders.filter(o => o.orderType === 'Entrega').map(order => (
                                    <OrderCard
                                        key={order.id}
                                        order={order}
                                        onPrint={(o) => handlePrintOrder(o, true)}
                                        onCancel={(o) => handleStatusChange(o.id!, 'Cancelado')}
                                        onDelete={(o) => handleDeleteOrder(o.id!)}
                                        onAdvanceStatus={(o) => {
                                            const next = o.status === 'Novo' ? 'Em Produção' : o.status === 'Em Produção' ? 'A Caminho' : o.status === 'A Caminho' ? 'No Portão' : 'Entregue';
                                            handleStatusChange(o.id!, next);
                                        }}
                                        onUpdateStatus={(o, s) => handleStatusChange(o.id!, s)}
                                        onEdit={handleAddItems}
                                    />
                                ))}
                                {filteredOrders.filter(o => o.orderType === 'Entrega').length === 0 && (
                                    <div className="text-center text-gray-500 dark:text-gray-400 mt-10">Sem pedidos de entrega.</div>
                                )}
                            </div>
                        </div>

                        {/* Counter/Pickup Column */}
                        <div className="flex-1 flex flex-col bg-gray-100 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <div className="p-4 bg-orange-600 text-white font-bold text-lg flex justify-between items-center">
                                <span>Balcão / Retirada</span>
                                <span className="bg-white text-orange-600 px-2 py-1 rounded-full text-sm">
                                    {filteredOrders.filter(o => o.orderType !== 'Entrega').length}
                                </span>
                            </div>
                            <div className="p-4 overflow-y-auto flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-4 content-start scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
                                {/* 1. Render Grouped Tables */}
                                {Object.entries(
                                    filteredOrders
                                        .filter(o => o.orderType !== 'Entrega' && o.table_number)
                                        .reduce((acc, order) => {
                                            const tableNum = order.table_number!;
                                            if (!acc[tableNum]) acc[tableNum] = [];
                                            acc[tableNum].push(order);
                                            return acc;
                                        }, {} as Record<number, Order[]>)
                                ).map(([tableNum, tableOrders]) => (
                                    <TableGroupCard
                                        key={`table-${tableNum}`}
                                        tableNumber={parseInt(tableNum)}
                                        orders={tableOrders as Order[]}
                                        onPrint={(o: Order) => handlePrintOrder(o, true)}
                                        onCancel={(o: Order) => handleStatusChange(o.id!, 'Cancelado')}
                                        onAdvanceStatus={(o: Order) => {
                                            const next = o.status === 'Novo' ? 'Em Produção' : o.status === 'Em Produção' ? 'Conta Solicitada' : 'Entregue';
                                            if (next === 'Entregue') {
                                                setCheckoutOrder(o);
                                                setIsCheckoutModalOpen(true);
                                            } else {
                                                handleStatusChange(o.id!, next);
                                            }
                                        }}
                                        onEdit={handleAddItems}
                                    />
                                ))}

                                {/* 2. Render Individual (Non-Table) Counter/Pickup Orders */}
                                {filteredOrders.filter(o => o.orderType !== 'Entrega' && !o.table_number).map(order => (
                                    <OrderCard
                                        key={order.id}
                                        order={order}
                                        onPrint={(o: Order) => handlePrintOrder(o, true)}
                                        onCancel={(o: Order) => handleStatusChange(o.id!, 'Cancelado')}
                                        onAdvanceStatus={(o: Order) => {
                                            const next = (o.status === 'Novo' ? 'Em Produção' : o.status === 'Em Produção' ? 'Conta Solicitada' : 'Entregue');

                                            if (next === 'Entregue') {
                                                setCheckoutOrder(o);
                                                setIsCheckoutModalOpen(true);
                                            } else {
                                                handleStatusChange(o.id!, next);
                                            }
                                        }}
                                        onUpdateStatus={(o: Order, s: OrderStatus) => handleStatusChange(o.id!, s)}
                                        onEdit={handleAddItems}
                                    />
                                ))}
                            </div>

                        </div>
                    </div>
                )}

                {
                    activeTab === 'menu' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <div className="flex flex-col md:flex-row md:items-center gap-4 flex-1 mx-4">
                                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white whitespace-nowrap">Gerenciar Cardápio</h2>
                                    <div className="relative flex-1 max-w-md">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                        <input
                                            type="text"
                                            placeholder="Buscar no cardápio..."
                                            value={menuSearchTerm}
                                            onChange={(e) => setMenuSearchTerm(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-700 border-none rounded-lg text-sm focus:ring-2 focus:ring-red-500 transition-all border border-transparent dark:border-gray-600"
                                        />
                                    </div>
                                </div>
                                <div className="flex gap-2 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                                    <button
                                        onClick={() => setMenuSubTab('items')}
                                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${menuSubTab === 'items' ? 'bg-white dark:bg-gray-600 text-red-600 dark:text-red-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                                    >
                                        Itens
                                    </button>
                                    <button
                                        onClick={() => setMenuSubTab('addons')}
                                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${menuSubTab === 'addons' ? 'bg-white dark:bg-gray-600 text-red-600 dark:text-red-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                                    >
                                        Adicionais
                                    </button>
                                </div>
                                <div className="flex gap-3">
                                    {menuSubTab === 'items' ? (
                                        <>
                                            <button onClick={() => { setEditingCategory(undefined); setIsCategoryModalOpen(true); }} className="px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 font-medium text-gray-700 dark:text-gray-200 transition-colors">
                                                Nova Categoria
                                            </button>
                                            <button onClick={() => { setEditingItem(undefined); setIsItemModalOpen(true); }} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium flex items-center gap-2">
                                                <Plus size={20} /> Novo Item
                                            </button>
                                        </>
                                    ) : (
                                        <button onClick={() => { setEditingAddon(undefined); setIsAddonModalOpen(true); }} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium flex items-center gap-2">
                                            <Plus size={20} /> Novo Adicional
                                        </button>
                                    )}
                                </div>
                            </div>

                             {menuSubTab === 'items' ? (
                                <div className="space-y-6">
                                    {filteredCategories.map((category: Category) => {
                                        const categoryItems = filteredMenuItems.filter((item: MenuItem) => item.categoryId === category.id);
                                        if (menuSearchTerm && categoryItems.length === 0 && !normalizeString(category.name).includes(normalizeString(menuSearchTerm))) return null;

                                        return (
                                            <div key={category.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                                                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                                                    <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100">{category.name}</h3>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => { setEditingCategory(category); setIsCategoryModalOpen(true); }} className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded">
                                                            <Edit size={18} />
                                                        </button>
                                                        <button onClick={() => handleDeleteCategory(category.id)} className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                                    {categoryItems.map((item: MenuItem) => (
                                                        <div key={item.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-b last:border-0 border-gray-100 dark:border-gray-800 ${!item.isAvailable ? 'opacity-60' : ''}`}>
                                                            <div className="p-4 flex items-center justify-between">
                                                                <div className="flex items-center gap-4">
                                                                    {item.image ? (
                                                                        <img src={item.image} alt={item.name} className="w-12 h-12 rounded-lg object-cover" />
                                                                    ) : (
                                                                        <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400">
                                                                            <ImageIcon size={20} />
                                                                        </div>
                                                                    )}
                                                                    <div>
                                                                        <h4 className={`font-bold text-gray-900 dark:text-white ${!item.isAvailable ? 'line-through' : ''}`}>{item.name}</h4>
                                                                        <p className="text-sm text-gray-500 dark:text-gray-400">{item.description}</p>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-6">
                                                                    <span className="font-bold text-gray-900 dark:text-gray-100">R$ {Number(item.price).toFixed(2)}</span>
                                                                    <div className="flex items-center gap-2">
                                                                        <button
                                                                            onClick={() => handleAvailabilityToggle(item)}
                                                                            className={`p-2 rounded-lg transition-colors ${item.isAvailable ? 'text-green-600 bg-green-50 dark:bg-green-900/20 hover:bg-green-100' : 'text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200'}`}
                                                                            title={item.isAvailable ? "Disponível" : "Indisponível"}
                                                                        >
                                                                            {item.isAvailable ? <Eye size={20} /> : <EyeOff size={20} />}
                                                                        </button>
                                                                        <button onClick={() => { setEditingItem(item); setIsItemModalOpen(true); }} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg">
                                                                            <Edit size={20} />
                                                                        </button>
                                                                        <button onClick={() => handleDeleteItem(item.id)} className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                                                                            <Trash2 size={20} />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Linked Addons List (Flavors/Extras) */}
                                                            {item.selectedAddons && item.selectedAddons.length > 0 && (
                                                                <div className="px-4 pb-4 flex flex-wrap gap-2 ml-16">
                                                                    {item.selectedAddons.map((addon: Addon) => (
                                                                        <div
                                                                            key={addon.id}
                                                                            className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border ${addon.isAvailable
                                                                                ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800'
                                                                                : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800'
                                                                                }`}
                                                                        >
                                                                            <span>{addon.name}</span>
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleToggleAddonGlobal(addon);
                                                                                }}
                                                                                className={`p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors ${addon.isAvailable ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                                                                                title={addon.isAvailable ? "Desativar Sabor (Global)" : "Ativar Sabor (Global)"}
                                                                            >
                                                                                {addon.isAvailable ? <Eye size={12} /> : <EyeOff size={12} />}
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {categoryItems.length === 0 && (
                                                        <div className="p-4 text-center text-gray-400 text-sm italic">
                                                            Nenhum item nesta categoria match com a busca.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    {filteredAddons.length === 0 ? (
                                        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                                            {menuSearchTerm ? 'Nenhum adicional encontrado para esta busca.' : 'Nenhum adicional cadastrado.'}
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {filteredAddons.map((addon: Addon) => (
                                                <div key={addon.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                    <div>
                                                        <h4 className="font-bold text-gray-900 dark:text-white">{addon.name}</h4>
                                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                                            {addon.categoryId ? `Vinculado a: ${categories.find(c => c.id === addon.categoryId)?.name || 'Categoria Desconhecida'}` : 'Disponível para todas as categorias'}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <span className="font-bold text-gray-900 dark:text-gray-200">
                                                            {addon.price === 0 ? 'Grátis' : `+ R$ ${Number(addon.price).toFixed(2)}`}
                                                        </span>
                                                        <span className={`px-2 py-1 rounded text-xs font-bold ${addon.isAvailable ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}`}>
                                                            {addon.isAvailable ? 'Ativo' : 'Inativo'}
                                                        </span>
                                                        <div className="flex gap-2">
                                                            <button onClick={() => { setEditingAddon(addon); setIsAddonModalOpen(true); }} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg">
                                                                <Edit size={18} />
                                                            </button>
                                                            <button onClick={() => handleDeleteAddon(addon.id)} className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                                                                <Trash2 size={18} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                }



                {
                    activeTab === 'settings' && settings && (
                        <SettingsTab
                            settings={settings}
                            onSave={handleSaveSettings}
                            installPrompt={installPrompt}
                            onInstall={handleInstallClick}
                        />
                    )
                }

                {
                    activeTab === 'promotions' && (
                        <PromotionTab
                            promotions={promotions}
                            onCreate={handleCreatePromotion}
                            onUpdate={handleUpdatePromotion}
                            onDelete={handleDeletePromotion}
                        />
                    )
                }

                {
                    activeTab === 'cash' && currentStore && (
                        <CashFlowTab storeId={currentStore.id} />
                    )
                }

                {activeTab === 'raffle' && currentStore && settings && (
                    <RaffleTab
                        storeId={currentStore.id}
                        settings={settings}
                        onUpdate={() => loadData(true)}
                    />
                )}
                
                {activeTab === 'ads' && <AdsTab />}

                {activeTab === 'reviews' && currentStore && (
                    <ReviewsTab storeId={currentStore.id} />
                )}
                {activeTab === 'history' && currentStore && (
                    <SalesHistory storeId={currentStore.id} onClose={() => setActiveTab('orders')} />
                )}
                {activeTab === 'couriers' && <CouriersTab />}
                {activeTab === 'whatsapp-bot' && (
                    <WhatsAppBotTab 
                        isBotEnabled={settings?.isBotEnabled ?? false} 
                        onToggleBot={() => handleToggleBot()}
                    />
                )}
            </main>

            {/* Modals */}
            <CategoryModalComponent
                isOpen={isCategoryModalOpen}
                onClose={() => setIsCategoryModalOpen(false)}
                onSave={handleSaveCategory}
                initialData={editingCategory}
            />
            <MenuItemModalComponent
                isOpen={isItemModalOpen}
                onClose={() => setIsItemModalOpen(false)}
                onSave={handleSaveItem}
                initialData={editingItem}
                categories={categories}
                storeId={currentStore?.id || ''}
                addons={addons}
                defaultCategoryId={lastSelectedCategoryId}
            />
            <AddonModalComponent
                isOpen={isAddonModalOpen}
                onClose={() => setIsAddonModalOpen(false)}
                onSave={handleSaveAddon}
                initialData={editingAddon}
                storeId={currentStore?.id || ''}
                categories={categories}
            />
            {
                selectedOrder && (
                    <EditOrderModalComponent
                        isOpen={isEditOrderModalOpen}
                        onClose={() => setIsEditOrderModalOpen(false)}
                        onSave={async (savedOrder) => {
                            if (!selectedOrder || !savedOrder.id) return;

                            try {
                                // 1. Identify if it's a table order and if there are NEW items
                                const isTable = !!savedOrder.table_number;
                                
                                if (isTable) {
                                    // Fetch current active orders for this table to map items correctly
                                    const currentTableOrders = orders.filter(o => o.table_number === savedOrder.table_number && o.status !== 'Entregue' && o.status !== 'Cancelado');
                                    
                                    const originalCartIdsArray = currentTableOrders.flatMap(o => (o.items || []).map(i => i.cartId));
                                    const originalCartIds = new Set(originalCartIdsArray);
                                    
                                    const newItems = (savedOrder.items || []).filter(i => !originalCartIds.has(i.cartId));
                                    const existingItems = (savedOrder.items || []).filter(i => originalCartIds.has(i.cartId));

                                    // A. Create NEW order for new items (triggers auto-print)
                                    if (newItems.length > 0) {
                                        const totalNewItems = newItems.reduce((sum, item) => {
                                            const addonsPrice = item.selectedAddons?.reduce((acc: number, a: any) => acc + (a.price || 0), 0) || 0;
                                            return sum + ((item.price + addonsPrice) * item.quantity);
                                        }, 0);

                                        const newSubOrder: any = {
                                            ...savedOrder,
                                            id: undefined, // Let DB generate new ID
                                            dailyOrderNumber: savedOrder.dailyOrderNumber, // Use same base sequence
                                            items: newItems,
                                            total: totalNewItems, // New order only has new items total
                                            timestamp: new Date().toISOString(),
                                            printed: false,
                                            status: 'Novo'
                                        };
                                        delete newSubOrder.id;

                                        await createOrder(newSubOrder);
                                        showNotify("Novo pedido gerado para o acréscimo!", "success");
                                    }

                                    // B. Distribute existing items back to their original sub-orders
                                    for (const tableOrder of currentTableOrders) {
                                        const orderCartIds = new Set((tableOrder.items || []).map(i => i.cartId));
                                        const itemsForThisOrder = existingItems.filter(i => orderCartIds.has(i.cartId));
                                        
                                        const newTotal = itemsForThisOrder.reduce((sum, item) => {
                                            const addonsPrice = item.selectedAddons?.reduce((acc: number, a: any) => acc + (a.price || 0), 0) || 0;
                                            return sum + ((item.price + addonsPrice) * item.quantity);
                                        }, 0) + (tableOrder.deliveryFee || 0);

                                        if (tableOrder.items && tableOrder.items.length > 0 && itemsForThisOrder.length === 0) {
                                            // All items deleted from this sub-order
                                            await deleteOrder(tableOrder.id!);
                                        } else {
                                            // Update the sub-order
                                            await handleUpdateOrder(tableOrder.id!, {
                                                ...tableOrder,
                                                items: itemsForThisOrder,
                                                total: newTotal
                                            });
                                        }
                                    }
                                } else {
                                    // Not a table, update normally
                                    await handleUpdateOrder(savedOrder.id, savedOrder);
                                }
                                
                                setIsEditOrderModalOpen(false);
                                await loadData(true);
                            } catch (error) {
                                console.error("Error saving edit:", error);
                                alert("Erro ao salvar alterações");
                            }
                        }}
                        order={selectedOrder}
                        menuItems={menuItems}
                        categories={categories}
                    />
                )
            }
            {
                checkoutOrder && (
                    <CheckoutModal
                        isOpen={isCheckoutModalOpen}
                        onClose={() => setIsCheckoutModalOpen(false)}
                        onConfirm={handleConfirmCheckout}
                        order={checkoutOrder}
                    />
                )
            }

            <AvailabilityReminderModal
                isOpen={showAvailabilityReminder}
                onClose={() => setShowAvailabilityReminder(false)}
                unavailableCount={menuItems.filter(i => !i.isAvailable).length + addons.filter(a => !a.isAvailable).length}
                onGoToMenu={() => {
                    setActiveTab('menu');
                    setMenuSubTab('items');
                }}
            />
            
            <Notification 
                show={notification.show} 
                message={notification.message} 
                type={notification.type} 
                onClose={() => setNotification(p => ({ ...p, show: false }))} 
            />
            {showPrintSplash && (
                <PrintStatusSplash 
                    show={showPrintSplash} 
                    onClose={() => setShowPrintSplash(false)} 
                />
            )}
        </div>
    );
};

export default AdminPage;
