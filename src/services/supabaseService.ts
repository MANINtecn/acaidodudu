import { createClient } from '@supabase/supabase-js';
import { Category, MenuItem, Addon, Order, Settings, Store, Customer, CashSession, CashTransaction, Promotion } from '../types';

import { storage } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Configuração via variáveis de ambiente (.env / .env.local).
// Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY quando o novo banco for criado.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

const supabaseUrlForClient = SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKeyForClient = SUPABASE_ANON_KEY || 'placeholder';


const electronStorage = {
    getItem: async (key: string) => {
        if (typeof window !== 'undefined' && (window as any).electron?.storage) {
            const val = await (window as any).electron.storage.getItem(key);
            return val;
        }
        return window.localStorage.getItem(key);
    },
    setItem: async (key: string, value: string) => {
        if (typeof window !== 'undefined' && (window as any).electron?.storage) {
            await (window as any).electron.storage.setItem(key, value);
        }
        window.localStorage.setItem(key, value); 
    },
    removeItem: async (key: string) => {
        if (typeof window !== 'undefined' && (window as any).electron?.storage) {
            await (window as any).electron.storage.removeItem(key);
        }
        window.localStorage.removeItem(key);
    }
};

export const supabase = createClient(supabaseUrlForClient, supabaseKeyForClient, {
  auth: {
    storage: electronStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  }
});

export const ORDER_COLUMNS = 'id, timestamp, daily_order_number, customer_name, phone, address, reference_point, order_type, payment_method, status, change_for, items, total, store_id, printed, observation, table_number, comanda_number, discount, tax, rating, feedback, delivery_fee, combo_price, origin, is_loyalty_eligible, loyalty_redeemed_at, status_history, courier_id, courier_name';

// --- Mapping Helpers ---
export const mapMenuItemFromDB = (item: any, addons?: Addon[]): MenuItem => {
    const itemSpecificAddonIds = item.allowed_addons;
    const hydratedAddons = (itemSpecificAddonIds || [])
        .map((entry: any) => {
            const id = typeof entry === 'object' ? entry.id : entry;
            return addons?.find((a: any) => a.id === id);
        })
        .filter(Boolean);

    return {
        ...item,
        price: Number(item.price) || 0,
        categoryId: item.category_id || item.categoryId,
        isAvailable: item.is_available ?? item.isAvailable ?? true,
        eligibleForCombo: item.eligible_for_combo ?? item.eligibleForCombo ?? false,
        isCombo: item.is_combo ?? item.isCombo ?? false,
        allowedAddons: itemSpecificAddonIds,
        selectedAddons: hydratedAddons,
        addons: (itemSpecificAddonIds === null)
            ? (addons?.filter((a: any) => a.categoryId === (item.category_id || item.categoryId)) || [])
            : []
    };
};

export const mapMenuItemToDB = (item: Partial<MenuItem>) => {
    const { 
        id, categoryId, isAvailable, eligibleForCombo, isCombo, 
        selectedAddons, allowedAddons, addons, ...rest 
    } = item as any;

    const payload: any = { ...rest };
    if (categoryId !== undefined) payload.category_id = categoryId;
    if (isAvailable !== undefined) payload.is_available = isAvailable;
    if (eligibleForCombo !== undefined) payload.eligible_for_combo = eligibleForCombo;
    if (isCombo !== undefined) payload.is_combo = isCombo;
    if (selectedAddons !== undefined) payload.selected_addons = Array.isArray(selectedAddons) ? selectedAddons.map((a: any) => a.id) : selectedAddons;
    if (allowedAddons !== undefined) payload.allowed_addons = allowedAddons;

    // Remove any remaining camelCase or virtual fields that might be in rest
    delete payload.categoryId;
    delete payload.isAvailable;
    delete payload.eligibleForCombo;
    delete payload.isCombo;
    delete payload.isSelected;
    
    return payload;
};

// --- Promotion Mapping Helpers ---
export const mapPromotionFromDB = (data: any): Promotion => {
    return {
        ...data,
        price: Number(data.price) || 0,
        isActive: data.isActive ?? data.is_active ?? true,
        daysOfWeek: data.days_of_week || data.daysOfWeek
    };
};

export const mapPromotionToDB = (promo: Partial<Promotion>) => {
    const { isActive, daysOfWeek, ...rest } = promo as any;
    const payload: any = { ...rest };
    
    if (isActive !== undefined) payload.is_active = isActive;
    if (daysOfWeek !== undefined) payload.days_of_week = daysOfWeek;
    
    delete payload.isActive;
    delete payload.daysOfWeek;
    
    return payload;
};


export const mapAddonFromDB = (addon: any): Addon => {
    return {
        ...addon,
        price: Number(addon.price) || 0,
        categoryId: addon.category_id || addon.categoryId,
        isAvailable: addon.is_available ?? addon.isAvailable ?? true
    };
};

export const mapAddonToDB = (addon: Partial<Addon>) => {
    const { id, categoryId, isAvailable, isSelected, daysOfWeek, ...rest } = addon as any;
    const payload: any = { ...rest };
    if (categoryId !== undefined) payload.category_id = categoryId;
    if (isAvailable !== undefined) payload.is_available = isAvailable;
    if (daysOfWeek !== undefined) payload.days_of_week = daysOfWeek;
    
    delete payload.categoryId;
    delete payload.isAvailable;
    delete payload.isSelected;
    delete payload.daysOfWeek;
    
    return payload;
};

// --- Menu Management Functions ---
export const fetchMenuForCustomer = async (storeId: string) => {
    // Change sort to ID to respect insertion order (New categories go to end)
    const { data: categories, error: catError } = await supabase.from('categories').select('*').eq('store_id', storeId).order('id', { ascending: true });
    if (catError) throw catError;

    const { data: menuItems, error: itemError } = await supabase.from('menu_items').select('*').eq('store_id', storeId).order('name');
    if (itemError) throw itemError;

    const { data: addonsRaw, error: addonError } = await supabase.from('addons').select('*').eq('store_id', storeId).order('name');
    if (addonError) throw addonError;

    const addons = (addonsRaw || []).map(mapAddonFromDB);
    const mappedItems = (menuItems || []).map((item: any) => mapMenuItemFromDB(item, addons));

    return { categories, menuItems: mappedItems, addons };
};

export const fetchMenuForAdmin = async (storeId: string) => {
    // Change sort to ID to respect insertion order
    const { data: categories, error: catError } = await supabase.from('categories').select('*').eq('store_id', storeId).order('id', { ascending: true });
    if (catError) throw catError;

    const { data: menuItems, error: itemError } = await supabase.from('menu_items').select('*').eq('store_id', storeId).order('name');
    if (itemError) throw itemError;

    const { data: addonsRaw, error: addonError } = await supabase.from('addons').select('*').eq('store_id', storeId).order('name');
    if (addonError) throw addonError;

    const addons = (addonsRaw || []).map(mapAddonFromDB);
    const mappedItems = (menuItems || []).map((item: any) => mapMenuItemFromDB(item, addons));

    return { categories, menuItems: mappedItems, addons };
};

// --- Category Management ---
export const createCategory = async (category: Omit<Category, 'id'>) => {
    const { data, error } = await supabase.from('categories').insert(category).select().single();
    if (error) throw error;
    return data;
};

export const updateCategory = async (id: number, updates: Partial<Category>) => {
    const { data, error } = await supabase.from('categories').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
};

export const deleteCategory = async (id: number) => {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) throw error;
};

// --- Menu Item Management ---
export const createMenuItem = async (item: Omit<MenuItem, 'id'>) => {
    const payload = mapMenuItemToDB(item);
    const { data, error } = await supabase.from('menu_items').insert(payload).select();
    if (error) throw error;
    const createdItem = data?.[0];
    if (!createdItem) throw new Error("Falha ao criar item: Nenhum dado retornado.");
    return mapMenuItemFromDB(createdItem);
};

export const updateMenuItem = async (id: number, updates: Partial<MenuItem>) => {
    const payload = mapMenuItemToDB(updates);
    const { data, error } = await supabase.from('menu_items').update(payload).eq('id', id).select();
    if (error) throw error;

    const updatedItem = data?.[0];
    if (!updatedItem) throw new Error("Item not found or update failed");

    return mapMenuItemFromDB(updatedItem);
};

export const deleteMenuItem = async (id: number) => {
    const { error } = await supabase.from('menu_items').delete().eq('id', id);
    if (error) throw error;
};

// --- Addon Management ---
// --- Addon Management ---
export const createAddon = async (addon: Omit<Addon, 'id'>) => {
    const payload = mapAddonToDB(addon);
    const { data, error } = await supabase.from('addons').insert(payload).select().single();
    if (error) throw error;
    return mapAddonFromDB(data);
};

export const updateAddon = async (id: string | number, updates: Partial<Addon>) => {
    const payload = mapAddonToDB(updates);
    const { data, error } = await supabase.from('addons').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return mapAddonFromDB(data);
};

export const deleteAddon = async (id: string | number) => {
    const { error } = await supabase.from('addons').delete().eq('id', id);
    if (error) throw error;
};

// --- Order Mapping Helpers ---
export const mapOrderToDB = (order: any) => {
    const dbOrder: any = {
        id: order.id,
        timestamp: order.timestamp || new Date().toISOString(),
        daily_order_number: order.dailyOrderNumber !== undefined ? order.dailyOrderNumber : order.daily_order_number,
        customer_name: order.customerName,
        phone: order.phone,
        address: order.address,
        reference_point: order.referencePoint,
        order_type: order.orderType,
        payment_method: order.paymentMethod,
        status: order.status,
        change_for: order.changeFor,
        items: order.items,
        total: order.total,
        store_id: order.store_id,
        printed: order.printed !== undefined ? order.printed : false,
        observation: order.observation,
        table_number: order.table_number,
        comanda_number: order.comandaNumber,
        discount: order.discount,
        tax: order.tax,
        rating: order.rating,
        feedback: order.feedback,
        delivery_fee: order.deliveryFee,
        combo_price: order.comboPrice,
        origin: order.origin,
        status_history: order.statusHistory,
        courier_id: (order.courier_id || order.courierId) || undefined,
        courier_name: (order.courier_name || order.courierName) || undefined,
        is_loyalty_eligible: order.total !== undefined ? (order.total + (order.discount || 0)) >= 35.00 : undefined
    };

    // Remove undefined or null fields
    Object.keys(dbOrder).forEach(key => {
        if (dbOrder[key] === undefined || dbOrder[key] === null) delete dbOrder[key];
    });

    // Fix: Remove empty phone string to allow database to handle it as NULL
    if (dbOrder.phone === '') {
        delete dbOrder.phone;
    }

    return dbOrder;
};

export const mapOrderFromDB = (dbOrder: any): Order => {
    return {
        id: dbOrder.id,
        timestamp: dbOrder.timestamp || new Date().toISOString(),
        dailyOrderNumber: dbOrder.daily_order_number || dbOrder.dailyOrderNumber,
        customerName: dbOrder.customer_name || dbOrder.customerName,
        phone: dbOrder.phone,
        address: dbOrder.address,
        referencePoint: dbOrder.reference_point || dbOrder.referencePoint,
        orderType: dbOrder.order_type || dbOrder.orderType,
        paymentMethod: dbOrder.payment_method || dbOrder.paymentMethod,
        status: dbOrder.status,
        changeFor: dbOrder.change_for || dbOrder.changeFor,
        items: (dbOrder.items || []).map((item: any) => ({
            ...item,
            // Ensure price is a number and handle different potential field names
            price: Number(item.price || item.unitPrice || item.unit_price) || 0,
            selectedAddons: (item.selectedAddons || item.addons || []).map((addon: any) => ({
                ...addon,
                price: Number(addon.price || addon.unitPrice || addon.unit_price) || 0
            }))
        })),
        total: Number(dbOrder.total) || 0,
        store_id: dbOrder.store_id || dbOrder.storeId,
        printed: dbOrder.printed,
        observation: dbOrder.observation,
        table_number: dbOrder.table_number || dbOrder.tableNumber,
        comandaNumber: dbOrder.comanda_number || dbOrder.comandaNumber,
        discount: Number(dbOrder.discount) || 0,
        tax: Number(dbOrder.tax) || 0,
        rating: dbOrder.rating ? Number(dbOrder.rating) : undefined,
        feedback: dbOrder.feedback,

        deliveryFee: Number(dbOrder.delivery_fee || dbOrder.deliveryFee) || 0,
        comboPrice: Number(dbOrder.combo_price || dbOrder.comboPrice || 13) || 13,
        origin: dbOrder.origin,
        statusHistory: dbOrder.status_history || dbOrder.statusHistory,
        courier_id: dbOrder.courier_id,
        courier_name: dbOrder.courier_name
    };
};

// --- Order Management ---
export const fetchActiveOrders = async (storeId: string) => {
    const { data, error } = await supabase
        .from('orders')
        .select(ORDER_COLUMNS)
        .eq('store_id', storeId)
        .in('status', ['Novo', 'Em Produção', 'A Caminho', 'Conta Solicitada', 'No Portão'])
        .order('timestamp', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapOrderFromDB);
};

export const fetchOrderHistory = async (storeId: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
        .from('orders')
        .select(ORDER_COLUMNS)
        .eq('store_id', storeId)
        .in('status', ['Entregue', 'Cancelado'])
        .gte('timestamp', today.toISOString())
        .order('timestamp', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapOrderFromDB);
};

export const updateOrderStatus = async (orderId: string, status: Order['status']) => {
    // 1. Fetch current history to append properly (avoiding overwrite if possible, though strict atomic append needs RPC or complex query)
    const { data: currentOrder } = await supabase
        .from('orders')
        .select('status_history')
        .eq('id', orderId)
        .single();
    
    let updatedHistory: any[] = [];
    if (currentOrder && currentOrder.status_history && Array.isArray(currentOrder.status_history)) {
        updatedHistory = [...currentOrder.status_history];
    }
    
    // Append new status
    updatedHistory.push({
        status: status,
        timestamp: new Date().toISOString()
    });

    const { data, error } = await supabase
        .from('orders')
        .update({ status, status_history: updatedHistory })
        .eq('id', orderId)
        .select(ORDER_COLUMNS);
    if (error) throw error;
    return data ? data.map(mapOrderFromDB) : [];
};


export const markOrderItemsAsPrinted = async (orderId: string, cartIds?: string[]) => {
    // 1. Fetch current items to be safe and merge
    const { data: order } = await supabase.from('orders').select('items').eq('id', orderId).single();
    if (!order) return;

    const updatedItems = (order.items || []).map((item: any) => {
        if (cartIds) {
            return cartIds.includes(item.cartId) ? { ...item, printed: true } : item;
        }
        return { ...item, printed: true };
    });

    const allPrinted = updatedItems.every((i: any) => i.printed);

    const { error } = await supabase
        .from('orders')
        .update({ items: updatedItems, printed: allPrinted })
        .eq('id', orderId);

    if (error) throw error;
};

// Atomic Lock: Only updates if printed is FALSE. Returns true if successful.
export const claimOrderPrinting = async (orderId: string): Promise<boolean> => {
    const { data, error } = await supabase
        .from('orders')
        .update({ printed: true })
        .eq('id', orderId)
        .or('printed.eq.false,printed.is.null') // Atomic check supporting NULL
        .select(ORDER_COLUMNS);

    if (error) {
        console.error("Error claiming print lock:", error);
        return false;
    }
    // If data is returned, we successfully updated the row. If empty, it was already true.
    return !!data && data.length > 0;
};


export const getNextDailyOrderNumber = async (storeId: string): Promise<number> => {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
        .from('orders')
        .select('daily_order_number')
        .eq('store_id', storeId)
        .gte('timestamp', `${today}T00:00:00`)
        .lte('timestamp', `${today}T23:59:59`)
        .order('daily_order_number', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('Error fetching next order number:', error);
        return Math.floor(Math.random() * 1000); // Fallback
    }

    return (data?.daily_order_number || 0) + 1;
};

export const createOrder = async (order: any) => {
    const dbOrder = mapOrderToDB(order);
    
    // Initialize status history for new orders if not present
    if (!dbOrder.status_history) {
        dbOrder.status_history = [{ 
            status: order.status || 'Novo', 
            timestamp: new Date().toISOString() 
        }];
    }

    const { data, error } = await supabase
        .from('orders')
        .insert(dbOrder)
        .select(ORDER_COLUMNS)
        .single();
    if (error) throw error;

    const frontendOrder = mapOrderFromDB(data);

    // Trigger Webhook for New Order (Non-blocking)
    if (order.store_id) {
        fetchPublicSettings(order.store_id).then(settings => {
            if (settings.webhookNewOrderUrl) {
                triggerWebhook(settings.webhookNewOrderUrl, {
                    ...frontendOrder,
                    customer_phone: frontendOrder.phone,
                    phone: frontendOrder.phone
                }).catch(e => console.error("Error triggering new order webhook:", e));
            }
        }).catch(e => console.error("Error fetching settings for webhook:", e));
    }

    return frontendOrder;
};

export const updateOrder = async (orderId: string, updates: any) => {
    const dbUpdates = mapOrderToDB(updates);
    const { data, error } = await supabase
        .from('orders')
        .update(dbUpdates)
        .eq('id', orderId)
        .select(ORDER_COLUMNS);
    if (error) throw error;
    return data ? data.map(mapOrderFromDB) : [];
};

export const deleteOrder = async (orderId: string) => {
    const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);
    if (error) throw error;
    return true;
};

export const rateOrder = async (orderId: string, rating: number, feedback?: string) => {
    const { data, error } = await supabase
        .from('orders')
        .update({ rating, feedback })
        .eq('id', orderId)
        .select()
        .single();
    if (error) throw error;
    return data;
};

export const fetchCustomerByPhone = async (phone: string, storeId: string): Promise<Customer | null> => {
    let sanitizedPhone = phone.replace(/\D/g, '');
    if (sanitizedPhone.startsWith('55') && sanitizedPhone.length > 11) {
        sanitizedPhone = sanitizedPhone.substring(2);
    }
    const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', sanitizedPhone)
        .eq('store_id', storeId)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error fetching customer:', error);
        return null;
    }
    return data;
};

export const searchCustomers = async (query: string, storeId: string): Promise<Customer[]> => {
    // Sanitization for phone search part
    const sanitizedQuery = query.replace(/\D/g, '');
    
    let queryBuilder = supabase
        .from('customers')
        .select('*')
        .eq('store_id', storeId)
        .limit(10);

    // If query looks like a phone number (mostly digits)
    if (sanitizedQuery.length > 3) {
        // Try to match phone OR name
        queryBuilder = queryBuilder.or(`phone.ilike.%${sanitizedQuery}%,name.ilike.%${query}%`);
    } else {
        // Mostly text -> match name OR phone raw (in case of small digits)
        queryBuilder = queryBuilder.or(`name.ilike.%${query}%,phone.ilike.%${query}%`);
    }

    const { data, error } = await queryBuilder;

    if (error) {
        console.error('Error searching customers:', error);
        return [];
    }
    return data || [];
};

export const fetchLastOrderByPhone = async (phone: string, storeId: string): Promise<Order | null> => {
    let sanitizedPhone = phone.replace(/\D/g, '');
    if (sanitizedPhone.startsWith('55') && sanitizedPhone.length > 11) {
        sanitizedPhone = sanitizedPhone.substring(2);
    }
    const { data, error } = await supabase
        .from('orders')
        .select(ORDER_COLUMNS)
        .ilike('phone', `%${sanitizedPhone}`)
        .eq('store_id', storeId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error fetching last order:', error);
        return null;
    }
    return data ? mapOrderFromDB(data) : null;
};

// --- Settings Functions ---
export const uploadLogoToStorage = async (storeId: string, file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `logo_${Date.now()}.${fileExt}`;
    const filePath = `${storeId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(filePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
        .from('assets')
        .getPublicUrl(filePath);

    return data.publicUrl;
};

const defaultSettings: Omit<Settings, 'id' | 'store_id'> = {
    openingTime: '18:00',
    closingTime: '23:59',
    manualStatus: 'auto',
    comboPrice: 13.00,
    webhookNewOrderUrl: '',
    webhookInProductionUrl: '',
    webhookOutForDeliveryUrl: '',
    webhookArrivedAtDoorUrl: '',
    isAppDiscountEnabled: false,
    appDiscountPercentage: 0,
    logoUrl: '',
    storefrontTheme: 'classic',
    modernGroups: [
        { id: 1, name: 'AÇAÍ', image: '', categories: [] },
        { id: 2, name: 'PORÇÕES', image: '', categories: [] },
        { id: 3, name: 'BEBIDAS', image: '', categories: [] }
    ],
    isRaffleEnabled: false,
    rafflePrizeValue: 0,
    raffleDrawDate: undefined,
    deliveryFee: 2.00,
    minOrderValue: 15.00,
    isBotEnabled: true,
    // Printer Defaults
    preferredPrinter: undefined,
    printerPaperWidth: '80mm',
    printerCompatibilityMode: false,
    kitchenPrinter: undefined,
    kitchenPrinterPaperWidth: '80mm',
    barPrinter: undefined,
    barPrinterPaperWidth: '80mm',
    courierPrinter: undefined,
    courierPrinterPaperWidth: '80mm',
    courier_access_code: undefined,
    defaultDDD: '81',
    daysOfWeek: ['0', '1', '2', '3', '4', '5', '6'], // All days by default
    isRatingEnabled: true
};


const mapSettingsDBToApp = (dbData: any, storeData?: any): Settings => {
    const fullData = {
        ...defaultSettings,
        ...(dbData || {}),
        logoUrl: storeData?.logo_url || dbData?.logo_url || dbData?.logoUrl
    };

    return {
        ...fullData,
        // Map snake_case or camelCase DB columns to camelCase app properties
        storefrontTheme: dbData?.storefront_theme ?? dbData?.storefrontTheme ?? defaultSettings.storefrontTheme,
        modernGroups: dbData?.modern_groups ?? dbData?.modernGroups ?? defaultSettings.modernGroups,
        openingTime: dbData?.opening_time ?? dbData?.openingTime ?? defaultSettings.openingTime,
        closingTime: dbData?.closing_time ?? dbData?.closingTime ?? defaultSettings.closingTime,
        manualStatus: dbData?.manual_status ?? dbData?.manualStatus ?? defaultSettings.manualStatus,
        comboPrice: Number(dbData?.combo_price ?? dbData?.comboPrice ?? defaultSettings.comboPrice) || 13.0,
        deliveryFee: Number(dbData?.delivery_fee ?? dbData?.deliveryFee ?? defaultSettings.deliveryFee) || 0,
        minOrderValue: Number(dbData?.min_order_value ?? dbData?.minOrderValue ?? defaultSettings.minOrderValue) || 15.0,
        
        isRaffleEnabled: dbData?.is_raffle_enabled ?? dbData?.isRaffleEnabled ?? defaultSettings.isRaffleEnabled,
        raffleDrawDate: dbData?.raffle_draw_date ?? dbData?.raffleDrawDate ?? defaultSettings.raffleDrawDate,
        rafflePrizeValue: Number(dbData?.raffle_prize_value ?? dbData?.rafflePrizeValue ?? defaultSettings.rafflePrizeValue) || 0,
        lastRaffleWinner: dbData?.last_raffle_winner ?? dbData?.lastRaffleWinner ?? defaultSettings.lastRaffleWinner,
        isRatingEnabled: dbData?.is_rating_enabled ?? dbData?.isRatingEnabled ?? defaultSettings.isRatingEnabled,
        
        defaultDDD: dbData?.default_ddd ?? dbData?.defaultDDD ?? defaultSettings.defaultDDD,
        isBotEnabled: dbData?.is_bot_enabled ?? dbData?.isBotEnabled ?? defaultSettings.isBotEnabled,
        
        webhookNewOrderUrl: dbData?.webhook_new_order_url ?? dbData?.webhookNewOrderUrl ?? defaultSettings.webhookNewOrderUrl,
        webhookInProductionUrl: dbData?.webhook_in_production_url ?? dbData?.webhookInProductionUrl ?? defaultSettings.webhookInProductionUrl,
        webhookOutForDeliveryUrl: dbData?.webhook_out_for_delivery_url ?? dbData?.webhookOutForDeliveryUrl ?? defaultSettings.webhookOutForDeliveryUrl,
        webhookArrivedAtDoorUrl: dbData?.webhook_arrived_at_door_url ?? dbData?.webhookArrivedAtDoorUrl ?? defaultSettings.webhookArrivedAtDoorUrl,

        isAppDiscountEnabled: dbData?.is_app_discount_enabled ?? dbData?.isAppDiscountEnabled ?? defaultSettings.isAppDiscountEnabled,
        appDiscountPercentage: Number(dbData?.app_discount_percentage ?? dbData?.appDiscountPercentage ?? defaultSettings.appDiscountPercentage) || 0,

        printerCompatibilityMode: dbData?.printer_compatibility_mode ?? dbData?.printerCompatibilityMode ?? defaultSettings.printerCompatibilityMode,
        kitchenPrinter: dbData?.kitchen_printer ?? dbData?.kitchenPrinter ?? defaultSettings.kitchenPrinter,
        kitchenPrinterPaperWidth: dbData?.kitchen_printer_paper_width ?? dbData?.kitchenPrinterPaperWidth ?? defaultSettings.kitchenPrinterPaperWidth,
        barPrinter: dbData?.bar_printer ?? dbData?.barPrinter ?? defaultSettings.barPrinter,
        barPrinterPaperWidth: dbData?.bar_printer_paper_width ?? dbData?.barPrinterPaperWidth ?? defaultSettings.barPrinterPaperWidth,
        courierPrinter: dbData?.courier_printer ?? dbData?.courierPrinter ?? defaultSettings.courierPrinter,
        courierPrinterPaperWidth: dbData?.courier_printer_paper_width ?? dbData?.courierPrinterPaperWidth ?? defaultSettings.courierPrinterPaperWidth,
        preferredPrinter: dbData?.preferred_printer ?? dbData?.preferredPrinter ?? defaultSettings.preferredPrinter,
        printerPaperWidth: dbData?.printer_paper_width ?? dbData?.printerPaperWidth ?? defaultSettings.printerPaperWidth,
        courier_access_code: dbData?.courier_access_code ?? dbData?.courierAccessCode ?? defaultSettings.courier_access_code,
        bolaoStartTime: dbData?.bolao_start_time ?? dbData?.bolaoStartTime,
        bolaoEndTime: dbData?.bolao_end_time ?? dbData?.bolaoEndTime,
        
        daysOfWeek: (() => {
            const val = dbData?.days_of_week ?? dbData?.daysOfWeek ?? defaultSettings.daysOfWeek;
            if (typeof val === 'string') {
                try {
                    return JSON.parse(val);
                } catch (e) {
                    return val.split(',').map((s: string) => s.trim());
                }
            }
            return Array.isArray(val) ? val : defaultSettings.daysOfWeek;
        })()
    } as Settings;
};


export const fetchSettings = async (storeId: string): Promise<Settings> => {
    const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('store_id', storeId)
        .single();

    let settingsData = data;

    if (error && error.code === 'PGRST116') {
        const { logoUrl, ...settingsToInsert } = defaultSettings;
        const { data: newSettings, error: insertError } = await supabase
            .from('settings')
            .insert({ store_id: storeId, ...settingsToInsert })
            .select()
            .single();
        if (insertError) throw insertError;
        settingsData = newSettings;
    } else if (error) {
        throw error;
    }

    // Fetch logo from store
    const { data: storeData } = await supabase
        .from('stores')
        .select('logo_url')
        .eq('id', storeId)
        .single();

    const result = mapSettingsDBToApp(settingsData, storeData);
    // console.log('[fetchSettings] Result:', { 
    //     preferredPrinter: result.preferredPrinter, 
    //     printerPaperWidth: result.printerPaperWidth 
    // });
    return result;
};

export const fetchPublicSettings = async (storeId: string): Promise<Pick<Settings, 'modernGroups' | 'storefrontTheme' | 'openingTime' | 'closingTime' | 'manualStatus' | 'comboPrice' | 'webhookNewOrderUrl' | 'webhookInProductionUrl' | 'webhookOutForDeliveryUrl' | 'webhookArrivedAtDoorUrl' | 'isAppDiscountEnabled' | 'appDiscountPercentage' | 'logoUrl' | 'isRaffleEnabled' | 'rafflePrizeValue' | 'raffleDrawDate' | 'lastRaffleWinner' | 'isRatingEnabled' | 'deliveryFee' | 'courier_access_code' | 'defaultDDD' | 'isBotEnabled' | 'printerCompatibilityMode' | 'kitchenPrinter' | 'kitchenPrinterPaperWidth' | 'barPrinter' | 'barPrinterPaperWidth' | 'courierPrinter' | 'courierPrinterPaperWidth'>> => {
    const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('store_id', storeId)
        .single();

    if (error && error.code === 'PGRST116') {
        return defaultSettings as Settings;
    }
    if (error) throw error;

    // Fetch logo from store
    const { data: storeData } = await supabase
        .from('stores')
        .select('logo_url')
        .eq('id', storeId)
        .single();

    const result = mapSettingsDBToApp(data, storeData);
    return result as any; 
};

export const updateSettings = async (storeId: string, settings: Partial<Omit<Settings, 'id'>>) => {
    if (settings.logoUrl !== undefined) {
        await supabase.from('stores').update({ logo_url: settings.logoUrl }).eq('id', storeId);
    }

    const dbSettings: any = {};
    
    // Preparation: We will attempt to update both snake_case and camelCase
    // because the database schema currently has a mix of both.
    
    // Core fields
    if (settings.storefrontTheme !== undefined) {
        dbSettings.storefront_theme = settings.storefrontTheme;
    }
    if (settings.modernGroups !== undefined) {
        dbSettings.modern_groups = settings.modernGroups;
    }
    if (settings.openingTime !== undefined) {
        dbSettings.opening_time = settings.openingTime;
    }
    if (settings.closingTime !== undefined) {
        dbSettings.closing_time = settings.closingTime;
    }
    if (settings.manualStatus !== undefined) {
        dbSettings.manual_status = settings.manualStatus;
    }
    if (settings.comboPrice !== undefined) {
        dbSettings.combo_price = settings.comboPrice;
    }
    if (settings.deliveryFee !== undefined) {
        dbSettings.delivery_fee = settings.deliveryFee;
    }
    if (settings.minOrderValue !== undefined) {
        dbSettings.min_order_value = settings.minOrderValue;
        dbSettings.minOrderValue = settings.minOrderValue;
    }
    if (settings.daysOfWeek !== undefined) {
        dbSettings.days_of_week = settings.daysOfWeek;
    }
    
    // Webhooks
    if (settings.webhookNewOrderUrl !== undefined) {
        dbSettings.webhook_new_order_url = settings.webhookNewOrderUrl;
    }
    if (settings.webhookInProductionUrl !== undefined) {
        dbSettings.webhook_in_production_url = settings.webhookInProductionUrl;
    }
    if (settings.webhookOutForDeliveryUrl !== undefined) {
        dbSettings.webhook_out_for_delivery_url = settings.webhookOutForDeliveryUrl;
    }
    if (settings.webhookArrivedAtDoorUrl !== undefined) {
        dbSettings.webhook_arrived_at_door_url = settings.webhookArrivedAtDoorUrl;
    }

    // App/Fidelity
    if (settings.isAppDiscountEnabled !== undefined) {
        dbSettings.is_app_discount_enabled = settings.isAppDiscountEnabled;
    }
    if (settings.appDiscountPercentage !== undefined) {
        dbSettings.app_discount_percentage = settings.appDiscountPercentage;
    }
    if (settings.isRatingEnabled !== undefined) {
        dbSettings.is_rating_enabled = settings.isRatingEnabled;
    }
    if (settings.isBotEnabled !== undefined) {
        dbSettings.is_bot_enabled = settings.isBotEnabled;
    }
    if (settings.courier_access_code !== undefined) {
        dbSettings.courier_access_code = settings.courier_access_code;
    }

    // Raffle
    if (settings.isRaffleEnabled !== undefined) {
        dbSettings.is_raffle_enabled = settings.isRaffleEnabled;
    }
    if (settings.rafflePrizeValue !== undefined) {
        dbSettings.raffle_prize_value = settings.rafflePrizeValue;
    }
    if (settings.raffleDrawDate !== undefined) {
        dbSettings.raffle_draw_date = settings.raffleDrawDate;
    }
    if (settings.lastRaffleWinner !== undefined) {
        dbSettings.last_raffle_winner = settings.lastRaffleWinner;
    }
    if (settings.bolaoStartTime !== undefined) {
        dbSettings.bolao_start_time = settings.bolaoStartTime;
    }
    if (settings.bolaoEndTime !== undefined) {
        dbSettings.bolao_end_time = settings.bolaoEndTime;
    }

    // Printers
    const printerFields = [
        'kitchenPrinter', 'kitchenPrinterPaperWidth',
        'barPrinter', 'barPrinterPaperWidth',
        'courierPrinter', 'courierPrinterPaperWidth',
        'preferredPrinter', 'printerPaperWidth',
        'printerCompatibilityMode'
    ];

    printerFields.forEach(field => {
        if ((settings as any)[field] !== undefined) {
            const snakeKey = field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            const val = (settings as any)[field];
            dbSettings[snakeKey] = val === "" ? null : val;
        }
    });

    try {
        // Try to update with all fields. Supabase/PostgREST will error if ANY column is missing.
        const { data, error } = await supabase
            .from('settings')
            .update(dbSettings)
            .eq('store_id', storeId)
            .select();

        if (error) throw error;
        return mapSettingsDBToApp(data?.[0], { logo_url: settings.logoUrl });
    } catch (error: any) {
        console.warn('[updateSettings] Multi-field update failed. Retrying field by field...', error);
        
        // Fallback: update field by field. This ensures that only available columns are updated.
        // This is necessary because of the inconsistent schema (mix of snake_case and camelCase).
        for (const key of Object.keys(dbSettings)) {
            try {
                await supabase
                    .from('settings')
                    .update({ [key]: dbSettings[key] })
                    .eq('store_id', storeId);
            } catch (e) {
                // Silently skip columns that don't exist
            }
        }
        
        // Fetch the final state
        const { data: finalData } = await supabase
            .from('settings')
            .select('*')
            .eq('store_id', storeId)
            .single();
            
        return mapSettingsDBToApp(finalData, { logo_url: settings.logoUrl });
    }
};


export const triggerWebhook = async (url: string, payload: any) => {
    // console.log(`[triggerWebhook] Attempting to trigger webhook: ${url}`, payload);
    if (!url) {
        console.warn("[triggerWebhook] No URL provided, skipping.");
        return;
    }
    try {
        let finalUrl = url;
        const phone = payload.customer_phone || payload.phone;

        if (phone) {
            const separator = finalUrl.includes('?') ? '&' : '?';
            finalUrl = `${finalUrl}${separator}customer_phone=${encodeURIComponent(phone)}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        await fetch(finalUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            mode: 'no-cors',
            signal: controller.signal
        });
        clearTimeout(timeoutId);
    } catch (error: any) {
        if (error.name === 'AbortError') {
            console.warn(`[Webhook] Request to ${url} timed out or was aborted.`);
        } else {
            console.error('Error triggering webhook:', error);
        }
    }
};

// --- Waiter App Services ---

export const fetchOccupiedTables = async (storeId: string): Promise<number[]> => {
    // Fetches tables that have open orders
    const { data, error } = await supabase
        .from('orders')
        .select('table_number')
        .eq('store_id', storeId)
        .neq('status', 'Entregue')
        .neq('status', 'Cancelado')
        .not('table_number', 'is', null);

    if (error) {
        console.error('Error fetching occupied tables:', error);
        return [];
    }

    // Extract unique table numbers
    const tables = new Set(data?.map(o => Number(o.table_number)).filter(n => n > 0));
    return Array.from(tables);
};

// --- Financial & Promotion Services ---
export const fetchAllPromotions = async (storeId: string): Promise<Promotion[]> => {
    const { data, error } = await supabase
        .from('promotions')
        .select('*')
        .eq('store_id', storeId)
        .order('name');
    if (error) throw error;
    return (data || []).map(mapPromotionFromDB);
};

export const fetchActivePromotions = async (storeId: string): Promise<Promotion[]> => {
    const { data, error } = await supabase
        .from('promotions')
        .select('*')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('name');
    if (error) throw error;
    return (data || []).map(mapPromotionFromDB);
};

export const createPromotion = async (promotion: Omit<Promotion, 'id'>) => {
    const payload = mapPromotionToDB(promotion);
    const { data, error } = await supabase
        .from('promotions')
        .insert(payload)
        .select()
        .single();
    if (error) throw error;
    return mapPromotionFromDB(data);
};

export const updatePromotion = async (id: string | number, promotion: Partial<Omit<Promotion, 'id'>>) => {
    const payload = mapPromotionToDB(promotion);
    const { data, error } = await supabase
        .from('promotions')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return mapPromotionFromDB(data);
};

export const deletePromotion = async (id: string | number) => {
    const { data, error } = await supabase
        .from('promotions')
        .delete()
        .eq('id', id);
    if (error) throw error;
    return data;
};

// --- Cash Flow Functions ---

export const getOpenCashSession = async (storeId: string): Promise<CashSession | null> => {
    const { data, error } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('store_id', storeId)
        .eq('status', 'open')
        .limit(1)
        .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
};

export const createCashSession = async (storeId: string, openingFloat: number): Promise<CashSession> => {
    const { data, error } = await supabase
        .from('cash_sessions')
        .insert({ openingFloat, status: 'open', store_id: storeId })
        .select()
        .single();
    if (error) throw error;
    return data;
};

export const updateCashSession = async (id: string, updates: Partial<CashSession>): Promise<CashSession> => {
    const { data, error } = await supabase
        .from('cash_sessions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
};

export const createCashTransaction = async (transaction: Omit<CashTransaction, 'id' | 'timestamp'>): Promise<CashTransaction> => {
    const { data, error } = await supabase
        .from('cash_transactions')
        .insert(transaction)
        .select()
        .single();
    if (error) throw error;
    return data;
};

export const getCashTransactionsForSession = async (sessionId: string): Promise<CashTransaction[]> => {
    const { data, error } = await supabase
        .from('cash_transactions')
        .select('*')
        .eq('session_id', sessionId);

    if (error) throw error;
    return data as CashTransaction[];
};

export const fetchCashSessionsHistory = async (storeId: string) => {
    const { data, error } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('store_id', storeId)
        .eq('status', 'closed')
        .order('closingTime', { ascending: false })
        .limit(30); // Last 30 sessions
    if (error) throw error;
    return data as CashSession[];
};

export const fetchOrdersForSession = async (storeId: string, startTime: string, endTime?: string) => {
    let query = supabase
        .from('orders')
        .select('*')
        .eq('store_id', storeId)
        .gte('timestamp', startTime);

    if (endTime) {
        query = query.lte('timestamp', endTime);
    }

    const { data, error } = await query.order('timestamp', { ascending: true });

    if (error) throw error;
    return (data || []).map(mapOrderFromDB);
};

export const uploadMenuImage = async (file: File, storeId: string): Promise<string | null> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${storeId}/${Date.now()}.${fileExt}`;

    try {
        const storageRef = ref(storage, `menu-images/${fileName}`);
        // console.log('[uploadMenuImage] Starting upload to Firebase:', fileName);
        await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(storageRef);
        // console.log('[uploadMenuImage] Upload complete. New URL:', downloadUrl);
        return downloadUrl;
    } catch (uploadError) {
        console.error('Error uploading image to Firebase:', uploadError);
        throw uploadError;
    }
};

export const uploadStoreLogo = async (file: File, storeId: string): Promise<string | null> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${storeId}/logo-${Date.now()}.${fileExt}`;

    try {
        const storageRef = ref(storage, `menu-images/${fileName}`);
        // console.log('[uploadStoreLogo] Starting upload to Firebase:', fileName);
        await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(storageRef);
        // console.log('[uploadStoreLogo] Upload complete. New URL:', downloadUrl);
        return downloadUrl;
    } catch (uploadError) {
        console.error('Error uploading logo to Firebase:', uploadError);
        throw uploadError;
    }
};

export const fetchStoreBySlug = async (slug: string): Promise<Store | null> => {
    // console.log(`[supabaseService] fetchStoreBySlug called for slug: ${slug}`);
    const { data, error } = await supabase
        .from('stores')
        .select('*')
        .eq('slug', slug)
        .limit(1);

    if (error) {
        console.error("[supabaseService] Error fetching store by slug:", error);
        return null;
    }
    
    // console.log("[supabaseService] Supabase raw data:", data);
    return data && data.length > 0 ? (data[0] as Store) : null;
};

export const createStore = async (store: Omit<Store, 'id' | 'created_at'>) => {
    const { data, error } = await supabase
        .from('stores')
        .insert(store)
        .select()
        .single();
    if (error) throw error;
    return data;
};

export const fetchAllStores = async (): Promise<Store[]> => {
    const { data, error } = await supabase
        .from('stores')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data as Store[];
};

export const fetchOpenOrderForTable = async (storeId: string, tableNumber: number): Promise<Order | null> => {
    const { data, error } = await supabase
        .from('orders')
        .select(ORDER_COLUMNS)
        .eq('store_id', storeId)
        .eq('table_number', tableNumber)
        .neq('status', 'Entregue')
        .neq('status', 'Cancelado')
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error && error.code === 'PGRST116') return null;
    if (error) throw error;
    return data ? mapOrderFromDB(data) : null;
};

// --- NEW: Fetch ALL open orders for a table ---
export const fetchAllOpenOrdersForTable = async (storeId: string, tableNumber: number): Promise<Order[]> => {
    const { data, error } = await supabase
        .from('orders')
        .select(ORDER_COLUMNS)
        .eq('store_id', storeId)
        .eq('table_number', tableNumber)
        .neq('status', 'Entregue')
        .neq('status', 'Cancelado')
        .order('timestamp', { ascending: true });

    if (error) throw error;
    return (data || []).map(mapOrderFromDB);
};

// --- NEW: Batch update status for all table orders ---
export const batchUpdateTableOrders = async (storeId: string, tableNumber: number, updates: Partial<any>) => {
    const dbUpdates = mapOrderToDB(updates);
    const { data, error } = await supabase
        .from('orders')
        .update(dbUpdates)
        .eq('store_id', storeId)
        .eq('table_number', tableNumber)
        .neq('status', 'Entregue')
        .neq('status', 'Cancelado');

    if (error) throw error;
    return data;
};

export const updateStoreSubscription = async (storeId: string, updates: any) => {
    const { data, error } = await supabase
        .from('stores')
        .update(updates)
        .eq('id', storeId)
        .select()
        .single();
    if (error) throw error;
    return data;
};
export const getGlobalStats = async () => {
    const { data: stores, error } = await supabase
        .from('stores')
        .select('id, is_active, plan_value');

    if (error) throw error;

    const totalStores = stores?.length || 0;
    const activeStores = stores?.filter(s => s.is_active).length || 0;
    const mrr = stores?.reduce((acc, s) => acc + (s.plan_value || 0), 0) || 0;

    return { totalStores, activeStores, mrr };
};

export const fetchSalesByDateRange = async (storeId: string, startDate: string, endDate: string) => {
    // Treat inputs as Local Date Components to respect browser's timezone selection
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59.999');

    const { data, error } = await supabase
        .from('orders')
        .select(ORDER_COLUMNS)
        .eq('store_id', storeId)
        .neq('status', 'Cancelado') // Include everything except Cancelled (User request: count pending/delivering too)
        .gte('timestamp', start.toISOString())
        .lte('timestamp', end.toISOString())
        .order('timestamp', { ascending: false });

    if (error) throw error;
    return (data || []).map((dbOrder: any) => mapOrderFromDB(dbOrder));
};

export const deleteOrdersByDateRange = async (storeId: string, startDate: string, endDate: string) => {
    // Treat inputs as Local Date Components
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59.999');

    const { error } = await supabase
        .from('orders')
        .delete()
        .eq('store_id', storeId)
        .gte('timestamp', start.toISOString())
        .lte('timestamp', end.toISOString());

    if (error) throw error;
};

export const fetchEligibleCustomersForRaffle = async (storeId: string, startDate: string, endDate: string) => {
    // Treat inputs as Local Date Components
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59.999');

    // Fetch orders in range that are delivered
    const { data: orders, error } = await supabase
        .from('orders')
        .select('customer_name, phone')
        .eq('store_id', storeId)
        .eq('status', 'Entregue')
        .gte('timestamp', start.toISOString())
        .lte('timestamp', end.toISOString());

    if (error) throw error;

    // Deduplicate by phone
    const uniqueCustomers = new Map();
    orders?.forEach((order: any) => {
        if (order.phone && !uniqueCustomers.has(order.phone)) {
            uniqueCustomers.set(order.phone, {
                name: order.customer_name,
                phone: order.phone
            });
        }
    });

    return Array.from(uniqueCustomers.values());
};

export const upsertCustomer = async (customerData: Partial<Customer>) => {
    // Sanitize phone if present
    const payload = { ...customerData };
    if (payload.phone) {
        payload.phone = payload.phone.replace(/\D/g, '');
    }

    // Ensure store_id is present
    if (!payload.store_id || !payload.phone) {
        console.warn("upsertCustomer: Missing store_id or phone", payload);
        return null;
    }

    const { data, error } = await supabase
        .from('customers')
        .upsert(payload, { onConflict: 'phone, store_id' })
        .select()
        .single();

    if (error) {
        console.error('Error upserting customer:', error);
        return null;
    }
    return data;
};

// --- Loyalty Program Services ---

export const fetchCustomerLoyaltyHistory = async (phone: string, storeId: string) => {
    const sanitizedPhone = phone.replace(/\D/g, ''); // Ensure numbers only
    const { data, error } = await supabase
        .from('orders')
        .select(ORDER_COLUMNS)
        .eq('store_id', storeId)
        .ilike('phone', `%${sanitizedPhone}`)
        .in('is_loyalty_eligible', [true, 'true'])
        .in('origin', ['WEB', 'APP']) // Only count orders from the App (or old app)
        .neq('status', 'Cancelado') 
        .is('loyalty_redeemed_at', null) // Only unredeemed orders

        .order('timestamp', { ascending: true }); // Oldest first (FIFO for redemption)

    if (error) throw error;
    return (data || []).map((dbOrder: any) => mapOrderFromDB(dbOrder));
};

export const redeemLoyaltyReward = async (phone: string, storeId: string) => {
    const sanitizedPhone = phone.replace(/\D/g, '');

    // 1. Fetch oldest 10 unredeemed eligible orders
    const { data: eligibleOrders, error: fetchError } = await supabase
        .from('orders')
        .select('id')
        .eq('store_id', storeId)
        .ilike('phone', `%${sanitizedPhone}`)
        .in('is_loyalty_eligible', [true, 'true'])
        .eq('status', 'Entregue')
        .is('loyalty_redeemed_at', null)
        .order('timestamp', { ascending: true })
        .limit(10);

    if (fetchError) throw fetchError;

    if (!eligibleOrders || eligibleOrders.length < 10) {
        throw new Error("Saldo insuficiente de selos para resgate (mínimo 10).");
    }

    const orderIdsToRedeem = eligibleOrders.map(o => o.id);

    // 2. Mark them as redeemed
    const { error: updateError, count } = await supabase
        .from('orders')
        .update({ loyalty_redeemed_at: new Date().toISOString() })
        .in('id', orderIdsToRedeem)
        .select('*');

    if (updateError) {
        console.error("Error redeeming loyalty orders:", updateError);
        throw new Error("Falha ao registrar resgate de fidelidade. Tente novamente.");
    }

    if (count !== orderIdsToRedeem.length) {
        console.warn(`Loyalty redemption partial mismatch. Expected ${orderIdsToRedeem.length}, updated ${count}`);
        // We technically suceeded partially, but this is rare.
    }

    return true;
};

// --- Courier Module Services ---

export const verifyCourierLogin = async (phone: string, password: string, storeId: string) => {
    const sanitizedPhone = phone.replace(/\D/g, '');
    const { data, error } = await supabase
        .from('couriers')
        .select('*')
        .eq('store_id', storeId)
        .eq('phone', sanitizedPhone)
        .eq('password', password)
        .eq('is_active', true)
        .single();
    
    if (error) return null;
    return data;
};

export const registerCourier = async (name: string, phone: string, password: string, storeId: string) => {
    const sanitizedPhone = phone.replace(/\D/g, '');
    
    const { data: existing } = await supabase
        .from('couriers')
        .select('id')
        .eq('store_id', storeId)
        .eq('phone', sanitizedPhone)
        .single();
        
    if (existing) throw new Error('Telefone já cadastrado para este estabelecimento.');

    const { data, error } = await supabase
        .from('couriers')
        .insert({
            store_id: storeId,
            name,
            phone: sanitizedPhone,
            password,
            is_active: true
        })
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const fetchCouriers = async (storeId: string) => {
    const { data, error } = await supabase
        .from('couriers')
        .select('*')
        .eq('store_id', storeId)
        .order('name');
    
    if (error) throw error;
    return data || [];
};

export const updateCourier = async (id: string, updates: Partial<any>) => {
    const { data, error } = await supabase
        .from('couriers')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    
    if (error) throw error;
    return data;
};

export const fetchCourierHistoryByRange = async (courierId: string, startDate: Date, endDate: Date) => {
    // Adjust dates for full day coverage if needed, but assuming caller handles it or we use exact timestamps
    const { data, error } = await supabase
        .from('orders')
        .select(ORDER_COLUMNS)
        .eq('courier_id', courierId)
        .eq('status', 'Entregue')
        .gte('timestamp', startDate.toISOString())
        .lte('timestamp', endDate.toISOString())
        .order('timestamp', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapOrderFromDB);
};

export const fetchOrderById = async (orderId: string): Promise<Order | null> => {
    const { data, error } = await supabase
        .from('orders')
        .select(ORDER_COLUMNS)
        .eq('id', orderId)
        .single();

    if (error) {
        console.error(`Error fetching order ${orderId}:`, error);
        return null;
    }
    return data ? mapOrderFromDB(data) : null;
};

export const fetchReadyOrdersForCourier = async (storeId: string) => {
    const { data, error } = await supabase
        .from('orders')
        .select(ORDER_COLUMNS)
        .eq('store_id', storeId)
        .eq('order_type', 'Entrega')
        .in('status', ['Em Produção', 'Novo']) 
        .is('courier_id', null)
        .order('timestamp', { ascending: true });

    if (error) throw error;
    return (data || []).map((o: any) => mapOrderFromDB(o));
};

export const fetchCourierActiveDeliveries = async (courierId: string) => {
    const { data, error } = await supabase
        .from('orders')
        .select(ORDER_COLUMNS)
        .eq('courier_id', courierId)
        .in('status', ['A Caminho', 'No Portão']) 
        .order('timestamp', { ascending: false });

    if (error) throw error;
    return (data || []).map((o: any) => mapOrderFromDB(o));
};

export const fetchCourierTotalDeliveries = async (courierId: string): Promise<number> => {
    const { count, error } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('courier_id', courierId)
        .eq('status', 'Entregue');

    if (error) {
        console.error('Error fetching total deliveries count:', error);
        return 0;
    }
    return count || 0;
};

export const fetchCourierHistoryByDate = async (courierId: string, date: Date): Promise<Order[]> => {
    // Start of day
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    
    // End of day
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
        .from('orders')
        .select(ORDER_COLUMNS)
        .eq('courier_id', courierId)
        .eq('status', 'Entregue')
        .gte('timestamp', start.toISOString())
        .lte('timestamp', end.toISOString())
        .order('timestamp', { ascending: false });

    if (error) {
        console.error('Error fetching courier history by date:', error);
        return [];
    }
    return (data || []).map(mapOrderFromDB);
};

// Deprecated or generic recent history (optional, currently used by UI but we will replace its usage)
export const fetchCourierHistory = async (courierId: string): Promise<Order[]> => {
    return fetchCourierHistoryByDate(courierId, new Date());
};

export const assignOrderToCourier = async (orderId: string, courierId: string, courierName: string) => {
    // 1. Fetch current order to get history
    const { data: currentOrder } = await supabase.from('orders').select('status_history').eq('id', orderId).single();
    const currentHistory = currentOrder?.status_history || [];
    const newHistory = [...currentHistory, { status: 'A Caminho', timestamp: new Date().toISOString() }];

    const { data, error } = await supabase
        .from('orders')
        .update({
            courier_id: courierId,
            courier_name: courierName, 
            status: 'A Caminho',
            status_history: newHistory
        })
        .eq('id', orderId)
        .select()
        .single();
    
    if (error) throw error;
    return data;
};

export const updateOrderDeliveryStatus = async (orderId: string, newStatus: string) => {
    // 1. Fetch current order to get history
    const { data: currentOrder } = await supabase.from('orders').select('status_history').eq('id', orderId).single();
    const currentHistory = currentOrder?.status_history || [];
    const newHistory = [...currentHistory, { status: newStatus, timestamp: new Date().toISOString() }];

    const { data, error } = await supabase
        .from('orders')
        .update({
            status: newStatus,
            status_history: newHistory
        })
        .eq('id', orderId)
        .select()
        .single();
    
    if (error) throw error;
    return data;
};

export const fetchDynamicDeliveryFee = async (address: string): Promise<number | null> => {
    if (!address || address.trim().length < 3) return null;
    try {
        const { data, error } = await supabase.rpc('get_delivery_fee_by_address', { p_address: address });
        if (error) {
            console.error('Error fetching dynamic delivery fee:', error);
            return null;
        }
        return data as number;
    } catch (e) {
        console.error('Exception fetching dynamic delivery fee:', e);
        return null;
    }
};

// --- Bolão ---
export const submitBolaoGuess = async (storeId: string, phone: string, brazilScore: number, opponentScore: number) => {
    let sanitizedPhone = phone.replace(/\D/g, '');
    if (sanitizedPhone.startsWith('55') && sanitizedPhone.length > 11) {
        sanitizedPhone = sanitizedPhone.substring(2);
    }
    const { data, error } = await supabase
        .from('bolao_guesses')
        .insert({
            store_id: storeId,
            phone: sanitizedPhone,
            brazil_score: brazilScore,
            opponent_score: opponentScore
        })
        .select()
        .single();
    if (error) throw error;
    return data;
};

export const fetchBolaoGuessByPhone = async (phone: string, storeId: string) => {
    let sanitizedPhone = phone.replace(/\D/g, '');
    if (sanitizedPhone.startsWith('55') && sanitizedPhone.length > 11) {
        sanitizedPhone = sanitizedPhone.substring(2);
    }
    const { data, error } = await supabase
        .from('bolao_guesses')
        .select('*')
        .eq('phone', sanitizedPhone)
        .eq('store_id', storeId)
        .single();
    if (error && error.code !== 'PGRST116') {
        console.error('Error fetching bolao guess:', error);
        return null;
    }
    return data;
};

export const fetchAllBolaoGuesses = async (storeId: string) => {
    const { data, error } = await supabase
        .from('bolao_guesses')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
};

// --- TV Ads Services ---
export const fetchTvAds = async (storeId: string) => {
    const { data, error } = await supabase
        .from('tv_ads')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });
    if (error && error.code !== '42P01') throw error; // Ignore table doesn't exist for now
    return data || [];
};

export const createTvAd = async (ad: any) => {
    const { data, error } = await supabase.from('tv_ads').insert(ad).select().single();
    if (error) throw error;
    return data;
};

export const updateTvAd = async (id: string, updates: any) => {
    const { data, error } = await supabase.from('tv_ads').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
};

export const deleteTvAd = async (id: string) => {
    const { error } = await supabase.from('tv_ads').delete().eq('id', id);
    if (error) throw error;
};


export const fetchDeliveryZones = async (storeId: string): Promise<any[]> => {
    try {
        const { data, error } = await supabase.from('delivery_zones').select('*').eq('store_id', storeId).order('neighborhood_name');
        if (error) throw error;
        return data || [];
    } catch (e) { console.error('Error fetching delivery zones:', e); return []; }
};
export const createDeliveryZone = async (zone: any): Promise<any> => {
    const { data, error } = await supabase.from('delivery_zones').insert([zone]).select();
    if (error) throw error;
    return data[0];
};
export const updateDeliveryZone = async (id: string, updates: any): Promise<void> => {
    const { error } = await supabase.from('delivery_zones').update(updates).eq('id', id);
    if (error) throw error;
};
export const deleteDeliveryZone = async (id: string): Promise<void> => {
    const { error } = await supabase.from('delivery_zones').delete().eq('id', id);
    if (error) throw error;
};

