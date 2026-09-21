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
  /**
   * Grupo do complemento, usado para separar sabor de calda no fluxo do
   * Milkshake -- pedido do Ikarus, 21/09/2026: "cliente escolhe o sabor
   * primeiro... e depois perguntamos qual calda, 1 calda apenas
   * selecionada". undefined = generico (comportamento historico: aparece
   * numa lista so, sem separacao, escolha livre). So produtos com addons
   * marcados como 'sabor' E 'calda' ganham o fluxo em 2 passos no
   * ItemDetailModal -- outros produtos continuam como sempre foram.
   */
  addonGroup?: 'sabor' | 'calda';
}

export interface MenuItem {
  id: number;
  name: string;
  /**
   * Código para lançamento rápido por teclado no balcão. SEMPRE >= 100:
   * 1..30 são números de MESA no atalho, então produtos começam em 100
   * para nunca haver ambiguidade. Único por loja.
   */
  codigo?: number;
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
  isWeightBased?: boolean;
  pricePerKg?: number;
  /**
   * Campos fiscais (NFC-e). `ncm` e OBRIGATORIO para emitir — sem ele a
   * nota nao sai. Levantamento de 21/09/2026, cruzando com os XMLs reais
   * do Multipedidos: NENHUM dos 73 produtos tinha NCM preenchido (pior do
   * que o "33 sem NCM" de 09/09). Preenchido em lote nesta data para os
   * produtos com correspondencia confirmada nos XMLs reais -- ver
   * claude-acai.md, "Preenchimento fiscal em lote a partir dos XMLs reais".
   */
  ncm?: string;
  cest?: string;
  /** 'UN' padrao; acai vendido por peso usa 'KG' (3 casas na nota). */
  unidadeFiscal?: string;
  /** 0 = nacional — padrao para produto de sorveteria/alimenticio. */
  origemFiscal?: number;
  /**
   * CFOP e CSOSN mudam POR PRODUTO, nao sao um padrao unico da loja --
   * achado dos XMLs reais (21/09/2026): açai e bebidas industrializadas
   * usam CSOSN 500 (Substituicao Tributaria, ICMS ja retido na industria),
   * mas sorvete/churros/canjica usam CSOSN 102 (normal). Confirmado com o
   * contador (CS Contabilidade, 21/09/2026: "sim, correto"). Quando vazio,
   * o gerador de XML (Fase 2) cai no cfop_padrao/csosn_padrao de
   * fiscal_config -- mas isso so serve para os itens fora do regime de ST.
   */
  cfopFiscal?: string;
  csosnFiscal?: string;
}

export interface CartItem extends MenuItem {
  cartId: string;
  quantity: number;
  notes: string;
  printed?: boolean;
  weightKg?: number;
  /**
   * Marca que este item foi RESGATADO com pontos de fidelidade -- entra no
   * pedido com price=0 (definido no momento do resgate) mas o sistema
   * precisa saber que foi resgate para nao contar como venda normal em
   * relatorios, e para o ledger de pontos bater com o pedido certo.
   */
  isLoyaltyRedemption?: boolean;
  /** Quantos pontos este resgate custou (para o ledger, ao criar o pedido). */
  loyaltyPointsCost?: number;
}

export type OrderType = 'Entrega' | 'Balcão' | 'Retirada';

/** Um dos ate 4 produtos resgataveis no modelo de fidelidade por pontos. */
export interface LoyaltyRewardItem {
  id: string;
  store_id: string;
  menu_item_id: number;
  /** Custo em pontos para resgatar este produto. */
  points_cost: number;
  /** Copia do nome/preco do MenuItem no momento da config, para exibir sem join. */
  menu_item_name: string;
  menu_item_price: number;
  is_active: boolean;
}

/** Saldo de pontos de UM cliente, numa loja. */
export interface CustomerLoyaltyPoints {
  id: string;
  store_id: string;
  phone: string;
  points_balance: number;
  updated_at: string;
}

/**
 * Configuracao fiscal da loja (NFC-e) — 1 linha por loja. Ver
 * claude-acai.md, "ARQUITETURA TECNICA DA NFC-e". `provedor_api` e' so o
 * NOME do provedor escolhido (Focus NFe/TecnoSpeed/Webmania) — o TOKEN em
 * si nunca trafega para o front, so a Edge Function o le.
 */
export interface FiscalConfig {
  id: string;
  store_id: string;
  cnpj?: string;
  inscricao_estadual?: string;
  razao_social?: string;
  nome_fantasia?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  municipio?: string;
  cod_ibge_municipio?: string;
  uf?: string;
  cep?: string;
  regime_tributario?: number;
  cfop_padrao?: string;
  csosn_padrao?: string;
  pis_cst?: string;
  cofins_cst?: string;
  carga_tributaria_aprox?: number;
  ambiente: 'homologacao' | 'producao';
  provedor_api?: string;
  csc_id?: string;
  csc_token?: string;
}

export type NotaFiscalStatus = 'pendente' | 'autorizada' | 'rejeitada' | 'cancelada' | 'contingencia';

/** Uma NFC-e emitida (ou tentada) para um pedido. */
export interface NotaFiscal {
  id: string;
  store_id: string;
  order_id?: string;
  serie: number;
  numero: number;
  chave_acesso?: string;
  protocolo_autorizacao?: string;
  status: NotaFiscalStatus;
  motivo_rejeicao?: string;
  valor_total: number;
  data_emissao: string;
  xml?: string;
  danfe_url?: string;
  emitida_por_estacao?: string;
}

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
  /**
   * ATENCAO: chega do banco como STRING ("1"), nao number. Comparar sempre
   * com mesmaMesa()/Number(), nunca com === direto contra number.
   */
  table_number?: number | string;
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

export interface ModernGroup {
  id: number;
  name: string;
  image: string;
  categories: number[];
}

export interface Settings {
  id?: string;
  store_id: string;
  storefrontTheme?: 'classic' | 'modern';
  modernGroups?: ModernGroup[];
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
  /** Foto grande da tela inicial (Moderna). Vazio = usa /acai_boat_hero.jpg. */
  heroImageUrl?: string;
  /**
   * Qual modelo de fidelidade esta ativo na loja.
   * 'selo'   = o historico: 10 pedidos elegiveis = 1 desconto (is_loyalty_eligible).
   * 'pontos' = novo: cliente acumula pontos por valor gasto e resgata
   *            produtos configurados. Os dois nunca ficam ativos juntos.
   */
  loyaltyModel?: 'selo' | 'pontos';
  isRaffleEnabled?: boolean;
  rafflePrizeValue?: number;
  raffleDrawDate?: string;
  lastRaffleWinner?: string;
  isRatingEnabled?: boolean;
  daysOfWeek?: string[];
  deliveryFee?: number;
  minOrderValue?: number;
  isBotEnabled?: boolean;
  preferredPrinter?: string;
  printerPaperWidth?: '58mm' | '80mm';
  printerCompatibilityMode?: boolean;
  /**
   * Imprimir automaticamente pedidos de MESA.
   * Quando false, o pedido e recebido normalmente mas NAO dispara impressao —
   * o operador imprime pelo botao do card quando quiser.
   * Nao afeta pedidos de Entrega, que seguem imprimindo sozinhos.
   * undefined = true (comportamento historico, nao quebra quem ja usa).
   *
   * ATE 21/09/2026 esta mesma flag tambem controlava Retirada junto -- foi
   * separada porque o Ikarus queria Retirada sempre imprimindo, mas a Mesa
   * dele estava desligada de proposito (as duas caiam juntas). Ver
   * autoPrintRetirada abaixo.
   */
  autoPrintDineIn?: boolean;
  /**
   * Imprimir automaticamente pedidos de RETIRADA. Mesma logica de
   * autoPrintDineIn, mas independente -- desde 21/09/2026 (Ikarus: "pedidos
   * de retirada nao imprimiu automaticamente", causa raiz era a mesma flag
   * de Mesa desligada, afetando os dois juntos sem ele perceber).
   * undefined = true (nunca quebra quem ja tinha o antigo comportamento).
   */
  autoPrintRetirada?: boolean;
  /** Som do alerta de pedido novo: 'sino' | 'alarme' | 'campainha'. */
  sireneTipo?: string;
  /** Volume do alerta. 1 = normal, ate 10 para ambiente barulhento. */
  sireneVolume?: number;
  /** Mostra a mini-colinha de atalhos durante o lancamento. undefined = mostra. */
  mostrarDicasAtalho?: boolean;
  /**
   * Layout do grid de mesas na aba Balcao.
   * 'padrao'       = grade numerada, como sempre foi (undefined tambem cai aqui).
   * 'personalizado' = cartoes com nome do cliente, 8 visiveis + scroll.
   * So muda a EXIBICAO — TOTAL_MESAS e handleSelectTable sao os mesmos.
   */
  modeloMesas?: 'padrao' | 'personalizado';

  // ── PIX + comprovante pelo WhatsApp (tela pos-pedido do cliente) ──
  /** Liga a tela com a chave PIX e o botao de enviar comprovante. */
  pixEnabled?: boolean;
  /** A chave em si. Ex.: 44344954000197 */
  pixKey?: string;
  /** CNPJ | CPF | Celular | E-mail | Aleatoria */
  pixKeyType?: string;
  /** Nome que aparece para o cliente conferir antes de pagar. */
  pixBeneficiary?: string;
  /** WhatsApp da loja que recebe o comprovante (so digitos, com DDD). */
  storeWhatsapp?: string;
  /** Modelo do resumo enviado. Aceita as marcas {{...}} — ver MODELO_PADRAO. */
  pixResumoTemplate?: string;
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

  // Balança Eletrônica (Urano / Toledo / Filizola / Elgin)
  isScaleEnabled?: boolean;
  scaleProtocol?: 'urano' | 'toledo' | 'filizola' | 'elgin' | 'generic';
  scaleBaudRate?: number;
  scalePricePerKg?: number;
  scaleAutoAdd?: boolean;
  scalePortName?: string;
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

export interface DeliveryZone {
  id: string;
  store_id: string;
  neighborhood_name: string;
  fee: number;
  is_active: boolean;
}
