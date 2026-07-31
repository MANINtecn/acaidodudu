export interface Store {
  id: string;
  name: string;
  slug: string;
  owner_id?: string;
  created_at?: string;
  logo_url?: string;
  theme_colors?: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
  };
  // SaaS Fields
  subscription_end_date?: string;
  plan_value?: number;
  is_active?: boolean;
  owner_email?: string;
}

export interface Category {
  id: number;
  name: string;
  store_id: string;
}

export interface Customer {
  id: string;
  store_id: string;
  phone: string;
  name: string;
  address?: string;
  reference_point?: string;
  preferred_payment_method?: string;
  last_change_for?: number;
  total_orders: number;
  last_order_at?: string;
}

export interface Addon {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
  categoryId?: number;
  store_id: string;
  daysOfWeek?: string[];
}

export interface MenuItem {
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
  printed?: boolean;
}

export interface CartItem extends MenuItem {
  cartId: string;
  quantity: number;
  notes: string;
  printed?: boolean;
}

export type OrderType = 'Entrega' | 'Balcão' | 'Retirada';
export type PaymentMethod = 'Dinheiro' | 'Cartão' | 'PIX';
export type OrderStatus = 'Novo' | 'Em Produção' | 'A Caminho' | 'No Portão' | 'Entregue' | 'Cancelado' | 'Conta Solicitada';

export interface Order {
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
  statusHistory?: OrderStatusHistoryItem[];
  courier_id?: string;
  courier_name?: string;
  subOrderIndex?: number;
}

export interface OrderStatusHistoryItem {
  status: OrderStatus;
  timestamp: string;
}

export interface Courier {
  id: string;
  store_id: string;
  name: string;
  phone: string;
  password?: string;
  is_active: boolean;
  created_at?: string;
}



export interface CashSession {
  id: string;
  store_id: string;
  status: 'open' | 'closed';
  openingFloat: number;
  closingFloat?: number;
  openingTime?: string;
  closingTime?: string;
  notes?: string;
  summary?: CashSummary;
}

export interface CashTransaction {
  id?: string;
  session_id: string;
  type: 'Suprimento' | 'Sangria' | 'Venda';
  amount: number;
  justification?: string;
  timestamp?: string;
  store_id: string;
}

export interface CashSummary {
  openingFloat: number;
  cashSales: number;
  supplies: number;
  withdrawals: number;
  expected: number;
  closingFloat: number;
  difference: number;
}

export interface Settings {
  id?: string;
  store_id: string;
  storefrontTheme?: 'classic' | 'modern';
  openingTime: string;
  closingTime: string;
  manualStatus: 'open' | 'closed' | 'auto';
  comboPrice: number;
  webhookNewOrderUrl?: string;
  webhookInProductionUrl?: string;
  webhookOutForDeliveryUrl?: string;
  webhookArrivedAtDoorUrl?: string;
  isAppDiscountEnabled: boolean;
  appDiscountPercentage: number;
  logoUrl?: string;
  isRaffleEnabled?: boolean;
  rafflePrizeValue?: number;
  raffleDrawDate?: string;
  lastRaffleWinner?: string;
  isRatingEnabled?: boolean;
  daysOfWeek?: string[];
  deliveryFee?: number;
  isBotEnabled?: boolean;
  preferredPrinter?: string;
  printerPaperWidth?: '58mm' | '80mm';
  printerCompatibilityMode?: boolean;
  kitchenPrinter?: string;
  kitchenPrinterPaperWidth?: '58mm' | '80mm';
  barPrinter?: string;
  barPrinterPaperWidth?: '58mm' | '80mm';
  courierPrinter?: string;
  courierPrinterPaperWidth?: '58mm' | '80mm';
  courier_access_code?: string;
  defaultDDD?: string;
  bolaoStartTime?: string;
  bolaoEndTime?: string;
}

export interface Promotion {
  id: string | number;
  name: string;
  description?: string;
  price: number;
  image?: string;
  isActive: boolean;
  store_id: string;
  daysOfWeek?: string[];
}


export interface TvAd {
  id?: string;
  store_id?: string;
  title: string;
  image_url: string;
  is_active: boolean;
  created_at?: string;
}
