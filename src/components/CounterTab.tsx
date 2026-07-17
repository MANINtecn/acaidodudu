import { useState, useMemo, useEffect, memo, useRef } from 'react';
import { Plus, Minus, Trash2, Search, X, Bike, ShoppingBag, LogOut, Percent } from 'lucide-react';
import type { Category, MenuItem, Addon, CartItem, OrderType, PaymentMethod, Settings, OrderStatus, Customer, Order, Promotion } from '../types';
import { fetchOpenOrderForTable, fetchCustomerByPhone, upsertCustomer, searchCustomers } from '../services/supabaseService';
import { normalizeString } from '../utils/searchUtils';
import { Notification, NotificationType } from './Notification';
import CounterMenuGrid from './CounterMenuGrid';

interface CounterTabProps {
    categories: Category[];
    menuItems: MenuItem[];
    addons: Addon[];
    settings: Settings | null;
    storeId: string;
    onOrderComplete: (order: any) => Promise<void>;
    initialTable?: number;
    activeOrders: Order[];
    onBack?: () => void;
    promotions?: Promotion[];
}

export const CounterTab = memo(({ categories, menuItems, addons, settings, storeId, onOrderComplete, initialTable, activeOrders, onBack, promotions }: CounterTabProps) => {
    const [selectedCategoryId, setSelectedCategoryId] = useState<number>(categories[0]?.id || 0);
    const [searchTerm, setSearchTerm] = useState('');
    const [cart, setCart] = useState<CartItem[]>([]);
    const [orderType, setOrderType] = useState<OrderType>('Balcão');
    const [selectedTable, setSelectedTable] = useState<string>('');
    const [customerName, setCustomerName] = useState('');
    const [isTableModalOpen, setIsTableModalOpen] = useState(false);
    const [isCustomItemModalOpen, setIsCustomItemModalOpen] = useState(false);
    const [isAddonModalOpen, setIsAddonModalOpen] = useState(false);
    const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Dinheiro');
    const [changeFor, setChangeFor] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

    // Debounce Product Search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // SAFETY: auto-reset isProcessing after 15s to prevent permanent UI lockup if a promise hangs
    useEffect(() => {
        if (isProcessing) {
            const timer = setTimeout(() => {
                setIsProcessing(false);
            }, 15000);
            return () => clearTimeout(timer);
        }
    }, [isProcessing]);

    const tableStatuses = useMemo(() => {
        const statuses: Record<number, OrderStatus> = {};
        activeOrders.forEach(o => {
            if (o.table_number) {
                statuses[o.table_number] = o.status;
            }
        });
        return statuses;
    }, [activeOrders]);

    const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);

    // Custom Item State
    const [customItemName, setCustomItemName] = useState('');
    const [customItemPrice, setCustomItemPrice] = useState('');

    // Delivery State
    const [addressDetails, setAddressDetails] = useState({ street: '', number: '', district: '', reference: '' });
    const [deliveryFee, setDeliveryFee] = useState(0);
    const [phone, setPhone] = useState('');

    // Notification State
    const [notification, setNotification] = useState<{ show: boolean; message: string; type: NotificationType }>({
        show: false,
        message: '',
        type: 'success'
    });

    const showNotify = (message: string, type: NotificationType = 'success') => {
        setNotification({ show: true, message, type });
    };

    useEffect(() => {
        if (settings?.deliveryFee) {
            setDeliveryFee(settings.deliveryFee);
        }
    }, [settings]);


    // Pre-normalize items for faster search filtering
    const normalizedMenuData = useMemo(() => {
        return menuItems.map(item => ({
            ...item,
            _normalizedName: normalizeString(item.name)
        }));
    }, [menuItems]);

    const normalizedPromotions = useMemo(() => {
        return (promotions || []).map(p => ({
            ...p,
            _normalizedName: normalizeString(p.name),
            _normalizedDesc: normalizeString(p.description || '')
        }));
    }, [promotions]);

    const filteredItems = useMemo(() => {
        const normalizedSearch = normalizeString(debouncedSearchTerm);
        const isPromoCategory = selectedCategoryId === -1;
        
        // Filter menu items
        const items = normalizedMenuData.filter(item => {
            // If viewing specifically Promotions, don't show regular items unless searching
            if (isPromoCategory && !debouncedSearchTerm) return false;
            
            const matchesCategory = debouncedSearchTerm ? true : item.categoryId === selectedCategoryId;
            const matchesSearch = item._normalizedName.includes(normalizedSearch);
            return matchesCategory && matchesSearch && item.isAvailable;
        });

        // Filter promotions
        const showPromos = debouncedSearchTerm || isPromoCategory;
        if (showPromos && normalizedPromotions.length > 0) {
            const promoItems = normalizedPromotions
                .filter(p => {
                    const matchesStatus = p.isActive;
                    const matchesSearch = debouncedSearchTerm 
                        ? (p._normalizedName.includes(normalizedSearch) || p._normalizedDesc.includes(normalizedSearch))
                        : true; 
                    return matchesStatus && matchesSearch;
                })
                .map(p => ({
                    ...p,
                    categoryId: -1,
                    eligibleForCombo: false,
                    isCombo: false,
                    selectedAddons: [],
                    isAvailable: true,
                    addons: [],
                    description: p.description || ''
                } as unknown as MenuItem));
            
            if (isPromoCategory && !debouncedSearchTerm) return promoItems;
            return [...items, ...promoItems];
        }

        return items;
    }, [normalizedMenuData, selectedCategoryId, debouncedSearchTerm, normalizedPromotions]);

    const addToCart = (item: MenuItem) => {
        setCart(prev => {
            const existing = prev.find(i => i.id === item.id && i.selectedAddons.length === 0 && !i.notes);
            if (existing) {
                return prev.map(i => i.cartId === existing.cartId ? { ...i, quantity: i.quantity + 1 } : i);
            }
            return [...prev, {
                ...item,
                cartId: `${item.id}-${Date.now()}`,
                quantity: 1,
                notes: '',
                selectedAddons: [],
                isCombo: false
            }];
        });
    };

    const updateQuantity = (cartId: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.cartId === cartId) {
                const newQty = item.quantity + delta;
                return newQty > 0 ? { ...item, quantity: newQty } : item;
            }
            return item;
        }));
    };

    const removeItem = (cartId: string) => {
        setCart(prev => prev.filter(item => item.cartId !== cartId));
    };

    const updateNotes = (cartId: string, notes: string) => {
        setCart(prev => prev.map(item => item.cartId === cartId ? { ...item, notes } : item));
    };

    const openAddonModal = (item: CartItem) => {
        setEditingCartItem(item);
        setIsAddonModalOpen(true);
    };

    const handleAddAddon = (addon: Addon) => {
        if (!editingCartItem) return;
        setCart(prev => prev.map(item => {
            if (item.cartId === editingCartItem.cartId) {
                const hasAddon = item.selectedAddons.some(a => a.id === addon.id);
                const newAddons = hasAddon
                    ? item.selectedAddons.filter(a => a.id !== addon.id)
                    : [...item.selectedAddons, addon];
                return { ...item, selectedAddons: newAddons };
            }
            return item;
        }));
    };

    const handleAddCustomItem = () => {
        if (!customItemName || !customItemPrice) return;
        const price = parseFloat(customItemPrice.replace(',', '.'));
        if (isNaN(price)) return;
        const newItem: CartItem = {
            id: -Date.now(),
            name: customItemName,
            description: 'Item Avulso',
            price: price,
            categoryId: -1,
            eligibleForCombo: false,
            isCombo: false,
            selectedAddons: [],
            store_id: storeId,
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

    const total = cart.reduce((sum, item) => {
        let itemPrice = Number(item.price) || 0;
        if (item.isCombo && settings?.comboPrice) {
            itemPrice += Number(settings.comboPrice) || 0;
        }
        const addonsPrice = item.selectedAddons?.reduce((s, a) => s + (Number(a.price) || 0), 0) || 0;
        const itemTotal = (itemPrice + addonsPrice) * item.quantity;
        return sum + itemTotal;
    }, 0) + (orderType === 'Entrega' ? (Number(deliveryFee) || 0) : 0);

    const [searchPhone, setSearchPhone] = useState('');
    const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
    const [isExistingCustomer, setIsExistingCustomer] = useState(false);
    const [searchResults, setSearchResults] = useState<Customer[]>([]);
    const [showResults, setShowResults] = useState(false);
    const customerSearchRef = useRef<HTMLDivElement>(null);

    // Handle click outside for customer search
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (customerSearchRef.current && !customerSearchRef.current.contains(event.target as Node)) {
                setShowResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Debounce Search Effect
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (searchPhone.length > 2) {
                // Determine if we need to auto-DDD for prediction? 
                // Mostly useful for final selection, but for search we can try searching raw first.
                // If user types '99...', we might want to search '3299...' too.
                
                let query = searchPhone;
                // Simple heuristic: if typing phone without DDD, try to search with DDD too if purely numeric
                const numeric = searchPhone.replace(/\D/g, '');
                if (numeric.length >= 4 && numeric.length <= 9) {
                     // The backend 'searchCustomers' uses OR logic, so we pass raw query. 
                     // Enhancing backend to handle local DDD might be better, but frontend visual feedback is easier if we just pass what user type.
                     // IMPORTANT: 'searchCustomers' will be used directly.
                }

                try {
                    const results = await searchCustomers(query, storeId);
                    setSearchResults(results);
                } catch (err) {
                    console.error(err);
                }
            } else {
                setSearchResults([]);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchPhone, storeId]);


    const handleSearchCustomer = async (overrideQuery?: string) => {
        const query = overrideQuery || searchPhone;
        if (!query) return;
        
        setIsSearchingCustomer(true);
        try {
            let phoneToSearch = query.replace(/\D/g, '');
            // Auto-DDD logic for direct submission (Enter key or Button)
            const defaultDDD = settings?.defaultDDD || '32';
            if (phoneToSearch.length <= 9 && phoneToSearch.length >= 8) phoneToSearch = `${defaultDDD}${phoneToSearch}`;
            
            const customer = await fetchCustomerByPhone(phoneToSearch, storeId);
            if (customer) {
                populateCustomerData(customer);
                setIsExistingCustomer(true);
            } else {
                // Try searching by name if phone ref lookup failed
                const list = await searchCustomers(query, storeId);
                if (list.length > 0) {
                     // If exactly one match or top match is very strong, could auto-select, but better to show list.
                     // For 'Enter' key, maybe select first?
                     populateCustomerData(list[0]);
                     setIsExistingCustomer(true);
                } else {
                    setCustomerName('');
                    setPhone(phoneToSearch); // Keep the phone they tried
                    setAddressDetails({ street: '', number: '', district: '', reference: '' });
                    setIsExistingCustomer(false);
                    showNotify('Cliente não encontrado. Preencha o cadastro.', 'warning');
                }
            }
        } catch (error) {
            console.error(error);
            showNotify('Erro ao buscar cliente.', 'error');
        } finally {
            setIsSearchingCustomer(false);
        }
    };

    const selectReferencedCustomer = (customer: Customer) => {
        populateCustomerData(customer);
        setSearchPhone(customer.phone); // Update input to show selected phone
        setIsExistingCustomer(true);
        setShowResults(false);
    };

    const populateCustomerData = (customer: Customer) => {
        setCustomerName(customer.name);
        
        // Sanitize phone: Remove '55' country code if present (Supabase expects 10-11 digits)
        let cleanPhone = customer.phone || '';
        cleanPhone = cleanPhone.replace(/\D/g, '');
        if (cleanPhone.startsWith('55') && cleanPhone.length > 11) {
            cleanPhone = cleanPhone.substring(2);
        }
        setPhone(cleanPhone);
        
        // Improved Regex Parsing for Address
        const address = customer.address || '';
        // Matches: (Street part) (Number digits) (Optional Space-hyphen-Space Suffix)
        const match = address.match(/^(.*?)(?:,\s*|\s+)(\d+)(?:\s*-\s*(.*))?$/);
        
        let street = '', number = '', district = '', extractedReference = '';

        if (match) {
            street = match[1].replace(/,$/, '').trim(); // Remove trailing comma if captured
            number = match[2];
            district = match[3] || '';
            
            // Extract reference from district if present in parens
            const refMatch = district.match(/\s*\((.*?)\)$/);
            if (refMatch) {
                extractedReference = refMatch[1];
                district = district.replace(/\s*\(.*?\)$/, '');
            }
        } else {
            // Fallback to simple split if regex fails (e.g. no number found)
            const parts = address.split(', ');
            if (parts.length >= 2) {
                 // ... (Keep existing simple logic just in case, or simpliy default to raw address)
                 street = parts[0];
                 number = parts.slice(1).join(' ').match(/\d+/)?.[0] || '';
            } else {
                 street = address;
            }
        }
        
        setAddressDetails({ street, number, district, reference: extractedReference || customer.reference_point || '' });
    };

    const handleSelectTable = async (tableNum: string) => {
        setSelectedTable(tableNum);
        setIsTableModalOpen(false);
        setIsProcessing(true);
        try {
            const existingOrder = await fetchOpenOrderForTable(storeId, parseInt(tableNum));
            if (existingOrder) {
                setCart(existingOrder.items);
                setCurrentOrderId(existingOrder.id || null);
                setCustomerName(existingOrder.customerName);
            } else {
                setCurrentOrderId(null);
                setCustomerName(`Mesa ${tableNum}`);
                setCart([]);
            }
        } catch (error) {
            console.error(error);
            showNotify('Erro ao verificar mesa.', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    useEffect(() => {
        if (initialTable) {
            handleSelectTable(initialTable.toString());
        }
    }, [initialTable]);

    const handleFinalize = async () => {
        if (cart.length === 0) return;
        setIsProcessing(true);
        try {
            const isAvulso = orderType === 'Balcão' && !selectedTable;
            let finalAddress = '';
            
            // Logic to determine phone with robust normalization
            let finalPhone = (phone || searchPhone || '').replace(/\D/g, '');
            
            // 1. Strip country code '55' if present
            if (finalPhone.startsWith('55') && finalPhone.length > 11) {
                finalPhone = finalPhone.substring(2);
            }

            if (finalPhone.length >= 8) {
                const defaultDDD = settings?.defaultDDD || '32';
                // 2. Add DDD for 8 or 9 digit numbers
                if (finalPhone.length === 8 || finalPhone.length === 9) {
                    finalPhone = `${defaultDDD}${finalPhone}`;
                }
            } else if (finalPhone) {
                // If there's a phone but it's too short (< 8), we should probably block or ignore it here.
                finalPhone = ''; // Invalid
            }

            if (orderType === 'Entrega') {
                finalAddress = `${addressDetails.street}, ${addressDetails.number}`;
                if (addressDetails.district) finalAddress += ` - ${addressDetails.district}`;
                if (addressDetails.reference) finalAddress += ` (${addressDetails.reference})`;
                if (finalPhone && customerName) {
                    let customerAddress = `${addressDetails.street}, ${addressDetails.number}`;
                    if (addressDetails.district) customerAddress += ` - ${addressDetails.district}`;
                    let customerPayload: any = { 
                        store_id: storeId, 
                        phone: finalPhone, 
                        name: customerName, 
                        address: customerAddress, 
                        reference_point: addressDetails.reference || ''
                    };

                    // Only add total_orders if it's a NEW customer to avoid resetting existing count
                    // Also consider it "new" if we are determining phone manually (finalPhone != phone state implying no select happened)
                    if (!isExistingCustomer) {
                        customerPayload.total_orders = 0;
                    }

                    await upsertCustomer(customerPayload);
                }
            } else if (isAvulso) finalAddress = 'Balcão (Avulso)';
            else if (orderType === 'Balcão') finalAddress = `Mesa ${selectedTable}`;
            const orderData = {
                id: currentOrderId || undefined,
                // LET THE DATABASE HANDLE THIS (Trigger set_daily_order_number)
                // dailyOrderNumber: await getNextDailyOrderNumber(storeId), -> REMOVED TO FIX RACE CONDITION
                dailyOrderNumber: 0, 
                customerName: isAvulso ? (customerName || 'Cliente Avulso') : (orderType === 'Balcão' ? `Mesa ${selectedTable}` : (customerName || (orderType === 'Entrega' ? 'Entrega' : 'Balcão'))),
                phone: finalPhone || undefined,
                address: finalAddress,
                orderType,
                paymentMethod,
                changeFor: paymentMethod === 'Dinheiro' && changeFor ? changeFor : undefined,
                items: cart,
                total,
                status: 'Novo',
                store_id: storeId,
                table_number: (isAvulso || orderType === 'Entrega' || orderType === 'Retirada') ? undefined : parseInt(selectedTable),
                comandaNumber: (isAvulso || orderType === 'Entrega' || orderType === 'Retirada') ? undefined : parseInt(selectedTable),
                deliveryFee: orderType === 'Entrega' ? deliveryFee : 0,
                origin: 'APP',
                printed: false
            };

            await onOrderComplete(orderData);
            setCart([]);
            setSelectedTable('');
            setCurrentOrderId(null);
            setCustomerName('');
            showNotify(isAvulso ? 'Venda Avulsa registrada! 💰' : 'Pedido salvo com sucesso! ✅');
        } catch (error) {
            console.error(error);
            showNotify('Erro ao salvar pedido.', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleOrderTypeChange = (type: OrderType) => {
        setOrderType(type);
        setSelectedTable('');
        setCustomerName('');
        setSearchPhone('');
        setSearchResults([]);
        setShowResults(false);
        setPhone('');
        setAddressDetails({ street: '', number: '', district: '', reference: '' });
        setIsExistingCustomer(false);
        setCurrentOrderId(null);
    };

    return (
        <div className="flex flex-col md:flex-row min-h-full w-full gap-4 md:gap-8 p-4 md:p-12 bg-gray-100 dark:bg-gray-900 overflow-y-auto md:overflow-hidden font-sans">
             <Notification show={notification.show} message={notification.message} type={notification.type} onClose={() => setNotification(p => ({ ...p, show: false }))} />

            {/* COLUMN 1: MENU (PICKING) - BLUE THEME */}
            <div className="flex-[3] flex flex-col bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-blue-100 dark:border-blue-900/30 md:overflow-hidden">
                <div className="p-3 bg-blue-50/50 dark:bg-blue-900/10 border-b border-blue-100 dark:border-blue-900/20">
                    <div className="relative mb-2 flex gap-2 items-center">
                        {onBack && (
                            <button onClick={onBack} className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-xl shadow-lg shadow-red-500/20 transition-all" title="Voltar às Mesas">
                                <LogOut size={20} className="rotate-180" />
                            </button>
                        )}
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-blue-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="Buscar produto..." 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-900/30 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-gray-400" 
                        />
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pb-1">
                        {normalizedPromotions.length > 0 && (
                            <button 
                                onClick={() => setSelectedCategoryId(-1)} 
                                className={`px-4 py-1.5 rounded-full whitespace-nowrap font-bold text-xs uppercase tracking-wider transition-all shadow-sm flex items-center gap-1.5
                                    ${selectedCategoryId === -1 
                                        ? 'bg-red-600 text-white shadow-red-500/20' 
                                        : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-100 dark:border-red-900/10'}`}
                            >
                                <Percent size={14} />
                                Promoções
                            </button>
                        )}
                        {categories.map(cat => (
                            <button 
                                key={cat.id} 
                                onClick={() => setSelectedCategoryId(cat.id)} 
                                className={`px-4 py-1.5 rounded-full whitespace-nowrap font-bold text-xs uppercase tracking-wider transition-all shadow-sm
                                    ${selectedCategoryId === cat.id 
                                        ? 'bg-blue-600 text-white shadow-blue-500/20' 
                                        : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-blue-50 dark:border-blue-900/10'}`}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>
                </div>
                
                <CounterMenuGrid items={filteredItems} onAdd={addToCart} />
            </div>

            {/* COLUMN 2: SELECTED ITEMS (CART) - GREEN THEME */}
            <div className="flex-[3] flex flex-col bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-green-100 dark:border-green-900/30 md:overflow-hidden">
                <div className="p-4 bg-green-50/50 dark:bg-green-900/10 border-b border-green-100 dark:border-green-900/20 flex justify-between items-center">
                    <h3 className="font-black text-green-700 dark:text-green-400 uppercase tracking-widest text-xs flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        Produtos no Pedido
                    </h3>
                    <button onClick={() => setIsCustomItemModalOpen(true)} className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all shadow-lg shadow-green-600/20">
                        <Plus size={16} strokeWidth={3} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
                    {cart.map(item => (
                        <div key={item.cartId} className="bg-gray-50/50 dark:bg-gray-700/20 rounded-2xl p-3 border border-gray-100 dark:border-gray-700 group transition-all hover:bg-white dark:hover:bg-gray-700/40 hover:shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-bold text-gray-800 dark:text-gray-100 text-xs uppercase tracking-tight leading-tight flex-1">{item.name}</span>
                                <span className="font-black text-gray-900 dark:text-white text-xs ml-2 whitespace-nowrap">R$ {(((Number(item.price) || 0) + item.selectedAddons.reduce((s, a) => s + (Number(a.price) || 0), 0)) * item.quantity).toFixed(2)}</span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <div className="flex items-center bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm p-0.5">
                                    <button onClick={() => updateQuantity(item.cartId, -1)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 transition-colors"><Minus size={14} /></button>
                                    <span className="px-2 text-xs font-black min-w-[20px] text-center">{item.quantity}</span>
                                    <button onClick={() => updateQuantity(item.cartId, 1)} className="p-1.5 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg text-green-600 transition-colors"><Plus size={14} /></button>
                                </div>
                                <button onClick={() => removeItem(item.cartId)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"><Trash2 size={16} /></button>
                                <button onClick={() => openAddonModal(item)} className="ml-auto px-2.5 py-1 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-[10px] font-black rounded-lg uppercase tracking-wider hover:bg-green-100 transition-all border border-green-200/50 dark:border-green-700/50">
                                    Adds {item.selectedAddons.length > 0 && `(${item.selectedAddons.length})`}
                                </button>
                            </div>

                            {item.eligibleForCombo && (
                                <div className="mt-2 pt-2 border-t border-dashed border-gray-200 dark:border-gray-600">
                                    <label className="flex items-center gap-2 cursor-pointer group/combo">
                                        <div className={`w-4 h-4 rounded border transition-all flex items-center justify-center ${item.isCombo ? 'bg-purple-600 border-purple-600 shadow-sm shadow-purple-500/20' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'}`}>
                                            {item.isCombo && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                        </div>
                                        <input type="checkbox" className="hidden" checked={item.isCombo} onChange={(e) => setCart(prev => prev.map(i => i.cartId === item.cartId ? { ...i, isCombo: e.target.checked } : i))} />
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${item.isCombo ? 'text-purple-600' : 'text-gray-400 group-hover/combo:text-purple-400 transition-colors'}`}>
                                            Combo (+ R$ {Number(settings?.comboPrice || 13).toFixed(2)})
                                        </span>
                                    </label>
                                </div>
                            )}
                            
                            <input 
                                type="text" 
                                placeholder="Notas do item..." 
                                value={item.notes} 
                                onChange={e => updateNotes(item.cartId, e.target.value)} 
                                className="w-full mt-2 px-3 py-1.5 text-[10px] bg-white/50 dark:bg-gray-800/50 border border-white/5 animate-pulse-border rounded-xl focus:border-green-500 outline-none transition-all" 
                            />
                        </div>
                    ))}
                    {cart.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-gray-300 dark:text-gray-600 opacity-50 space-y-2">
                            <ShoppingBag size={48} strokeWidth={1} />
                            <p className="font-bold uppercase tracking-widest text-[10px]">CARRINHO VAZIO</p>
                        </div>
                    )}
                </div>
            </div>

            {/* COLUMN 3: ORDER INFO & DETAILS (RED THEME) */}
            <div className="flex-[3] flex flex-col bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-red-100 dark:border-red-900/30 md:overflow-hidden">
                <div className="p-3 bg-red-50/50 dark:bg-red-900/10 border-b border-red-100 dark:border-red-900/20">
                    <div className="flex p-1 bg-gray-100 dark:bg-gray-900 rounded-xl gap-1">
                        <button onClick={() => handleOrderTypeChange('Balcão')} className={`flex-1 py-2 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all ${orderType === 'Balcão' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}>Mesa</button>
                        <button onClick={() => handleOrderTypeChange('Retirada')} className={`flex-1 py-2 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all ${orderType === 'Retirada' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}>Retirada</button>
                        <button onClick={() => handleOrderTypeChange('Entrega')} className={`flex-1 py-2 rounded-lg font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 transition-all ${orderType === 'Entrega' ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}><Bike size={12} /> Entrega</button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
                    {orderType === 'Balcão' && (
                        <div className="space-y-4 animate-fade-in">
                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center justify-between">
                                Selecione a Mesa {selectedTable && <span className="text-orange-600">Mesa {selectedTable} selecionada</span>}
                            </h4>
                            <div className="grid grid-cols-5 gap-2">
                                {Array.from({ length: 30 }, (_, i) => i + 1).map(num => {
                                    const status = tableStatuses[num];
                                    const isSelected = selectedTable === num.toString().padStart(2, '0');
                                    let statusColor = isSelected 
                                        ? 'bg-orange-500 text-white border-orange-500 shadow-md scale-105' 
                                        : (status 
                                            ? 'bg-red-50 dark:bg-red-900/20 text-red-600 border-red-100 dark:border-red-900/30' 
                                            : 'bg-white dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 border-gray-100 dark:border-gray-600 hover:border-orange-200');
                                    return (
                                        <button 
                                            key={num} 
                                            onClick={() => handleSelectTable(num.toString().padStart(2, '0'))} 
                                            className={`aspect-square rounded-xl font-black text-sm border-2 transition-all flex items-center justify-center ${statusColor}`}
                                        >
                                            {num}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {orderType === 'Retirada' && (
                        <div className="space-y-4 animate-fade-in">
                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Identificação do Cliente</h4>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                <input 
                                    type="text" 
                                    placeholder="Nome do cliente para retirada..." 
                                    value={customerName} 
                                    onChange={e => setCustomerName(e.target.value)} 
                                    className="w-full pl-9 pr-3 py-3 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                                />
                            </div>
                        </div>
                    )}

                    {orderType === 'Entrega' && (
                        <div className="space-y-3 animate-fade-in">
                            <div className="bg-red-50/50 dark:bg-red-900/10 p-3 rounded-2xl border border-red-100 dark:border-red-900/20 space-y-3">
                                <div className="flex gap-2">
                                    <div className="flex-1 relative group/search" ref={customerSearchRef}>
                                        <input 
                                            type="text" // Changed from tel to text to allow name search
                                            placeholder="Buscar Telefone ou Nome..." 
                                            value={searchPhone} 
                                            onChange={(e) => {
                                                setSearchPhone(e.target.value);
                                                setShowResults(true);
                                            }} 
                                            onFocus={() => setShowResults(true)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    // If searching by phone explicitly with Enter, try to find exact match
                                                    handleSearchCustomer(searchPhone);
                                                    setShowResults(false);
                                                }
                                            }}
                                            className="w-full pl-8 pr-2 py-2 text-xs bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-red-500 transition-all relative transition-shadow duration-200" 
                                        />
                                        {isSearchingCustomer ? (
                                            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                        )}
                                        
                                        {/* Autocomplete Dropdown */}
                                        {showResults && searchResults.length > 0 && (
                                            <div className="absolute z-[100] left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 max-h-60 overflow-y-auto ring-1 ring-black/5 animate-fade-in">
                                                {searchResults.map(customer => (
                                                    <button
                                                        key={customer.id}
                                                        onClick={() => selectReferencedCustomer(customer)}
                                                        className="w-full text-left px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors border-b border-gray-50 dark:border-gray-700 last:border-0"
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <span className="font-bold text-gray-800 dark:text-gray-200 text-xs">{customer.name}</span>
                                                            <span className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-500 font-mono">{customer.phone}</span>
                                                        </div>
                                                        <div className="text-[10px] text-gray-400 truncate mt-0.5">
                                                            {customer.address}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <input placeholder="Nome" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full px-3 py-2 text-xs bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl outline-none" />
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">R$</span>
                                        <input type="number" placeholder="Taxa" value={deliveryFee} onChange={e => setDeliveryFee(parseFloat(e.target.value) || 0)} className="w-full pl-8 pr-2 py-2 text-xs bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl outline-none" />
                                    </div>
                                </div>
                                <input placeholder="Rua / Endereço" value={addressDetails.street} onChange={e => setAddressDetails(p => ({ ...p, street: e.target.value }))} className="w-full px-3 py-2 text-xs bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl outline-none" />
                                <div className="grid grid-cols-3 gap-2">
                                    <input placeholder="Nº" value={addressDetails.number} onChange={e => setAddressDetails(p => ({ ...p, number: e.target.value }))} className="col-span-1 px-3 py-2 text-xs bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl outline-none" />
                                    <input placeholder="Bairro" value={addressDetails.district} onChange={e => setAddressDetails(p => ({ ...p, district: e.target.value }))} className="col-span-2 px-3 py-2 text-xs bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl outline-none" />
                                </div>
                                <input placeholder="Complemento / Referência" value={addressDetails.reference} onChange={e => setAddressDetails(p => ({ ...p, reference: e.target.value }))} className="w-full px-3 py-2 text-xs bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl outline-none" />
                            </div>

                            <div className="space-y-3 pt-2">
                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Pagamento</h4>
                                <div className="flex gap-2">
                                    {(['Dinheiro', 'Cartão', 'PIX'] as PaymentMethod[]).map(method => (
                                        <button 
                                            key={method} 
                                            onClick={() => setPaymentMethod(method)} 
                                            className={`flex-1 py-2 text-[10px] font-black rounded-xl border-2 transition-all uppercase
                                                ${paymentMethod === method 
                                                    ? 'bg-green-600 text-white border-green-600 shadow-md shadow-green-500/20' 
                                                    : 'bg-white dark:bg-gray-800 text-gray-400 border-gray-100 dark:border-gray-700 hover:border-green-200'}`}
                                        >
                                            {method}
                                        </button>
                                    ))}
                                </div>
                                {paymentMethod === 'Dinheiro' && (
                                    <div className="flex items-center gap-2 p-1 bg-green-50/30 dark:bg-green-900/10 rounded-xl border border-green-100/50 dark:border-green-900/20">
                                        <span className="text-[10px] font-black text-green-700 dark:text-green-500 ml-2 uppercase">Troco: R$</span>
                                        <input type="number" placeholder="Ex: 50.00" value={changeFor} onChange={e => setChangeFor(e.target.value)} className="flex-1 px-3 py-2 text-xs bg-transparent border-none outline-none font-bold" />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700 space-y-3">
                    <div className="flex justify-between items-end">
                        <div className="space-y-0.5">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] block leading-none">TOTAL DO PEDIDO</span>
                            <span className="text-3xl font-black text-primary tracking-tighter block leading-none mt-1">R$ {Number(total).toFixed(2)}</span>
                        </div>
                        <div className="text-right">
                             <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 rounded-full">
                                <ShoppingBag size={12} className="text-primary" strokeWidth={3} />
                                <span className="text-[10px] font-black text-primary uppercase">{cart.length} ITENS</span>
                             </div>
                        </div>
                    </div>
                    
                    <button 
                        onClick={handleFinalize} 
                        disabled={cart.length === 0 || isProcessing || (orderType === 'Balcão' && !selectedTable)} 
                        className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl flex items-center justify-center gap-3 active:scale-[0.98]
                            ${cart.length === 0 || isProcessing || (orderType === 'Balcão' && !selectedTable)
                                ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed shadow-none' 
                                : 'bg-green-600 hover:bg-green-700 text-white shadow-green-600/20'}`}
                    >
                        {isProcessing ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        ) : (
                            <>
                                <span>{currentOrderId ? 'Atualizar Pedido' : 'Finalizar Pedido'}</span>
                                <Plus size={18} strokeWidth={3} />
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* MODALS REMAINS FOR CUSTOM ITEM AND ADDONS AS THEY ARE STILL NECESSARY */}
            {isTableModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setIsTableModalOpen(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold">Selecionar Mesa</h3>
                            <button onClick={() => setIsTableModalOpen(false)}><X /></button>
                        </div>
                        <div className="grid grid-cols-5 gap-3">
                            {Array.from({ length: 30 }, (_, i) => i + 1).map(num => {
                                const status = tableStatuses[num];
                                const isSelected = selectedTable === num.toString().padStart(2, '0');
                                let statusColor = isSelected ? 'border-primary bg-primary/10 text-primary' : (status ? 'border-red-500 bg-red-100 text-red-700' : 'border-green-200 bg-green-50 text-green-700');
                                return <button key={num} onClick={() => handleSelectTable(num.toString().padStart(2, '0'))} className={`p-3 rounded-lg font-bold text-lg border-2 transition-all ${statusColor}`}>{num.toString().padStart(2, '0')}</button>;
                            })}
                        </div>
                    </div>
                </div>
            )}

            {isCustomItemModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setIsCustomItemModalOpen(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold mb-4">Item Avulso</h3>
                        <div className="space-y-3">
                            <input type="text" value={customItemName} onChange={e => setCustomItemName(e.target.value)} className="w-full p-2 border rounded-lg dark:bg-gray-700" placeholder="Nome" />
                            <input type="number" value={customItemPrice} onChange={e => setCustomItemPrice(e.target.value)} className="w-full p-2 border rounded-lg dark:bg-gray-700" placeholder="0.00" />
                            <div className="flex gap-2 mt-4">
                                <button onClick={() => setIsCustomItemModalOpen(false)} className="flex-1 py-2 border rounded-lg">Cancelar</button>
                                <button onClick={handleAddCustomItem} className="flex-1 py-2 bg-primary text-white rounded-lg font-bold">Adicionar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isAddonModalOpen && editingCartItem && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setIsAddonModalOpen(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full shadow-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold">Adicionais: {editingCartItem.name}</h3>
                            <button onClick={() => setIsAddonModalOpen(false)}><X /></button>
                        </div>
                        <div className="space-y-2">
                            {addons.filter(addon => {
                                const originalItem = menuItems.find(i => i.id === editingCartItem.id);
                                if (originalItem && originalItem.selectedAddons?.length) return originalItem.selectedAddons.some(a => a.id === addon.id);
                                return addon.categoryId === editingCartItem.categoryId;
                            }).map(addon => {
                                const isSelected = editingCartItem.selectedAddons.some(a => a.id === addon.id);
                                return (
                                    <button key={addon.id} onClick={() => handleAddAddon(addon)} className={`w-full flex justify-between items-center p-3 rounded-lg border ${isSelected ? 'border-primary bg-primary/10' : 'border-gray-200 dark:border-gray-700'}`}>
                                        <span className="font-medium">{addon.name}</span>
                                        <span className="text-sm font-bold">+ R$ {addon.price.toFixed(2)}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <button onClick={() => setIsAddonModalOpen(false)} className="w-full mt-4 py-2 bg-primary text-white rounded-lg font-bold">Concluir</button>
                    </div>
                </div>
            )}
        </div>
    );
});

export default CounterTab;
