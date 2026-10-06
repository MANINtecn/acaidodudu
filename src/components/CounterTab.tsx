import { useState, useMemo, useEffect, memo, useRef, useCallback } from 'react';
import { Plus, Minus, Trash2, Search, X, Bike, ShoppingBag, LogOut, Percent, Scale, Grid, ChevronDown, Volume2, VolumeX, Check } from 'lucide-react';
import type { Category, MenuItem, Addon, CartItem, OrderType, PaymentMethod, Settings, OrderStatus, Customer, Order, Promotion } from '../types';
import { fetchAllOpenOrdersForTable, updateOrder, deleteOrder, fetchCustomerByPhone, upsertCustomer, searchCustomers, clearTablePayments } from '../services/supabaseService';
import { normalizeString } from '../utils/searchUtils';
import { mesmaMesa, nomeDaComanda, nomeSemPrefixoDeMesa } from '../utils/mesaUtils';
import { calcularValorCarrinho } from '../utils/orderUtils';
import { Notification, NotificationType } from './Notification';
import CounterMenuGrid from './CounterMenuGrid';
import { getScaleWeightWithFallback, requestSerialPort, subscribeToScale, ensureScaleAutoConnect, getScaleRawLog, clearScaleRawLog, getScaleSnapshot, type ScaleStatus } from '../services/scaleService';
import { decidirEnterComPeso, PESO_ZERO_KG } from '../utils/pesoBalanca';
import { criarEnvioUnico } from '../utils/envioUnico';
import { resolverCodigoDigitado } from '../utils/codigoProduto';
import { reconciliarRascunho, rascunhoEstaValido, comandaTemPendencia } from '../utils/rascunhoComanda';

/**
 * Total de mesas do sistema. ERA const local dentro de lancarPesoNaMesa — por
 * isso os dois grids de selecao tinham `30` hardcoded, sem enxergar essa
 * constante. Agora e uma so, no modulo, para os 3 pontos nunca divergirem.
 */
const TOTAL_MESAS = 30;

/**
 * Categorias que NAO aparecem na barra do Balcao V2 (pedido do Ikarus, 05/10/2026: "remover essas
 * categorias"): a aba Promocoes + Porcao de Salgados, Monte Seu Acai e Sorvete 350ml. Comparacao
 * pelo NOME normalizado inteiro (sem acento/espaco/caixa), assim sobrevive a troca de id e nao
 * pega categorias parecidas. So esconde a BARRA: os produtos continuam lancaveis por codigo e
 * achaveis na busca. V1 nao muda.
 */
const CATEGORIAS_OCULTAS_NO_BALCAO_V2 = ['porcaodesalgadosmedios(10unid)', 'monteseuacai', 'monteseuacaicomcomplementoszerolactose', 'sorvete350ml'];

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
    /**
     * Muda de valor sempre que o F3 (global, no AdminPage) pede foco no
     * campo de busca. Numero em vez de boolean para o useEffect disparar
     * mesmo se o F3 for apertado duas vezes seguidas sem nada mudar entre.
     */
    focusSearchSignal?: number;
    /**
     * Balcão V2, pedido do Ikarus 01/10/2026: "não sair da tela" -- avisa o
     * AdminPage qual comanda está aberta agora (ou null) para o F7 global
     * (que já existe e já sabe fazer checkout de mesa) funcionar também
     * dentro do Balcão, sem duplicar o CheckoutModal nem a lógica de montar
     * o pedido virtual da mesa (abrirComandaDaMesa já faz isso).
     */
    onComandaAtivaChange?: (numero: number | null) => void;
    /**
     * Muda de valor sempre que o F7 (global, AdminPage) termina um checkout
     * de uma comanda do Balcão V2 com sucesso -- fecha a tela da comanda
     * sozinha, senão o operador ficava "preso" olhando o carrinho de uma
     * comanda que já virou pedido pago. Mesmo padrão do focusSearchSignal.
     */
    fecharComandaSignal?: number;
    /**
     * CRÍTICO (achado em 02/10/2026, véspera da demo: "abri F7, apertei C de
     * cartão, dei Enter -- em vez de finalizar o pagamento, apareceu 'Comanda
     * da mesa atualizada', o handleFinalize do Balcão disparou"): o
     * CheckoutModal e o SplitBillModal são renderizados pelo AdminPage, FORA
     * da árvore do CounterTab -- o handler global de teclado do Balcão não
     * tem como saber, sozinho, que um desses modais está por cima da tela.
     * Resultado: Enter (sem dígitos, dentro da comanda) continuava
     * disparando handleFinalize() ao mesmo tempo que o checkout tentava
     * confirmar o pagamento. true = suspende o handler de teclado do Balcão
     * inteiro enquanto o modal de fora estiver aberto.
     */
    modalExternoAberto?: boolean;
    /**
     * Pedido do Ikarus 02/10/2026: "por que esperar lançar? já no faturar" --
     * F7/F8 devem funcionar MESMO com a comanda ainda só no carrinho (nunca
     * enviada). Esta ref é preenchida pelo CounterTab com uma função que
     * envia a comanda ativa (mesmo handleFinalize de sempre) e devolve se deu
     * certo -- o AdminPage chama ela antes de F7/F8 quando a comanda ainda
     * não tem pedido no banco, e só abre o checkout/split DEPOIS do envio
     * confirmar.
     */
    enviarComandaAtivaRef?: React.MutableRefObject<(() => Promise<boolean>) | null>;
}

export const CounterTab = memo(({ categories, menuItems, addons, settings, storeId, onOrderComplete, initialTable, activeOrders, onBack, promotions, focusSearchSignal, onComandaAtivaChange, fecharComandaSignal, modalExternoAberto, enviarComandaAtivaRef }: CounterTabProps) => {
    const [selectedCategoryId, setSelectedCategoryId] = useState<number>(categories[0]?.id || 0);
    const [searchTerm, setSearchTerm] = useState('');
    /** Input de busca de produto. F3 (AdminPage) foca aqui via focusSearchSignal. */
    const buscaProdutoRef = useRef<HTMLInputElement>(null);

    // REVERTIDO em 28/09/2026 -- as duas tentativas de "corrigir" o foco do
    // F3 (requestAnimationFrame, depois o baseline ref) pioraram o
    // problema: Ikarus relatou que depois delas nem clicar destravava mais
    // os campos (antes, clicar na tela pelo menos resolvia). Voltado ao
    // comportamento original de antes desta sessao. NAO mexer aqui de novo
    // sem reproduzir o bug de foco localmente primeiro -- ver claude-acai.md.
    useEffect(() => {
        if (focusSearchSignal) buscaProdutoRef.current?.focus();
    }, [focusSearchSignal]);
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [cart, setCart] = useState<CartItem[]>([]);
    const [orderType, setOrderType] = useState<OrderType>('Balcão');
    const [selectedTable, setSelectedTable] = useState<string>('');
    const [customerName, setCustomerName] = useState('');

    // ── BALCÃO V2: COMANDAS 1-20 ──────────────────────────────────
    // Decisão do Ikarus em 30/09/2026: a comanda do V2 é, por baixo dos
    // panos, A MESMA COISA que uma mesa do V1 -- reaproveita table_number,
    // handleSelectTable, fetchAllOpenOrdersForTable etc. Caixa, histórico e
    // fechamento em lote já funcionam de graça, sem duplicar nada. A ÚNICA
    // diferença é visual: 20 slots (não 30) rotulados "Comanda N" em vez de
    // "Mesa N", num card grande em vez da grade antiga. Não há mais estado
    // paralelo (localStorage, contador de rótulo, snapshots) -- o estado de
    // verdade é o banco, refletido em `activeOrders` (mesma prop que a aba
    // Pedidos usa). Como o interruptor Balcão V1/V2 é por máquina, mesa e
    // comanda nunca coexistem na mesma tela ("ou usa a v1 ou a v2, não vão
    // colidir" -- Ikarus).
    const TOTAL_COMANDAS_V2 = 20;
    const [isComandaModalOpen, setIsComandaModalOpen] = useState(false);

    // Avisa o AdminPage qual comanda está aberta -- F7 (global, já existe)
    // usa isso pra fazer checkout sem sair da tela do Balcão. Só dispara
    // quando o número de verdade muda (evita chamadas repetidas em todo
    // render do CounterTab).
    useEffect(() => {
        const numero = (settings?.balcaoV2 && isComandaModalOpen) ? parseInt(selectedTable, 10) : null;
        onComandaAtivaChange?.(numero && !isNaN(numero) ? numero : null);
    }, [settings?.balcaoV2, isComandaModalOpen, selectedTable, onComandaAtivaChange]);
    /**
     * N dentro da comanda (Balcão V2): renomeia a comanda ativa a qualquer
     * momento, sem depender do fluxo de confirmação de envio -- pedido do
     * Ikarus, 30/09. Usa customerName, igual ao V1 (ex.: "Comanda 3 · João").
     */
    const [isRenomeandoComanda, setIsRenomeandoComanda] = useState(false);
    const campoRenomeComandaRef = useRef<HTMLInputElement>(null);
    const [isTableModalOpen, setIsTableModalOpen] = useState(false);
    const [isCustomItemModalOpen, setIsCustomItemModalOpen] = useState(false);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [categorySearchTerm, setCategorySearchTerm] = useState('');
    const [isScaleModalOpen, setIsScaleModalOpen] = useState(false);
    const [scaleWeight, setScaleWeight] = useState<number>(0);
    // Peso do modal "Pesagem" (digitado a mão OU capturado por um clique no
    // botão). Precisa ser um state SEPARADO de `scaleWeight`: aquele é
    // atualizado o tempo todo pelo stream em tempo real da balança do
    // balcão (subscribeToScale, abaixo), e enquanto o modal ficava aberto
    // usando o mesmo state, cada leitura nova da balança do balcão
    // sobrescrevia o número que o operador tinha acabado de digitar --
    // parecia "o peso não fixa", mas não era bug de foco, era o valor
    // sendo pisado por outro state.
    const [manualWeight, setManualWeight] = useState<number>(0);
    const [scalePricePerKg, setScalePricePerKg] = useState<number>(settings?.scalePricePerKg || 60);
    const [scaleItemName, setScaleItemName] = useState<string>('Açaí/Sorvete por Quilo');
    const [isReadingScale, setIsReadingScale] = useState(false);
    const [isAddonModalOpen, setIsAddonModalOpen] = useState(false);
    const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);
    // Popup de escolha de sabor por teclado (Balcão V2, pedido do Ikarus em
    // 01/10/2026 véspera da demo pro Marlon: "a gente não vai usar clique de
    // hora nenhuma, tudo por comando"). Produto com 2+ addons elegíveis
    // (mesmo sabor/categoria) abre ISSO sozinho assim que o código é digitado
    // -- sem precisar de Enter -- e ↑↓/Enter/ESC navegam sem mouse.
    // opcoes[0] é SEMPRE `null` ("Prosseguir sem adicional") -- pedido do
    // Ikarus: "eu não posso obrigar as pessoas com os adicionais... tem que
    // vir pré-selecionado, no topo da lista, pra agilizar". Os addons de
    // verdade vêm a partir do índice 1.
    // Suporte a produto com SABOR + CALDA em 2 passos (ex.: Milkshake) --
    // pedido do Ikarus 02/10/2026: o mesmo fluxo que já existe no cardápio do
    // site (addonGroup 'sabor'/'calda') precisa valer também no Balcão. Sem
    // isso, um produto com os dois grupos deixava escolher só UM addon no
    // total, misturando sabor e calda na mesma lista.
    // `etapa` controla qual lista está sendo mostrada; `saborEscolhido` guarda
    // a escolha da 1ª etapa enquanto a 2ª (calda) está sendo decidida.
    // `marcados`: índices marcados em OPCIONAIS/ADICIONAIS (tecla S, pedido do
    // Ikarus 02/10/2026 -- "leite condensado" E "leite em pó" ao mesmo tempo
    // no mesmo açaí, por exemplo). Sabor/calda continuam escolha única
    // (Enter escolhe e já avança) -- só a lista plana de addons sem grupo
    // vira multi-seleção.
    type SeletorSaborState = {
        produto: MenuItem;
        opcoes: (Addon | null)[];
        indice: number;
        etapa: 'unico' | 'sabor' | 'calda';
        saborEscolhido?: Addon | null;
        marcados: Set<number>;
    };
    const [seletorSabor, setSeletorSabor] = useState<SeletorSaborState | null>(null);
    const seletorSaborRef = useRef<typeof seletorSabor>(null);
    seletorSaborRef.current = seletorSabor;

    // Popups de sabor PAUSADOS por comanda (pedido do Ikarus 02/10/2026): "C
    // dentro do popup abre outra comanda pra atender outro cliente enquanto o
    // primeiro decide". Ao trocar de comanda com o popup aberto, o estado
    // inteiro (produto, opções, índice, marcados) fica guardado aqui; ao
    // voltar pra essa comanda, reabre exatamente do mesmo ponto.
    const seletoresPausadosRef = useRef<Record<number, SeletorSaborState>>({});

    // Rola a lista pra acompanhar a navegação por seta -- sem isto, com mais
    // de ~6 sabores (caso real: "Potes de Sorvete 1,8L" tem 10+), a opção
    // selecionada saía da área visível e o operador navegava "às cegas".
    useEffect(() => {
        if (!seletorSabor) return;
        const el = document.querySelector(`[data-sabor-idx="${seletorSabor.indice}"]`);
        el?.scrollIntoView({ block: 'nearest' });
    }, [seletorSabor?.indice]);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Dinheiro');
    const [changeFor, setChangeFor] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [liveScaleStatusText, setLiveScaleStatusText] = useState<string>('Vigiando Balança...');
    const [scaleStatus, setScaleStatus] = useState<ScaleStatus>('disconnected');
    const [isScaleStable, setIsScaleStable] = useState(false);
    const [isScaleDiagOpen, setIsScaleDiagOpen] = useState(false);
    const [scaleRawLines, setScaleRawLines] = useState<string[]>([]);

    // ── ATALHO DE TECLADO DA BALANÇA ──────────────────────────────
    // Fluxo do balcão: pesa → digita o número da mesa → Enter → lançou.
    // Produtos usam código a partir de 100, então 1–30 nunca colide com produto.
    const [teclasMesa, setTeclasMesa] = useState('');           // dígitos em digitação
    // REF sincrona dos digitos (06/10/2026, "se der varios Enter repete o lancamento"): o handler de
    // teclado lia `teclasMesa` da closure, que fica um render atras -- dois Enter (ou digitos rapidos)
    // dentro do mesmo intervalo viam o mesmo valor: o codigo era lancado 2x e digitos se perdiam.
    // Agora toda escrita passa por definirTeclasMesa (atualiza a ref NA HORA) e o handler le a ref.
    const teclasMesaRef = useRef('');
    const definirTeclasMesa = (v: string) => { teclasMesaRef.current = v; setTeclasMesa(v); };
    // Quando o ULTIMO codigo caiu direto na comanda (V2). Um Enter logo em seguida (< 0,5 s) e' o habito
    // antigo "codigo + Enter", nao a intencao de enviar -- sem isto cada produto enviaria a comanda.
    const ultimoCodigoLancadoEmRef = useRef(0);
    const [nomeAberto, setNomeAberto] = useState(false);        // campo de nome na confirmação
    const campoNomeRef = useRef<HTMLInputElement>(null);
    const [avisoAtalho, setAvisoAtalho] = useState<{
        // 'enviar' = montado e aguardando o ENTER de confirmacao
        tipo: 'ok' | 'somou' | 'erro' | 'confirmar' | 'enviar';
        titulo: string;
        detalhe?: string;
        mesa?: number;
    } | null>(null);

    // Sync scalePricePerKg from settings
    useEffect(() => {
        if (settings?.scalePricePerKg) {
            setScalePricePerKg(settings.scalePricePerKg);
        }
    }, [settings?.scalePricePerKg]);

    // Balança: stream contínuo (sem polling — a porta é aberta UMA vez).
    // Ver claude-acai.md, Regra 6. NÃO substituir por setInterval.
    useEffect(() => {
        if (!settings?.isScaleEnabled) return;

        const unsubscribe = subscribeToScale((snap) => {
            setScaleStatus(snap.status);
            setScaleWeight(snap.weightKg);
            setIsScaleStable(snap.isStable);

            // Balança voltou a zero (prato retirado) -> o próximo peso é NOVO.
            if (snap.weightKg <= PESO_ZERO_KG) {
                pesoLancadoRef.current = false;
                setPesoLancado(false);
            }

            switch (snap.status) {
                case 'disconnected':
                    setLiveScaleStatusText(snap.errorMessage ? `🔌 ${snap.errorMessage}` : '🔌 PROCURANDO A BALANÇA...');
                    break;
                case 'connecting':
                    setLiveScaleStatusText('⏳ CONECTANDO...');
                    break;
                case 'waiting':
                    setLiveScaleStatusText(snap.errorMessage ? `🟡 ${snap.errorMessage}` : '🟡 AGUARDANDO DADOS DA BALANÇA');
                    break;
                case 'unstable':
                    setLiveScaleStatusText('⚖️ ESTABILIZANDO...');
                    break;
                case 'stable':
                    setLiveScaleStatusText('🟢 PESO ESTÁVEL');
                    break;
                case 'error':
                    setLiveScaleStatusText(snap.errorMessage || '⚠️ ERRO NA BALANÇA');
                    break;
            }
        });

        // Reconexao AUTOMATICA e continua: agora vive no scaleService
        // (ensureScaleAutoConnect) -- independe desta aba, tenta de novo em 3 s,
        // reage na hora ao plugar a USB e reabre a porta se a balanca ficar muda.
        // Idempotente: o Admin tambem liga no boot. NAO desligamos ao sair da
        // aba, so no Admin quando a balanca e desabilitada.
        ensureScaleAutoConnect(settings?.scaleBaudRate || 9600);

        return () => {
            unsubscribe();
        };
    }, [settings?.isScaleEnabled, settings?.scaleProtocol, settings?.scaleBaudRate]);

    // Atualiza o log cru enquanto o painel de diagnóstico estiver aberto.
    useEffect(() => {
        if (!isScaleDiagOpen) return;
        const id = setInterval(() => setScaleRawLines(getScaleRawLog()), 400);
        setScaleRawLines(getScaleRawLog());
        return () => clearInterval(id);
    }, [isScaleDiagOpen]);

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
                statuses[Number(o.table_number)] = o.status;
            }
        });
        return statuses;
    }, [activeOrders]);

    // Mute só do bipe de "comanda enviada" -- pedido do Ikarus 01/10/2026,
    // véspera da demo: "quando finalizamos uma comanda não dá um bipe, que dê
    // um bipe" + botão de mute pra quem não quiser esse som. Persistido por
    // loja (mesmo padrão do cache de rascunhos) -- não mexe no bipe de
    // item/erro, que continua sempre ativo (são avisos importantes).
    const chaveMuteEnvio = `acaiDoDudu:muteBipeEnvio:${storeId}`;
    const [muteBipeEnvio, setMuteBipeEnvio] = useState<boolean>(() => {
        try {
            return localStorage.getItem(chaveMuteEnvio) === '1';
        } catch (_) {
            return false;
        }
    });
    const alternarMuteBipeEnvio = () => {
        setMuteBipeEnvio(prev => {
            const novo = !prev;
            try { localStorage.setItem(chaveMuteEnvio, novo ? '1' : '0'); } catch (_) {}
            return novo;
        });
    };
    // Ref (Regra 10): `bipar` é chamado de dentro do handler de teclado
    // global (ex.: handleFinalize via Enter), então precisa ler o mute
    // síncrono, não da closure.
    const muteBipeEnvioRef = useRef(false);
    muteBipeEnvioRef.current = muteBipeEnvio;

    // Bipe via WebAudio: não depende de arquivo de som nem de permissão.
    const bipar = useCallback((tipo: 'ok' | 'somou' | 'erro' | 'enviado') => {
        if (tipo === 'enviado' && muteBipeEnvioRef.current) return;
        try {
            const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
            if (!Ctx) return;
            const ctx = new Ctx();
            // ok: 1 bipe agudo | somou: 2 bipes | erro: 1 bipe grave e longo |
            // enviado: acorde curto subindo (mais "completo", de confirmação)
            const notas = tipo === 'erro' ? [{ f: 220, t: 0, d: 0.35 }]
                        : tipo === 'somou' ? [{ f: 880, t: 0, d: 0.12 }, { f: 880, t: 0.18, d: 0.12 }]
                        : tipo === 'enviado' ? [{ f: 660, t: 0, d: 0.1 }, { f: 880, t: 0.1, d: 0.1 }, { f: 1320, t: 0.2, d: 0.18 }]
                        : [{ f: 880, t: 0, d: 0.15 }];
            notas.forEach(({ f, t, d }) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.frequency.value = f;
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.18, ctx.currentTime + t);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + d);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + t);
                osc.stop(ctx.currentTime + t + d);
            });
            setTimeout(() => ctx.close?.(), 900);
        } catch (_) {
            // Sem áudio disponível: o aviso visual já cobre.
        }
    }, []);

    const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
    /**
     * Pedidos abertos da mesa, como estavam ao abrir. Sao a referencia para
     * distribuir os itens de volta no salvamento: cada item sabe de qual
     * sub-pedido veio pelo cartId.
     */
    const [pedidosDaMesa, setPedidosDaMesa] = useState<Order[]>([]);

    /**
     * Tecla C (Balcão V2): abre a próxima comanda LIVRE entre os slots 1-20
     * -- livre = nenhum pedido aberto naquele número (mesma checagem que a
     * grade de mesas do V1 já faz via `tableStatuses`). Se todos os 20
     * estiverem ocupados, avisa em vez de travar.
     */
    /**
     * Cache de RASCUNHOS não-enviados, por número de slot (1-20). Resolve o
     * caso real que o Ikarus descreveu em 30/09/2026: o operador está
     * montando a Comanda 3 (ainda não enviou), chega outro cliente, aperta C
     * pra abrir a Comanda 4 SEM perder o que já tinha em 3 -- e quando
     * voltar pra 3 (clicando ou digitando o número), o carrinho continua lá.
     *
     * PERSISTIDO em localStorage (por loja): sem isto, ir em Configurações
     * ou Cardápio pra checar algo e voltar ao Balcão desmontava o
     * CounterTab (o AdminPage só renderiza este componente quando
     * activeTab==='counter') e zerava tudo -- pedido do Ikarus, 30/09:
     * "deveria persistir mesmo trocando de menu ou aba". Também sobrevive a
     * fechar o app sem querer com uma comanda em standby.
     */
    const chaveRascunhosV2 = `acaiDoDudu:rascunhosComandaV2:${storeId}`;
    // `pedidosDaMesa`/`currentOrderId` guardados junto -- achado pela
    // auditoria de 02/10/2026 (CRÍTICO, determinístico, maior risco da
    // rodada): antes só guardava {cart, customerName}. Comanda JÁ enviada
    // (currentOrderId setado) nunca entrava aqui (salvarRascunhoAtual tinha
    // `|| currentOrderId) return`) -- editar uma comanda enviada (ex.: "mais
    // uma bala") e trocar de comanda (C/seta/dígito) ANTES de reenviar
    // perdia o item adicionado silenciosamente: ao reabrir, handleSelectTable
    // buscava o pedido do banco de novo e sobrescrevia o carrinho local,
    // sem rastro da edição pendente.
    const rascunhosComandaRef = useRef<Record<number, { cart: CartItem[]; customerName: string; pedidosDaMesa: Order[]; currentOrderId: string | null; salvoEm?: number }>>({});

    // CRÍTICO (achado pela auditoria de 01/10/2026, véspera da demo: mesmo
    // padrão de race condition já corrigido em loadData/refreshOrdersOnly do
    // AdminPage, mas que faltava replicar aqui): handleSelectTable faz um
    // fetch assíncrono por comanda -- se o operador navegar rápido entre
    // comandas (seta/C/dígito repetido, comum com fila), a resposta de uma
    // comanda mais lenta pode chegar DEPOIS da resposta de uma comanda mais
    // rápida e sobrescrever o carrinho que o operador já está editando.
    const handleSelectTableCallIdRef = useRef(0);
    /** Só existe para forçar `cardsComandas` (useMemo) a recalcular quando o
     * cache de rascunhos muda -- a ref em si não dispara re-render. */
    const [versaoRascunhos, setVersaoRascunhos] = useState(0);

    // Lê o cache salvo desta loja ao montar o componente (ex.: voltando de
    // outra aba, ou reabrindo o app com uma comanda em standby).
    useEffect(() => {
        try {
            const bruto = localStorage.getItem(chaveRascunhosV2);
            if (bruto) {
                // Auditoria 05/10/2026: rascunho de outro turno (ou salvo por versao antiga, sem
                // data) pode trazer itens JA enviados/apagados e duplicar a comanda ao reabrir.
                // So vale rascunho recente.
                const lido = JSON.parse(bruto) as typeof rascunhosComandaRef.current;
                const validos: typeof rascunhosComandaRef.current = {};
                Object.entries(lido || {}).forEach(([k, r]) => { if (rascunhoEstaValido(r)) validos[Number(k)] = r; });
                rascunhosComandaRef.current = validos;
                if (Object.keys(validos).length !== Object.keys(lido || {}).length) persistirRascunhos();
                setVersaoRascunhos(v => v + 1);
            }
        } catch (_) {
            // localStorage indisponível ou lixo salvo -- ignora, não trava o Balcão.
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /** Guarda o carrinho ATUAL no cache de rascunhos, se tiver item NÃO
     * reenviado ainda. Chamar SEMPRE antes de sair do slot atual.
     * CRÍTICO (achado pela auditoria de 02/10/2026): antes só salvava quando
     * `!currentOrderId` (comanda nunca enviada) -- uma comanda JÁ enviada que
     * ganhou item novo sem reenviar (ex.: reabriu, adicionou "mais uma bala",
     * trocou de comanda antes de apertar Enter de novo) nunca era salva, e o
     * item extra sumia ao reabrir.
     * SEGUNDO BUG (achado em 02/10/2026, relato do Ikarus: "abri a comanda já
     * enviada, dei Enter sem mudar nada, o valor DUPLICOU"): a correção
     * acima salvava o rascunho toda vez que o cart tinha item, mesmo sem
     * NENHUMA mudança real desde o último envio (ex.: só abriu e fechou com
     * X). Esse rascunho "idêntico ao banco" virava a fonte de verdade ao
     * reabrir (handleSelectTable prioriza rascunho sobre banco) e, no reenvio
     * seguinte, o handleFinalize comparava os cartId do cart restaurado
     * contra um snapshot velho de pedidosDaMesa -- bastava uma pequena
     * divergência de referência pra itens que já estavam no banco serem
     * tratados como "novos" e virarem um SEGUNDO sub-pedido, duplicando o
     * total. Corrigido: só salva rascunho de uma comanda JÁ enviada se o
     * cart realmente DIVERGE do que está em pedidosDaMesa (edição pendente de
     * verdade) -- sem alteração nenhuma, não grava nada, e reabrir usa o
     * banco como sempre deveria. */
    const salvarRascunhoAtual = () => {
        const numero = parseInt(selectedTable, 10);
        if (!numero || cart.length === 0) return;
        if (pedidosDaMesa.length > 0) {
            // Compara tambem quantidade/adicionais/obs (antes so os cartId: "+1" num item ja enviado
            // nao contava como edicao e se perdia ao trocar de comanda).
            if (!comandaTemPendencia(cart, pedidosDaMesa)) return; // nada editado desde o último envio -- não duplica rascunho
        }
        rascunhosComandaRef.current[numero] = { cart, customerName, pedidosDaMesa, currentOrderId, salvoEm: Date.now() };
        persistirRascunhos();
        setVersaoRascunhos(v => v + 1);
    };

    /** Escreve o cache inteiro no localStorage -- chamado sempre que ele
     * muda (salvar um novo rascunho, ou consumir um ao reabrir o slot). */
    const persistirRascunhos = () => {
        try {
            if (Object.keys(rascunhosComandaRef.current).length === 0) {
                localStorage.removeItem(chaveRascunhosV2);
            } else {
                localStorage.setItem(chaveRascunhosV2, JSON.stringify(rascunhosComandaRef.current));
            }
        } catch (_) {
            // Sem espaço ou localStorage bloqueado -- não trava o lançamento.
        }
    };

    const abrirProximaComandaLivre = () => {
        salvarRascunhoAtual();
        // CRÍTICO (achado 02/10/2026, "o C dentro do popup parou de
        // funcionar"): este laço não sabia de comandas com popup de sabor
        // PAUSADO (seletoresPausadosRef). Uma comanda recém-aberta cujo
        // ÚNICO conteúdo é um popup pausado (carrinho ainda vazio, sem
        // rascunho salvo) era considerada "livre" -- o C dentro do popup
        // acabava reabrindo A PRÓPRIA comanda que acabou de ser pausada, em
        // vez de ir para uma nova, parecendo que a tecla não fazia nada.
        for (let n = 1; n <= TOTAL_COMANDAS_V2; n++) {
            if (!tableStatuses[n] && !rascunhosComandaRef.current[n] && !seletoresPausadosRef.current[n]) {
                handleSelectTable(n.toString().padStart(2, '0'), `Comanda ${n}`);
                setIsComandaModalOpen(true);
                return;
            }
        }
        // Nenhum slot 100% livre: tenta um com rascunho pendente (melhor
        // reaproveitar do que travar o operador).
        for (let n = 1; n <= TOTAL_COMANDAS_V2; n++) {
            if (!tableStatuses[n]) {
                handleSelectTable(n.toString().padStart(2, '0'), `Comanda ${n}`);
                setIsComandaModalOpen(true);
                return;
            }
        }
        bipar('erro');
        setAvisoAtalho({ tipo: 'erro', titulo: 'Todas as 20 comandas estão ocupadas', detalhe: 'Feche alguma antes de abrir uma nova.' });
    };

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

    const balcaoV2 = !!settings?.balcaoV2;
    const categoriasVisiveis = useMemo(
        () => balcaoV2
            ? categories.filter(c => !CATEGORIAS_OCULTAS_NO_BALCAO_V2.some(t => normalizeString(c.name) === t))
            : categories,
        [categories, balcaoV2]
    );
    // V2: a aba "Promocoes" tambem sai (da barra, do "MAIS..." e da busca).
    const mostrarPromocoes = !balcaoV2;
    // Se a categoria selecionada deixou de existir na barra (ex.: era Promocoes), vai para a 1a visivel.
    useEffect(() => {
        if (!balcaoV2) return;
        const ok = categoriasVisiveis.some(c => c.id === selectedCategoryId);
        if (!ok && categoriasVisiveis.length > 0) setSelectedCategoryId(categoriasVisiveis[0].id);
    }, [balcaoV2, categoriasVisiveis, selectedCategoryId]);

    const normalizedPromotions = useMemo(() => {
        return (promotions || []).map(p => ({
            ...p,
            _normalizedName: normalizeString(p.name),
            _normalizedDesc: normalizeString(p.description || '')
        }));
    }, [promotions]);

    const filteredItems = useMemo(() => {
        // V2 (pedido do Ikarus, 06/10/2026): sem barra de categorias -- so a busca e a lista. Sem busca
        // mostra todos os produtos disponiveis em ordem de CODIGO (vira uma "colinha" na tela), menos os
        // das categorias que ele tirou do balcao; com busca, procura em tudo, por nome ou codigo.
        if (balcaoV2) {
            const termo = debouncedSearchTerm.trim();
            const termoNorm = normalizeString(termo);
            const soDigitos = /^\d+$/.test(termo);
            const idsOcultos = new Set(categories.filter(c => !categoriasVisiveis.includes(c)).map(c => c.id));
            return normalizedMenuData
                .filter(item => {
                    if (!item.isAvailable) return false;
                    if (!termo) return !idsOcultos.has(item.categoryId);
                    if (soDigitos && item.codigo != null && String(item.codigo).startsWith(termo)) return true;
                    return item._normalizedName.includes(termoNorm);
                })
                .sort((a, b) => (a.codigo ?? 1e9) - (b.codigo ?? 1e9) || a.name.localeCompare(b.name));
        }
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
        const showPromos = mostrarPromocoes && (debouncedSearchTerm || isPromoCategory);
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
    }, [normalizedMenuData, selectedCategoryId, debouncedSearchTerm, normalizedPromotions, mostrarPromocoes, balcaoV2, categories, categoriasVisiveis]);

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

    /** Mesmo filtro já usado no modal de adicionais (linha ~2770): produto com
     * selectedAddons próprios usa só esses; senão, qualquer addon da mesma
     * categoria. É o que decide se o código digitado abre o popup de sabor. */
    const opcoesDeSaborDoProduto = (produto: MenuItem): Addon[] => {
        // Lista PRÓPRIA do produto, mesmo VAZIA ("sem adicionais"): vale só ela -- igual ao
        // site. Antes, produto com lista vazia caía nos addons da CATEGORIA e abria popup
        // de sabor sem querer (ex.: o Milk Shake do salão e o picolé de açaí novos).
        // `allowedAddons` só é null/undefined quando o produto nunca teve lista própria.
        if (Array.isArray(produto.allowedAddons)) {
            const ids = new Set(produto.allowedAddons.map((e: any) => String(e && typeof e === 'object' ? e.id : e)));
            return addons.filter(a => ids.has(String(a.id)));
        }
        if (produto.selectedAddons?.length) {
            return addons.filter(a => produto.selectedAddons.some(sa => sa.id === a.id));
        }
        return addons.filter(a => a.categoryId === produto.categoryId);
    };

    /** Mesma regra do cardápio do site (CustomerPageModern): produto com
     * addons marcados como 'calda' ganha fluxo em 2 passos -- 1º sabor
     * (addonGroup 'sabor', se houver; senão a lista sem calda), 2º calda.
     * Produto sem nenhum addon 'calda' continua no fluxo único de sempre. */
    const montarEtapasDeSabor = (produto: MenuItem) => {
        const todos = opcoesDeSaborDoProduto(produto);
        const caldas = todos.filter(a => a.addonGroup === 'calda');
        const sabores = todos.filter(a => a.addonGroup === 'sabor');
        const temCalda = caldas.length > 0;
        if (!temCalda) {
            return { temCalda: false as const, etapa1: todos, caldas: [] as Addon[] };
        }
        const etapa1 = sabores.length > 0 ? sabores : todos.filter(a => a.addonGroup !== 'calda');
        return { temCalda: true as const, etapa1, caldas };
    };

    /** Decide como abrir o popup pra um produto: fluxo único (lista com
     * "Prosseguir sem adicional" no topo, MULTI-seleção com tecla S -- pedido
     * do Ikarus 02/10/2026, ex.: leite condensado + leite em pó no mesmo
     * açaí) ou os 2 passos de sabor+calda (esses continuam escolha única).
     * `null` = não precisa de popup nenhum (0 opções). */
    const montarSeletorInicial = (produto: MenuItem): typeof seletorSabor => {
        const { temCalda, etapa1 } = montarEtapasDeSabor(produto);
        // V2 (06/10/2026, "digito 300 e ja cai na comanda"): sabores/adicionais OPCIONAIS nao abrem
        // popup -- o produto entra direto, no preco dele. So o fluxo com CALDA (Milk Shake, kit sorvete
        // com calda) continua perguntando, porque la a escolha e obrigatoria. Opcionais podem ser
        // acrescentados depois no botao "Adds" da linha do carrinho.
        // 06/10/2026 (Ikarus: "540 caiu na comanda e acabou"): no V2 NENHUM produto abre popup -- nem o
        // Milk Shake 540. Sabor/calda/adicionais a cliente combina na hora e entram como ADD (333, 555...)
        // ou pelo botao "+ Adds" da linha do carrinho. O popup continua so no V1.
        if (balcaoV2Ref.current) return null;
        if (temCalda) {
            // Sabor+calda sempre abre popup, mesmo com 1 única opção em cada
            // etapa -- escolher calda é uma decisão de verdade (ex.: Chantilly
            // vs Leite Condensado), diferente do "pular" de um sabor único.
            return { produto, opcoes: [null, ...etapa1], indice: 0, etapa: 'sabor', marcados: new Set() };
        }
        if (etapa1.length >= 1) {
            return { produto, opcoes: [null, ...etapa1], indice: 0, etapa: 'unico', marcados: new Set() };
        }
        return null;
    };

    /** Lança o produto já com o(s) addon(s) embutido(s) -- usado pelo popup
     * de sabor/calda (Enter) e também quando só existe 1 opção (lança sem
     * perguntar). Aceita 1 ou 2 addons (sabor + calda). */
    const addToCartComSabor = (item: MenuItem, ...sabores: (Addon | null | undefined)[]) => {
        const selectedAddons = sabores.filter((s): s is Addon => !!s);
        setCart(prev => [...prev, {
            ...item,
            cartId: `${item.id}-${Date.now()}`,
            quantity: 1,
            notes: '',
            selectedAddons,
            isCombo: false
        }]);
    };

    /** Ordem VISUAL dos índices do popup: "sem adicional" primeiro, depois
     * opcionais (grátis), depois adicionais (pagos) -- mesmo agrupamento que
     * o JSX usa pra exibir em seções. Achado 02/10/2026: a navegação por seta
     * seguia a ordem CRUA do array (como vieram do banco, intercalados), que
     * não bate com a ordem visual das seções -- o cursor "pulava" de um jeito
     * que parecia nunca alcançar os opcionais. Agora ↑↓ anda na mesma ordem
     * que o operador VÊ na tela. */
    const ordemVisualDoSeletor = (opcoes: (Addon | null)[]): number[] => {
        const semAdicional: number[] = [];
        const opcionais: number[] = [];
        const adicionais: number[] = [];
        opcoes.forEach((addon, idx) => {
            if (addon === null) semAdicional.push(idx);
            else if (Number(addon.price) === 0) opcionais.push(idx);
            else adicionais.push(idx);
        });
        return [...semAdicional, ...opcionais, ...adicionais];
    };

    /** Marca/desmarca um opcional/adicional no popup -- usado tanto pelo
     * atalho S (teclado) quanto pelo clique direto no item (pedido do Ikarus
     * 02/10/2026: "os opcionais grátis não tão funcionando nem clicando" --
     * antes só dava pra marcar navegando até o item com a seta e apertando
     * S; clicar direto não fazia nada). Só vale na etapa 'unico' e fora do
     * "Prosseguir sem adicional" (índice 0). Também move o cursor pro item
     * clicado, pra Enter/S seguintes já operarem nele.
     */
    const alternarMarcacaoSeletor = (idx: number) => {
        setSeletorSabor(prev => {
            if (!prev || prev.etapa !== 'unico' || idx === 0) return prev;
            const marcados = new Set(prev.marcados);
            if (marcados.has(idx)) marcados.delete(idx); else marcados.add(idx);
            return { ...prev, marcados, indice: idx };
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

    const handleScaleItemAdd = (weightKg: number, name: string, pricePerKg: number, notes: string = '') => {
        const totalPrice = Number((weightKg * pricePerKg).toFixed(2));
        const newItem: CartItem = {
            id: -Date.now(),
            name: `${name} (${weightKg.toFixed(3).replace('.', ',')} kg)`,
            description: `Pesagem: R$ ${pricePerKg.toFixed(2)}/kg`,
            price: totalPrice,
            categoryId: -1,
            eligibleForCombo: false,
            isCombo: false,
            selectedAddons: [],
            store_id: storeId,
            isAvailable: true,
            cartId: `scale-${Date.now()}`,
            quantity: 1,
            notes: notes,
            weightKg: weightKg,
            pricePerKg: pricePerKg
        };
        setCart(prev => [...prev, newItem]);
    };

    /**
     * Confirma o peso digitado no modal da Balança e joga no carrinho --
     * extraida do onClick do botao "Adicionar ao Pedido" para o ENTER
     * dentro do campo de peso poder chamar a MESMA logica, sem duplicar
     * (pedido do Ikarus, 28/09/2026: "da enter pra agir como adicionar ao
     * pedido"). Depois disso o fluxo de vincular a mesa continua igual,
     * sem mudanca nenhuma.
     */
    // Trava SINCRONA (06/10/2026, print do Ikarus: varios Enter no campo de peso lancavam 4 itens
    // iguais): o modal so fecha no proximo render e, ate la, cada Enter chamava esta funcao de novo
    // com o mesmo peso. Vale 1 confirmacao por abertura do modal.
    const pesoManualConfirmadoRef = useRef(false);
    useEffect(() => { if (isScaleModalOpen) pesoManualConfirmadoRef.current = false; }, [isScaleModalOpen]);

    const confirmarPesoManual = () => {
        if (pesoManualConfirmadoRef.current) return;
        if (!manualWeight || manualWeight <= 0) {
            alert('Por favor, informe ou capture um peso válido.');
            return;
        }
        pesoManualConfirmadoRef.current = true;
        handleScaleItemAdd(manualWeight, scaleItemName || 'Açaí/Sorvete por Quilo', scalePricePerKg || 60);
        setIsScaleModalOpen(false);
    };

    const handleLaunchScaleItemToOrder = (weightKg: number) => {
        if (!weightKg || weightKg <= 0) return;
        // V2: o mesmo prato nao e lancado duas vezes -- so depois que a balanca passar por zero
        // (mesma regra que o Enter ja seguia; o clique repetido no botao nao a respeitava).
        if (balcaoV2Ref.current && pesoLancadoRef.current) return;
        const currentPricePerKg = scalePricePerKg || 60;
        const itemName = scaleItemName || 'Açaí/Sorvete por Quilo';
        handleScaleItemAdd(weightKg, itemName, currentPricePerKg);
        // Clique e Enter passam por aqui: os dois marcam o peso como lançado.
        pesoLancadoRef.current = true;
        setPesoLancado(true);

        setNotification({
            show: true,
            message: `Item de Balança (${weightKg.toFixed(3)}kg - R$ ${(weightKg * currentPricePerKg).toFixed(2)}) adicionado ao pedido!`,
            type: 'success'
        });

        // No Balcão V2 nunca existe mesa/nome de verdade -- abrir o modal de
        // Selecionar Mesa (conceito do V1) por cima da tela de comanda não
        // faz sentido nesse modo. Achado pela auditoria de 30/09/2026.
        if (!settings?.balcaoV2 && !selectedTable && !customerName) {
            setIsTableModalOpen(true);
        }
    };

    /**
     * Lança o peso da balança direto numa mesa, pelo teclado.
     * `forcarReabertura` = o operador confirmou com ESC numa mesa que já
     * pediu a conta: reabrimos a mesa e lançamos.
     */
    const lancarPesoNaMesa = (numeroMesa: number, forcarReabertura = false) => {
        // No V2 os slots vão de 1 a 20 (TOTAL_COMANDAS_V2), não 30 -- e o
        // texto é "Comanda", nunca "Mesa". Achado em 30/09/2026, print do
        // Ikarus mostrando "Mesa 1/2/3" dentro do fluxo de comandas.
        const limiteMaximo = balcaoV2Ref.current ? TOTAL_COMANDAS_V2 : TOTAL_MESAS;
        const rotulo = balcaoV2Ref.current ? 'Comanda' : 'Mesa';
        if (numeroMesa < 1 || numeroMesa > limiteMaximo) {
            bipar('erro');
            setAvisoAtalho({ tipo: 'erro', titulo: `${rotulo} ${numeroMesa} não existe`, detalhe: `${balcaoV2Ref.current ? 'As comandas vão' : 'As mesas vão'} de 1 a ${limiteMaximo}.` });
            return;
        }

        // O atalho serve a DOIS fluxos:
        //  a) peso na balança (açaí por quilo)
        //  b) itens já escolhidos no carrinho (picolé, refrigerante...)
        // Exigir peso sempre travava o caso (b), que e igualmente comum no balcao.
        const temPeso = scaleWeight > 0 && isScaleStable;
        const temCarrinho = cart.length > 0;

        if (!temPeso && !temCarrinho) {
            bipar('erro');
            setAvisoAtalho({
                tipo: 'erro',
                titulo: 'Nada para lançar',
                detalhe: 'Coloque o produto na balança ou escolha itens no cardápio.'
            });
            return;
        }

        const statusMesa = tableStatuses[numeroMesa];
        const mesaOcupada = !!statusMesa;

        // Conta já solicitada: não lançar por engano no meio do fechamento.
        // ESC confirma, reabre a mesa e lança.
        if (statusMesa === 'Conta Solicitada' && !forcarReabertura) {
            bipar('erro');
            setAvisoAtalho({
                tipo: 'confirmar',
                mesa: numeroMesa,
                titulo: `${rotulo} ${numeroMesa} está fechando a conta`,
                detalhe: `Pressione ESC para reabrir ${balcaoV2Ref.current ? 'a comanda' : 'a mesa'} e lançar mesmo assim.`
            });
            return;
        }

        const precoKg = scalePricePerKg || 60;

        setSelectedTable(String(numeroMesa));
        setOrderType('Balcão');

        // Valor do que ja esta no carrinho (picole, refri, itens do cardapio).
        const valorCarrinho = cart.reduce((soma, item) => {
            const preco = Number(item.price) || 0;
            const qtd = Number(item.quantity) || 1;
            const adicionais = (item.selectedAddons || [])
                .reduce((s: number, a: any) => s + (Number(a.price) || 0), 0);
            return soma + (preco + adicionais) * qtd;
        }, 0);

        // So adiciona o item de balanca se houver peso; senao vai so o carrinho.
        const valorPeso = temPeso ? scaleWeight * precoKg : 0;
        if (temPeso) {
            handleScaleItemAdd(scaleWeight, scaleItemName || 'Açaí/Sorvete por Quilo', precoKg);
            pesoLancadoRef.current = true;
            setPesoLancado(true);
        }

        const valor = valorPeso + valorCarrinho;

        // Descricao do que foi lancado, conforme o caso.
        const descricao = temPeso && valorCarrinho > 0
            ? `${scaleWeight.toFixed(3)} kg + ${cart.length} item(ns)`
            : temPeso
                ? `${scaleWeight.toFixed(3)} kg`
                : `${cart.length} item(ns)`;

        // O pedido NAO e enviado aqui. O operador confere o aviso e aperta ENTER
        // de novo (ou F2) para enviar — decisao do Icaro: um toque a mais em
        // troca da chance de perceber a mesa errada antes de gravar.
        if (mesaOcupada) {
            // Mesa ocupada = normalmente a segunda rodada da mesma mesa.
            // Somamos, mas deixamos MUITO claro que já havia pedido lá.
            const jaNaMesa = activeOrders
                .filter(o => mesmaMesa(o.table_number, numeroMesa))   // banco devolve string
                .reduce((s, o) => s + (o.total || 0), 0);
            bipar('somou');
            setAvisoAtalho({
                tipo: 'enviar',
                mesa: numeroMesa,
                titulo: `${rotulo.toUpperCase()} ${numeroMesa} · +${descricao} · R$ ${valor.toFixed(2)}`,
                detalhe: `${rotulo} já tinha R$ ${jaNaMesa.toFixed(2)} · Ficará R$ ${(jaNaMesa + valor).toFixed(2)}  —  ENTER confirma · ESC cancela`
            });
        } else {
            bipar('ok');
            setAvisoAtalho({
                tipo: 'enviar',
                mesa: numeroMesa,
                titulo: `${rotulo.toUpperCase()} ${numeroMesa} · ${descricao} · R$ ${valor.toFixed(2)}`,
                detalhe: 'ENTER confirma e envia · ESC cancela'
            });
        }
    };

    // O handler precisa enxergar o estado ATUAL (carrinho, peso, aviso...), mas
    // reinstalar o listener a cada render deixava o app lento (o F4 chegava a
    // demorar ~1 min). Guardamos a versão atual numa ref e registramos o
    // listener UMA única vez.
    const handlerTecladoRef = useRef<(e: KeyboardEvent) => void>(() => {});

    // Espelho síncrono de "algum modal está aberto". Atualizado no corpo do
    // render (não em useEffect) para nunca ficar um ciclo atrás do estado.
    const modalAbertoRef = useRef(false);
    modalAbertoRef.current = isTableModalOpen || isCustomItemModalOpen ||
                             isScaleModalOpen || isCategoryModalOpen || isAddonModalOpen ||
                             // CRÍTICO (achado 02/10/2026): CheckoutModal/SplitBillModal
                             // são renderizados pelo AdminPage, fora desta árvore -- sem
                             // isto, Enter dentro do checkout (pra confirmar pagamento)
                             // também disparava handleFinalize() do Balcão por baixo.
                             !!modalExternoAberto;

    // Espelho do campo de nome, tambem atualizado no corpo do render.
    // Sem isto o handler lia `nomeAberto` da closure (um ciclo atras), nao saia
    // cedo, e o preventDefault() abaixo engolia as teclas — o campo abria mas
    // nao aceitava digitar nem clique. Ver Regra 10.
    const nomeAbertoRef = useRef(false);
    nomeAbertoRef.current = nomeAberto;

    // Balcão V2: espelhos síncronos (Regra 10), mesmo motivo dos de cima.
    const balcaoV2Ref = useRef(false);
    balcaoV2Ref.current = !!settings?.balcaoV2;
    const cartRef = useRef<CartItem[]>([]);
    cartRef.current = cart;
    // CRÍTICO (achado pela auditoria de 01/10/2026): `avisoAtalho` era lido
    // DIRETO da closure em ~9 pontos de aoTeclar, sem ref -- violação da
    // Regra 10 que `scripts/checar-atalhos.cjs` não pegava porque sua lista
    // fixa de proibidos nunca incluiu este estado. Hoje "funciona" só porque
    // o useEffect de registro roda em todo render (sem array de deps) e
    // recaptura o avisoAtalho atual -- mas é frágil: qualquer refactor futuro
    // que adicione deps parciais a esse efeito faria o handler voltar a
    // enxergar um avisoAtalho de um ciclo atrás, sem o lint acusar nada.
    const avisoAtalhoRef = useRef<typeof avisoAtalho>(null);
    avisoAtalhoRef.current = avisoAtalho;
    // CRÍTICO (achado pela auditoria de 02/10/2026): handleFinalize é async
    // (await no Supabase) e `isProcessing` nunca era checado pela tecla C --
    // apertar C enquanto um envio ainda estava em voo podia reabrir a MESMA
    // comanda com `salvarRascunhoAtual` gravando os mesmos itens que estavam
    // sendo persistidos, ou (voltando rápido pra essa comanda) disparar um
    // reenvio duplicado no banco. Mesmo critério já usado pra avisoAtalho
    // 'confirmar'/'enviar': C fica bloqueado enquanto isProcessing for true.
    const isProcessingRef = useRef(false);
    isProcessingRef.current = isProcessing;
    // Pedido do Ikarus 04/10/2026: "abre C de comanda e tem peso na balança
    // automática, o certo é dar 1 Enter e já lançar esse peso na comanda
    // aberta -- hoje só funciona no clique". Refs de Regra 10, lidas dentro
    // do handler de teclado.
    const scaleWeightRef = useRef(0);
    scaleWeightRef.current = scaleWeight;
    const isScaleStableRef = useRef(false);
    isScaleStableRef.current = isScaleStable;
    // Peso JÁ LANÇADO (05/10/2026): enquanto o prato continua na balança, o Enter
    // seguinte envia a comanda em vez de lançar o mesmo peso de novo. Só volta a
    // valer "peso novo" quando a balança passa por zero (prato retirado) --
    // ver utils/pesoBalanca.ts. Ref para o handler de teclado (Regra 10) + state
    // para o aviso na tela.
    const pesoLancadoRef = useRef(false);
    const [pesoLancado, setPesoLancado] = useState(false);
    const ultimoAvisoEstabilizarRef = useRef<number | undefined>(undefined);
    const pedidosDaMesaRef = useRef<Order[]>([]);
    pedidosDaMesaRef.current = pedidosDaMesa;
    // Comanda aberta AGORA (atualizada no corpo do render, Regra 10): o envio e assincrono e o
    // operador pode ter trocado de comanda ate ele terminar -- so limpa a tela se ainda e a mesma.
    const selectedTableRef = useRef('');
    selectedTableRef.current = selectedTable;
    // Trava SINCRONA do envio (auditoria 05/10/2026, pedidos #8-#11): Enter/F7/F8 repetidos
    // criavam varios pedidos iguais. Ver utils/envioUnico.ts.
    const envioUnicoRef = useRef(criarEnvioUnico<boolean>());
    // Itens que ja viraram sub-pedido nesta comanda mas cujo restante do envio falhou: no reenvio
    // NAO viram sub-pedido de novo.
    const cartIdsJaEnviadosRef = useRef<Set<string>>(new Set());
    const abrirProximaComandaLivreRef = useRef<() => void>(() => {});
    abrirProximaComandaLivreRef.current = abrirProximaComandaLivre;
    const isRenomeandoComandaRef = useRef(false);
    isRenomeandoComandaRef.current = isRenomeandoComanda;
    const isComandaModalOpenRef = useRef(false);
    isComandaModalOpenRef.current = isComandaModalOpen;
    /**
     * Fecha a tela da comanda ativa e volta para a lista. Se tiver item não
     * enviado, salva no cache de rascunhos ANTES de esconder o modal --
     * senão o carrinho "em standby" se perdia ao apertar X (achado em
     * 30/09/2026, relato do Ikarus: montar a Comanda 3, trocar, voltar e
     * achar vazia).
     */
    const fecharComandaAtivaRef = useRef<() => void>(() => {});
    fecharComandaAtivaRef.current = () => { salvarRascunhoAtual(); setIsComandaModalOpen(false); };

    // F7 (global, AdminPage) terminou um checkout da comanda ativa com
    // sucesso -- fecha a tela sozinha, sem salvar rascunho (o pedido já virou
    // 'Entregue', não há mais nada a enviar). Ignora o primeiro valor (0 ou
    // undefined, antes de qualquer F7 acontecer).
    const primeiroFecharSignal = useRef(true);
    useEffect(() => {
        if (primeiroFecharSignal.current) { primeiroFecharSignal.current = false; return; }
        // CRÍTICO (achado em 02/10/2026, print do Ikarus: "fechei a Comanda 5
        // pelo F7/F8, sumiu dos Pedidos, mas voltou PENDENTE no Balcão"): o
        // checkout feito via F7/F8 roda inteiro no AdminPage, fora do
        // handleFinalize -- então o `delete rascunhosComandaRef.current[...]`
        // que limpa o cache ao enviar NUNCA rodava nesse caminho. Se o slot
        // tinha um rascunho salvo de antes (ex.: o operador passou por outras
        // comandas antes de fechar esta), ele sobrava no cache. Como o pedido
        // vira 'Entregue' e some de activeOrders, o rascunho esquecido virava
        // a ÚNICA fonte pra aquele slot -- e cardsComandas lia isso como
        // "ainda tem algo pendente", mesmo já pago. Mesmo número que estava
        // ativo no momento do fechamento (só se fecha via F7/F8 a comanda
        // ativa) -- limpa o cache dela também, não só a tela.
        const numero = parseInt(selectedTable, 10);
        if (!isNaN(numero)) {
            delete rascunhosComandaRef.current[numero];
            persistirRascunhos();
            setVersaoRascunhos(v => v + 1);
        }
        setIsComandaModalOpen(false);
        // CRÍTICO (achado 02/10/2026, "a comanda só some do Balcão se eu
        // trocar de aba e voltar"): cardsComandas adiciona `numeroAtivo`
        // (= parseInt(selectedTable)) na lista de slots a mostrar SEMPRE que
        // ele é um número válido 1-20, mesmo sem pedido nem rascunho --
        // porque isso é o que faz a comanda recém-ABERTA aparecer na lista
        // antes de ter item. Sem zerar `selectedTable` aqui, ele continuava
        // apontando pro slot que acabou de ser pago, e o card dele continuava
        // sendo calculado e exibido até o próximo re-render forçado por outra
        // causa (como trocar de aba, que remonta o componente do zero).
        setSelectedTable('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fecharComandaSignal]);
    /**
     * Setas ↑↓ (Balcão V2): anda entre os slots 1-20 que têm pedido aberto
     * (mesmo `tableStatuses` que a grade de mesas do V1 usa). Slot vazio não
     * entra no ciclo -- não tem pra onde "voltar".
     */
    const navegarComandaRef = useRef<(direcao: 1 | -1) => void>(() => {});
    navegarComandaRef.current = (direcao: 1 | -1) => {
        // Inclui slots com pedido no banco, rascunho não-enviado (cache
        // local) E popup de sabor pausado -- achado pela auditoria de
        // 02/10/2026 (CRÍTICO): faltava `seletoresPausadosRef` aqui, mesmo
        // já corrigido em cardsComandas/abrirProximaComandaLivre. Sem isto,
        // uma comanda com popup pausado e carrinho ainda vazio (popup era o
        // primeiro item) era pulada pelas setas -- só dava pra voltar a ela
        // digitando o número direto ou clicando no card.
        const ocupados = Array.from(new Set([
            ...Object.keys(tableStatuses).map(Number),
            ...Object.keys(rascunhosComandaRef.current).map(Number),
            ...Object.keys(seletoresPausadosRef.current).map(Number),
        ])).filter(n => n >= 1 && n <= TOTAL_COMANDAS_V2).sort((a, b) => a - b);
        if (ocupados.length === 0 || isProcessingRef.current) return;
        const atual = parseInt(selectedTable, 10);
        const posAtual = ocupados.indexOf(atual);
        const proxima = posAtual === -1 ? 0 : (posAtual + direcao + ocupados.length) % ocupados.length;
        const numero = ocupados[proxima];
        if (numero === atual) return;
        salvarRascunhoAtual();
        handleSelectTable(numero.toString().padStart(2, '0'), `Comanda ${numero}`);
        setIsComandaModalOpen(true);
    };

    // Captura das teclas. Ignorada enquanto o foco está num campo de texto
    // (o operador pode estar digitando nome/observação) e com modal aberto.
    useEffect(() => {
        const aoTeclar = (e: KeyboardEvent) => {
            // Digitando num campo? Sai ANTES de marcar o evento. Marcar aqui
            // fazia o campo de nome (tecla N) parecer bloqueado: o evento saía
            // marcado daqui e o handler do próprio input o descartava.
            const alvo = e.target as HTMLElement | null;
            const digitando = !!alvo && (
                alvo.tagName === 'INPUT' ||
                alvo.tagName === 'TEXTAREA' ||
                alvo.isContentEditable
            );
            // Lê da REF, não da closure. O handler vive numa ref atualizada a
            // cada render; se ela ficasse defasada por um ciclo, o handler
            // antigo não sabia que o modal tinha aberto e o preventDefault()
            // abaixo engolia as teclas — foi o que travou a digitação no
            // "Item Avulso".
            // Campo de nome aberto: TODAS as teclas sao dele. O proprio input
            // trata ENTER e ESC no onKeyDown.
            if (nomeAbertoRef.current) return;

            // Popup de sabor (Balcão V2, pedido do Ikarus 01/10/2026: "tudo
            // por comando, não vamos usar clique de hora nenhuma"). Prioridade
            // MÁXIMA -- intercepta ↑↓/Enter/ESC antes de qualquer outro atalho,
            // mesmo com digitando=true (foco pode ter ficado em algum input
            // residual) e mesmo com modalAbertoRef (não usa isAddonModalOpen).
            if (seletorSaborRef.current) {
                const sel = seletorSaborRef.current;
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    // Navega na ORDEM VISUAL (sem-adicional → opcionais →
                    // adicionais), não na ordem crua do array -- pedido do
                    // Ikarus 02/10/2026: "não consigo navegar nos opcionais
                    // com as setas". Trava nas pontas (sem voltar ao início) --
                    // "vamos travar o fim da lista, hoje eu volto ao começo".
                    const ordem = ordemVisualDoSeletor(sel.opcoes);
                    const posAtual = ordem.indexOf(sel.indice);
                    const proxPos = posAtual + (e.key === 'ArrowDown' ? 1 : -1);
                    if (proxPos < 0 || proxPos >= ordem.length) return; // já na ponta, não faz nada
                    setSeletorSabor({ ...sel, indice: ordem[proxPos] });
                    return;
                }
                // S: marca/desmarca o opcional/adicional atual -- pedido do
                // Ikarus 02/10/2026 ("leite condensado E leite em pó no mesmo
                // açaí"). Só vale na etapa 'unico' (lista plana sem grupo
                // sabor/calda); sabor/calda continuam escolha única por Enter.
                // "Prosseguir sem adicional" (índice 0) não marca -- não faz
                // sentido junto com outras marcações.
                if (e.key.toUpperCase() === 'S' && sel.etapa === 'unico' && sel.indice > 0) {
                    e.preventDefault();
                    alternarMarcacaoSeletor(sel.indice);
                    bipar('ok');
                    return;
                }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const escolhaAtual = sel.opcoes[sel.indice];
                    if (sel.etapa === 'sabor') {
                        // Sabor+calda (ex.: Milkshake): 1ª etapa escolhida,
                        // agora mostra a lista de calda -- mesmo fluxo em 2
                        // passos que já existe no cardápio do site.
                        const { caldas } = montarEtapasDeSabor(sel.produto);
                        setSeletorSabor({
                            produto: sel.produto,
                            opcoes: [null, ...caldas],
                            indice: 0,
                            etapa: 'calda',
                            saborEscolhido: escolhaAtual,
                            marcados: new Set(),
                        });
                        bipar('ok');
                        return;
                    }
                    if (sel.etapa === 'unico') {
                        // Lança com TODOS os marcados (S) de uma vez. Se nada
                        // foi marcado, Enter na opção atual funciona como
                        // atalho rápido (equivalente a marcar só ela) -- cobre
                        // o caso comum de "só este aqui" sem precisar S+Enter.
                        const addonsEscolhidos = sel.marcados.size > 0
                            ? Array.from(sel.marcados).map(i => sel.opcoes[i]).filter((a): a is Addon => !!a)
                            : (escolhaAtual ? [escolhaAtual] : []);
                        if (sel.produto.saboresComQuantidade && addonsEscolhidos.length > 1) {
                            // Picolés: o preço está no PRODUTO e cada sabor é
                            // uma unidade -- vários sabores viram uma linha por
                            // sabor (senão cobraria 1 picolé só pelos 3).
                            const agora = Date.now();
                            setCart(prev => [...prev, ...addonsEscolhidos.map((a, i) => ({
                                ...sel.produto,
                                cartId: `${sel.produto.id}-${a.id}-${agora}-${i}`,
                                quantity: 1,
                                notes: '',
                                selectedAddons: [a],
                                isCombo: false,
                            }))]);
                        } else {
                            addToCartComSabor(sel.produto, ...addonsEscolhidos);
                        }
                        setSeletorSabor(null);
                        bipar('ok');
                        return;
                    }
                    // etapa 'calda': última escolha, lança no carrinho.
                    addToCartComSabor(sel.produto, sel.saborEscolhido, escolhaAtual);
                    setSeletorSabor(null);
                    bipar('ok');
                    return;
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    if (sel.etapa === 'calda') {
                        // Volta pro passo de sabor em vez de fechar tudo --
                        // evita perder a escolha de sabor por engano ao tentar
                        // só corrigir a calda.
                        const { etapa1 } = montarEtapasDeSabor(sel.produto);
                        setSeletorSabor({ produto: sel.produto, opcoes: [null, ...etapa1], indice: 0, etapa: 'sabor', marcados: new Set() });
                        return;
                    }
                    setSeletorSabor(null);
                    return;
                }
                // C: PAUSA este popup (guarda produto/opções/índice/marcados)
                // e abre a próxima comanda livre -- pedido do Ikarus
                // 02/10/2026: "o cliente não decidiu ainda, atender outro
                // enquanto isso". Ao reabrir esta comanda depois, o popup
                // volta exatamente do mesmo ponto.
                if (balcaoV2Ref.current && e.key.toUpperCase() === 'C' && !isProcessingRef.current) {
                    e.preventDefault();
                    const numeroPausado = parseInt(selectedTable, 10);
                    if (!isNaN(numeroPausado)) {
                        seletoresPausadosRef.current[numeroPausado] = sel;
                    }
                    setSeletorSabor(null);
                    abrirProximaComandaLivreRef.current();
                    return;
                }
                // Qualquer outra tecla enquanto o popup está aberto é
                // ignorada -- não deixa vazar pro resto do handler (ex.:
                // dígitos abrindo outra comanda por baixo do popup).
                return;
            }

            if (digitando || modalAbertoRef.current) return;

            // F4/F5/F6/F7/F8 sao da NAVEGACAO (AdminPage). Sair antes de
            // marcar o evento — senao o F4 falhava de forma intermitente,
            // dependendo de qual listener rodava primeiro. F7/F8 adicionados
            // em 01/10/2026: checkout rápido e dividir conta da comanda
            // (pedido do Ikarus, "não sair da mesma tela") -- sem essa
            // exclusão aqui, o handler do Balcão podia marcar o evento como
            // tratado antes do listener global (AdminPage) conseguir agir.
            if (e.key === 'F4' || e.key === 'F5' || e.key === 'F6' || e.key === 'F7' || e.key === 'F8') return;

            // Trava anti-duplicidade (ver comentário no addEventListener):
            // o mesmo evento chegava duas vezes e o produto entrava em dobro.
            if ((e as any).__pdvTratado) return;
            (e as any).__pdvTratado = true;

            // C: abre uma comanda nova (Balcão V2 apenas). Só bloqueia com
            // avisos que aguardam decisão de verdade, mesmo critério do R/B.
            // Também bloqueia com um handleFinalize em voo (isProcessing) --
            // achado pela auditoria de 02/10/2026, ver comentário na
            // declaração de isProcessingRef.
            if (balcaoV2Ref.current && e.key.toUpperCase() === 'C' &&
                avisoAtalhoRef.current?.tipo !== 'confirmar' && avisoAtalhoRef.current?.tipo !== 'enviar' &&
                !isProcessingRef.current) {
                e.preventDefault();
                abrirProximaComandaLivreRef.current();
                return;
            }

            // X: fecha a comanda ativa e volta pra lista de comandas (Balcão
            // V2 apenas, pedido do Ikarus em 30/09 -- atalho do botão X do
            // canto, que hoje só é clicável com mouse). Salva antes de sair.
            if (balcaoV2Ref.current && isComandaModalOpenRef.current && e.key.toUpperCase() === 'X' &&
                avisoAtalhoRef.current?.tipo !== 'confirmar' && avisoAtalhoRef.current?.tipo !== 'enviar') {
                e.preventDefault();
                fecharComandaAtivaRef.current();
                return;
            }

            // ESC: confirma a reabertura de mesa com conta solicitada,
            // ou simplesmente limpa o que estiver pendente na tela.
            if (e.key === 'Escape') {
                if (avisoAtalhoRef.current?.tipo === 'confirmar' && avisoAtalhoRef.current.mesa) {
                    e.preventDefault();
                    lancarPesoNaMesa(avisoAtalhoRef.current.mesa, true);
                    return;
                }
                // Cancelando um pedido montado: desfaz tambem o carrinho e a
                // mesa, senao sobraria item "solto" para o proximo lancamento.
                if (avisoAtalhoRef.current?.tipo === 'enviar') {
                    e.preventDefault();
                    setCart([]);
                    setSelectedTable('');
                    setPedidosDaMesa([]);
                    setCustomerName('');
                    setNomeAberto(false);
                    setAvisoAtalho({ tipo: 'erro', titulo: 'Cancelado', detalhe: 'Nada foi enviado.' });
                    definirTeclasMesa('');
                    return;
                }
                definirTeclasMesa('');
                setAvisoAtalho(null);
                // Balcão V2: ESC só fecha a tela da comanda se ela estiver
                // VAZIA (nada lançado ainda) -- pedido do Ikarus, 30/09: com
                // item no carrinho, ESC deve continuar limpando/cancelando
                // (igual ao V1), não some da tela sem avisar. O carrinho
                // sendo lido do cartRef evita fechar com base num estado
                // de um ciclo atrás (Regra 10).
                if (balcaoV2Ref.current && isComandaModalOpenRef.current && cartRef.current.length === 0) {
                    setIsComandaModalOpen(false);
                }
                return;
            }

            if (/^[0-9]$/.test(e.key)) {
                e.preventDefault();
                const novoValor = (teclasMesaRef.current + e.key).slice(0, 4); // mesa: 2 dígitos · código: até 4
                definirTeclasMesa(novoValor);
                setAvisoAtalho(null);

                // Popup de sabor (Balcão V2): assim que o código digitado bate
                // com um produto de verdade, SEM esperar Enter -- pedido do
                // Ikarus 01/10/2026 ("assim que digitar o código do produto já
                // aparece o popup"). Só dispara aqui se tiver 2+ sabores: com 0
                // ou 1, o fluxo normal do Enter (abaixo) já lança direto.
                //
                // 06/10/2026 (Ikarus: "bateu o codigo, caiu. Eu nao quero o Enter"): no V2, dentro da comanda,
                // o codigo COMPLETO ja lanca o produto na hora. O ENTER seguinte (com nada digitado) envia a
                // comanda. So espera Enter se o codigo for prefixo de outro maior (ex.: 100 e 1000) -- hoje
                // todos tem 3 digitos, entao nao ha ambiguidade.
                if (balcaoV2Ref.current && isComandaModalOpenRef.current) {
                    const resolucao = resolverCodigoDigitado(novoValor, menuItems);
                    if (resolucao.tipo === 'lancar' || resolucao.tipo === 'indisponivel') {
                        definirTeclasMesa('');
                        const produtoBatido = resolucao.produto;
                        if (resolucao.tipo === 'indisponivel') {
                            bipar('erro');
                            setAvisoAtalho({ tipo: 'erro', titulo: `${produtoBatido.name}`, detalhe: 'Produto está indisponível.' });
                            return;
                        }
                        const seletor = montarSeletorInicial(produtoBatido);
                        if (seletor) setSeletorSabor(seletor);
                        else { addToCart(produtoBatido); ultimoCodigoLancadoEmRef.current = Date.now(); }
                        bipar('ok');
                    } else if (resolucao.tipo === 'nao-encontrado') {
                        definirTeclasMesa('');
                        bipar('erro');
                        setAvisoAtalho({ tipo: 'erro', titulo: `Código ${resolucao.numero} não encontrado`, detalhe: 'Nenhum produto tem este código.' });
                    }
                }
                return;
            }

            // Setas ↑↓: navega entre as comandas em andamento (Balcão V2),
            // na ordem em que foram criadas. Só fora do modal de comanda —
            // dentro dele as setas não têm uso hoje, então não colide.
            if (balcaoV2Ref.current && !isComandaModalOpenRef.current &&
                (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault();
                navegarComandaRef.current(e.key === 'ArrowDown' ? 1 : -1);
                return;
            }

            // R: lança como RETIRADA (sem mesa). Mesmo fluxo da mesa, mas o
            // pedido não fica preso a um número — o cliente leva embora.
            //
            // BUG achado em 29/09/2026 (Ikarus testou e sentiu "travado"):
            // a condicao antiga era `!avisoAtalho` puro -- bloqueava o R
            // enquanto o aviso 'ok' (ex: "Adicionado. Digite a mesa e ENTER
            // para lançar", que aparece por ~3.5s apos codigo+Enter) ainda
            // estava na tela. Como 'ok' e' so informativo (nao exige decisao
            // do operador, diferente de 'confirmar'/'enviar'), bloquear o R
            // por causa dele fazia o atalho parecer travado por segundos,
            // ate o aviso sumir sozinho. Corrigido: R so' e' bloqueado pelos
            // avisos que REALMENTE aguardam decisao ('confirmar'/'enviar').
            if (e.key.toUpperCase() === 'R' && avisoAtalhoRef.current?.tipo !== 'confirmar' && avisoAtalhoRef.current?.tipo !== 'enviar') {
                e.preventDefault();
                const temPesoR = scaleWeight > 0 && isScaleStable;
                if (!temPesoR && cart.length === 0) {
                    bipar('erro');
                    setAvisoAtalho({ tipo: 'erro', titulo: 'Nada para lançar', detalhe: 'Coloque o produto na balança ou escolha itens.' });
                    return;
                }

                setSelectedTable('');
                setOrderType('Retirada');

                const precoKgR = scalePricePerKg || 60;
                const valorCarrinhoR = cart.reduce((soma, item) => {
                    const preco = Number(item.price) || 0;
                    const qtd = Number(item.quantity) || 1;
                    const add = (item.selectedAddons || []).reduce((t: number, a: any) => t + (Number(a.price) || 0), 0);
                    return soma + (preco + add) * qtd;
                }, 0);
                const valorPesoR = temPesoR ? scaleWeight * precoKgR : 0;
                if (temPesoR) {
                    handleScaleItemAdd(scaleWeight, scaleItemName || 'Açaí/Sorvete por Quilo', precoKgR);
                    pesoLancadoRef.current = true;
                    setPesoLancado(true);
                }

                const descR = temPesoR && valorCarrinhoR > 0
                    ? `${scaleWeight.toFixed(3)} kg + ${cart.length} item(ns)`
                    : temPesoR ? `${scaleWeight.toFixed(3)} kg` : `${cart.length} item(ns)`;

                bipar('ok');
                definirTeclasMesa('');
                setAvisoAtalho({
                    tipo: 'enviar',
                    titulo: `RETIRADA · ${descR} · R$ ${(valorPesoR + valorCarrinhoR).toFixed(2)}`,
                    detalhe: 'ENTER confirma e envia · N para dar um nome · ESC cancela'
                });
                return;
            }

            // B: abre o modal da Balança para pesagem MANUAL -- atalho pedido
            // pelo Ikarus, 28/09/2026, para nao depender do clique do mouse.
            //
            // BUG achado em 29/09/2026 (mesmo da tecla R, Ikarus testou e
            // reproduziu com produto+balanca junto): a condicao antiga
            // (`!avisoAtalho` puro) bloqueava B enquanto o aviso 'ok'
            // (informativo, "Adicionado...") ainda estava na tela por ~3.5s.
            // Numa loja com fila, o operador quer lancar produto E peso em
            // sequencia rapida, sem esperar o aviso anterior sumir sozinho.
            // Corrigido: so' bloqueia nos avisos que aguardam decisao de
            // verdade ('confirmar'/'enviar') -- mesmo criterio ja usado no R.
            if (e.key.toUpperCase() === 'B' && avisoAtalhoRef.current?.tipo !== 'confirmar' && avisoAtalhoRef.current?.tipo !== 'enviar' && !modalAbertoRef.current) {
                e.preventDefault();
                // Comeca do peso ja estavel na balanca automatica, se houver
                // (mesmo comportamento do clique no botao "Balança" do mouse,
                // ver onClick do botao abaixo) -- mas o campo do modal fica
                // INDEPENDENTE dali em diante, nao acompanha mais o stream.
                setManualWeight(isScaleStable ? scaleWeight : 0);
                setIsScaleModalOpen(true);
                return;
            }

            // N dentro da comanda (Balcão V2): renomeia a comanda ativa a
            // qualquer momento, sem depender do fluxo de confirmação de
            // envio -- pedido do Ikarus, 30/09. Prioridade sobre o N do V1
            // (abaixo) quando o modal de comanda está aberto.
            if (balcaoV2Ref.current && isComandaModalOpenRef.current && !isRenomeandoComandaRef.current &&
                e.key.toUpperCase() === 'N' && avisoAtalhoRef.current?.tipo !== 'confirmar' && avisoAtalhoRef.current?.tipo !== 'enviar') {
                e.preventDefault();
                setIsRenomeandoComanda(true);
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => campoRenomeComandaRef.current?.focus());
                });
                return;
            }

            // N: abre o campo de nome na tela de confirmação (opcional).
            // Útil quando a mesa tem várias pessoas ou é retirada com nome.
            // N abre o campo de nome. Vale na confirmacao E antes de montar —
            // antes exigia avisoAtalho==='enviar', entao a tecla nao fazia nada
            // enquanto o operador ainda estava lancando, e parecia quebrada.
            // REF, nao closure. Com `!nomeAberto` daqui o handler antigo
            // ainda enxergava true depois de fechar o campo: a condicao falhava,
            // o `return` no fim do bloco nao rodava, e a tecla seguia para os
            // blocos de baixo levando preventDefault(). Dava o classico
            // "primeira vez funciona, segunda nao". Ver Regra 10.
            if (e.key.toUpperCase() === 'N' && !nomeAbertoRef.current &&
                (avisoAtalhoRef.current?.tipo === 'enviar' || !avisoAtalhoRef.current)) {
                e.preventDefault();
                nomeAbertoRef.current = true;   // vale JA, sem esperar o render
                setNomeAberto(true);
                // Foco no proximo quadro, depois que o React pintou o campo.
                // O setInterval anterior ficava re-focando e competia com o
                // clique do usuario; aqui e uma vez so.
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => campoNomeRef.current?.focus());
                });
                return;
            }

            // 2º ENTER (ou F2): confirma e ENVIA o pedido montado.
            if ((e.key === 'Enter' || e.key === 'F2') && avisoAtalhoRef.current?.tipo === 'enviar') {
                e.preventDefault();
                setAvisoAtalho(null);
                setNomeAberto(false);
                if (!isProcessing) handleFinalize();
                return;
            }

            // Balcão V2: ENTER com o campo de dígitos VAZIO (nada digitado)
            // envia a comanda ativa direto -- não existe "digitar a mesa"
            // pra chegar no aviso 'enviar' do V1, então sem isto o operador
            // ficava travado depois de lançar o produto (achado em 30/09,
            // Ikarus: "C, N, nome, Enter, código, Enter e não lançou").
            if (balcaoV2Ref.current && isComandaModalOpenRef.current &&
                e.key === 'Enter' && !teclasMesaRef.current) {
                e.preventDefault();
                // Enter colado no codigo que acabou de cair (habito "codigo + Enter"): ignora, nao envia.
                if (Date.now() - ultimoCodigoLancadoEmRef.current < 500) return;
                // Enter com BALANÇA AUTOMÁTICA (pedido do Ikarus 04/10 e 05/10/2026):
                // Enter = lança o peso NOVO que está na balança, em QUALQUER
                // comanda (nova, com produtos, com pesos anteriores, 2ª rodada);
                // não havendo peso novo, Enter = envia. "Peso novo" = estável,
                // > 0 e ainda não lançado; depois de lançar só vale outro quando
                // a balança passar por zero (prato retirado). A decisão é uma
                // função pura (utils/pesoBalanca.ts, com teste) e só olha refs
                // (Regra 10). Excluir comanda (carrinho esvaziado de propósito +
                // pedido anterior) continua tendo prioridade.
                const decisaoPeso = decidirEnterComPeso({
                    peso: scaleWeightRef.current,
                    estavel: isScaleStableRef.current,
                    pesoJaLancado: pesoLancadoRef.current,
                    carrinhoVazio: cartRef.current.length === 0,
                    temPedidoAnterior: pedidosDaMesaRef.current.length > 0,
                    msDesdeAvisoEstabilizar: ultimoAvisoEstabilizarRef.current === undefined
                        ? undefined
                        : Date.now() - ultimoAvisoEstabilizarRef.current,
                });
                if (decisaoPeso === 'lancar-peso') {
                    handleLaunchScaleItemToOrder(scaleWeightRef.current);
                    pesoLancadoRef.current = true;
                    setPesoLancado(true);
                    ultimoAvisoEstabilizarRef.current = undefined;
                    bipar('ok');
                    return;
                }
                if (decisaoPeso === 'aguardar-estabilizar') {
                    ultimoAvisoEstabilizarRef.current = Date.now();
                    bipar('erro');
                    setAvisoAtalho({
                        tipo: 'erro',
                        titulo: 'Aguarde o peso estabilizar',
                        detalhe: 'A balança ainda está oscilando. Espere o peso ficar verde e aperte Enter (Enter de novo envia sem o peso).'
                    });
                    return;
                }
                ultimoAvisoEstabilizarRef.current = undefined;
                // CRÍTICO (achado 02/10/2026, relato do Ikarus: "deletei os
                // produtos, dei Enter, nada aconteceu"): a condição exigia
                // `cartRef.current.length > 0` pra chamar handleFinalize --
                // isso bloqueava justamente o caso de EXCLUIR a comanda
                // (carrinho vazio + pedido já existia no banco), que
                // handleFinalize já sabe tratar internamente. Agora deixa
                // handleFinalize decidir: ele mesmo ignora carrinho vazio
                // SEM pedido anterior (nada a fazer), e exclui quando tinha
                // pedido antes.
                if (!isProcessingRef.current) handleFinalize();
                return;
            }

            // +/-: ajusta a quantidade do ÚLTIMO item lançado, sem precisar
            // de mouse -- pedido "mais um" é o caso mais comum numa fila de
            // açaiteria. Achado pela auditoria de 01/10/2026: hoje isso só
            // existia como clique nos botões +/- da lista do carrinho.
            // Delete/Q: desfaz (remove) o último item lançado -- corrige na
            // hora um código digitado errado, sem precisar de mouse.
            // Só dentro da comanda e sem dígitos pendentes, pra não colidir
            // com nada do fluxo de código/mesa.
            if (balcaoV2Ref.current && isComandaModalOpenRef.current && !teclasMesaRef.current &&
                (e.key === '+' || e.key === '-' || e.key === 'Delete' || e.key.toUpperCase() === 'Q')) {
                const ultimo = cartRef.current[cartRef.current.length - 1];
                if (ultimo) {
                    e.preventDefault();
                    if (e.key === '+') updateQuantity(ultimo.cartId, 1);
                    else if (e.key === '-') updateQuantity(ultimo.cartId, -1);
                    else removeItem(ultimo.cartId);
                    bipar('ok');
                }
                return;
            }

            // 1º ENTER: 1..30 = mesa · 100+ = código de produto.
            if (e.key === 'Enter' && teclasMesaRef.current) {
                e.preventDefault();
                const numero = parseInt(teclasMesaRef.current, 10);
                definirTeclasMesa('');

                if (numero >= 100) {
                    // Código de produto: adiciona ao carrinho, sem mouse.
                    const produto = menuItems.find(p => p.codigo === numero);
                    if (!produto) {
                        bipar('erro');
                        setAvisoAtalho({ tipo: 'erro', titulo: `Código ${numero} não encontrado`, detalhe: 'Nenhum produto tem este código.' });
                        return;
                    }
                    if (produto.isAvailable === false) {
                        bipar('erro');
                        setAvisoAtalho({ tipo: 'erro', titulo: `${produto.name}`, detalhe: 'Produto está indisponível.' });
                        return;
                    }
                    // Produto com exatamente 1 sabor elegível (e sem calda):
                    // lança já com ele embutido, sem abrir popup (nada pra
                    // escolher). Com 2+ ou com calda, o popup já teria aberto
                    // no dígito digitado (acima) e nunca chegaria aqui -- mas
                    // se chegar (ex.: colou o número com paste), ainda assim
                    // não deve duplicar.
                    const seletorEnter = montarSeletorInicial(produto);
                    if (seletorEnter) {
                        setSeletorSabor(seletorEnter);
                        bipar('ok');
                        return;
                    }
                    if (balcaoV2Ref.current) {
                        // V2: entra direto, SEM sabor embutido (antes, sem popup, embutia a 1a opcao da lista).
                        addToCart(produto);
                    } else {
                        const opcoesSabor = opcoesDeSaborDoProduto(produto);
                        addToCartComSabor(produto, opcoesSabor[0]);
                    }
                    bipar('ok');
                    // Balcão V2: SEM aviso na tela -- pedido do Ikarus, 30/09
                    // ("mais prático", sem modal verde a cada código digitado).
                    // O item já aparece na lista do carrinho, o bipe confirma
                    // que entrou. O V1 mantém o aviso -- lá ele orienta o
                    // próximo passo (digitar a mesa).
                    if (!balcaoV2Ref.current) {
                        setAvisoAtalho({
                            tipo: 'ok',
                            titulo: `${produto.name} · R$ ${Number(produto.price).toFixed(2)}`,
                            detalhe: 'Adicionado. Digite a mesa e ENTER para lançar.'
                        });
                    }
                    return;
                }

                // Balcão V2: dígito (1-20) + ENTER sempre ABRE a comanda no
                // modal (carrinho, busca, tudo) -- nunca lança direto, mesmo
                // que já tenha peso/item esperando confirmação. Pedido do
                // Ikarus, 30/09: apertar "2" mostrava um aviso azul de
                // "confirma e envia", quando o esperado é simplesmente abrir
                // a Comanda 2 pra continuar editando (igual clicar no card).
                // isProcessingRef: mesmo critério do C, achado pela auditoria
                // de 02/10/2026 -- trocar de comanda com um handleFinalize em
                // voo (await no Supabase) podia reabrir essa mesma comanda no
                // meio do envio e causar reenvio duplicado.
                if (balcaoV2Ref.current && numero >= 1 && numero <= TOTAL_COMANDAS_V2 && !isProcessingRef.current) {
                    salvarRascunhoAtual();
                    handleSelectTable(numero.toString().padStart(2, '0'), `Comanda ${numero}`);
                    setIsComandaModalOpen(true);
                    return;
                }

                lancarPesoNaMesa(numero);
                return;
            }

            if (e.key === 'Backspace' && teclasMesaRef.current) {
                e.preventDefault();
                definirTeclasMesa(teclasMesaRef.current.slice(0, -1));
            }
        };

        handlerTecladoRef.current = aoTeclar;
    });

    // Listener registrado UMA vez; delega para a ref, sempre atualizada.
    useEffect(() => {
        const despachar = (e: KeyboardEvent) => handlerTecladoRef.current?.(e);
        window.addEventListener('keydown', despachar);
        return () => window.removeEventListener('keydown', despachar);
    }, []);

    // Trava anti-duplicidade: este useEffect NÃO tem array de dependências
    // (precisa enxergar o estado atual a cada render), então o listener é
    // reinstalado com frequência — e com StrictMode o handler chegava a rodar
    // DUAS vezes para a mesma tecla, lançando o produto em dobro.
    // Marcamos o próprio evento: um KeyboardEvent nativo é único por tecla
    // pressionada, então a segunda passagem reconhece e ignora.

    // Rede de seguranca: o campo de nome so existe dentro do aviso 'enviar'.
    // Se sobrar `nomeAberto` sem esse aviso, o estado e impossivel — e antes
    // deixava a tela coberta pela pelicula. Reseta em vez de travar.
    useEffect(() => {
        if (nomeAberto && avisoAtalho?.tipo !== 'enviar') setNomeAberto(false);
    }, [nomeAberto, avisoAtalho]);

    // O aviso some sozinho. O de confirmação fica até o operador decidir.
    useEffect(() => {
        // 'confirmar' e 'enviar' aguardam decisão do operador: não somem sozinhos.
        if (!avisoAtalho || avisoAtalho.tipo === 'confirmar' || avisoAtalho.tipo === 'enviar') return;
        const id = setTimeout(() => setAvisoAtalho(null), 3500);
        return () => clearTimeout(id);
    }, [avisoAtalho]);

    const total = calcularValorCarrinho(cart, settings?.comboPrice) + (orderType === 'Entrega' ? (Number(deliveryFee) || 0) : 0);

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
            const phoneToSearch = query.replace(/\D/g, '');
            // `fetchCustomerByPhone` ja' resolve DDD/9o digito internamente
            // (canonicalPhone) -- so passa o default da loja para o caso de
            // busca sem DDD nenhum.
            const defaultDDD = settings?.defaultDDD || '32';
            const customer = await fetchCustomerByPhone(phoneToSearch, storeId, defaultDDD);
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

    /**
     * Carrega (ou inicia) a comanda/mesa de número `tableNum`. Usada tanto
     * pela grade de mesas do V1 quanto pelos slots de comanda do V2 (Balcão
     * V2 reaproveita a MESMA mecânica de table_number -- caixa, histórico e
     * fechamento em lote já funcionam de graça, ver decisão do Ikarus em
     * 30/09/2026: "ou usa a v1 ou a v2, não vão colidir", já que o
     * interruptor é por máquina).
     * `rotuloVazio` customiza o nome usado quando a comanda está vazia
     * (V1 usa "Mesa N", V2 usa "Comanda N") -- só diferença visual.
     */
    const handleSelectTable = async (tableNum: string, rotuloVazio?: string) => {
        setSelectedTable(tableNum);
        setIsTableModalOpen(false);
        setIsProcessing(true);
        // Retoma o popup de sabor/opcional PAUSADO desta comanda (tecla C
        // dentro do popup, pedido do Ikarus 02/10/2026) -- exatamente do
        // mesmo ponto: produto, opções, índice e marcados intactos.
        const numeroAbrindo = parseInt(tableNum, 10);
        const pausado = seletoresPausadosRef.current[numeroAbrindo];
        if (pausado) {
            delete seletoresPausadosRef.current[numeroAbrindo];
            setSeletorSabor(pausado);
        }
        const chamadaId = ++handleSelectTableCallIdRef.current;
        try {
            // Carrega TODOS os pedidos abertos da mesa, nao so o ultimo.
            // Antes usava fetchOpenOrderForTable, que tem .limit(1): a comanda
            // aparecia incompleta e excluir aqui nao refletia na aba Pedidos.
            const abertos = await fetchAllOpenOrdersForTable(storeId, parseInt(tableNum));
            if (chamadaId !== handleSelectTableCallIdRef.current) return; // resposta obsoleta, descarta
            // CRÍTICO (achado pela auditoria de 02/10/2026): antes, quando a
            // comanda já tinha pedido no banco (`abertos.length > 0`), o
            // código IGNORAVA qualquer rascunho local e sobrescrevia
            // cart/pedidosDaMesa/currentOrderId com o que veio do banco --
            // uma edição feita e não reenviada (ex.: "mais uma bala" depois
            // de já ter enviado a comanda) sumia silenciosamente. Agora: se
            // existe rascunho pra este slot, ele é a fonte de verdade (tem a
            // edição mais recente do operador), não o banco.
            const rascunho = rascunhosComandaRef.current[parseInt(tableNum, 10)];
            delete rascunhosComandaRef.current[parseInt(tableNum, 10)];
            persistirRascunhos();
            cartIdsJaEnviadosRef.current = new Set(); // comanda nova na tela: recomeca o controle de reenvio
            if (rascunho && rascunhoEstaValido(rascunho)) {
                // O rascunho tem a edicao mais recente do operador, mas o BANCO manda no que ja foi
                // enviado (ver utils/rascunhoComanda.ts) -- sem isto itens ja enviados voltavam do
                // rascunho e o proximo Enter criava um pedido novo duplicando a comanda.
                const r = reconciliarRascunho(rascunho, abertos);
                setPedidosDaMesa(r.pedidosDaMesa);
                setCart(r.cart);
                setCurrentOrderId(r.currentOrderId);
                setCustomerName(abertos.length > 0 ? (rascunho.customerName || abertos[0].customerName) : rascunho.customerName);
            } else if (abertos.length > 0) {
                setPedidosDaMesa(abertos);
                setCart(abertos.flatMap(o => o.items || []));
                setCurrentOrderId(abertos[0].id || null);
                setCustomerName(abertos[0].customerName);
            } else {
                setPedidosDaMesa([]);
                setCurrentOrderId(null);
                setCustomerName(rotuloVazio || `Mesa ${tableNum}`);
                setCart([]);
                // CRÍTICO (achado 02/10/2026, relato do Ikarus: "deletei a
                // comanda, abri uma nova no mesmo número, o F8 já mostrava
                // pagamento de outro cliente"): slot genuinamente vazio (sem
                // pedido no banco, sem rascunho) = próxima vez que for usado
                // é um cliente NOVO. Limpa qualquer table_payments que tenha
                // sobrado de um cliente anterior que usou este mesmo número
                // -- senão o histórico de "já recebido" do split bill
                // aparecia herdado entre clientes diferentes. Fire-and-forget
                // (não precisa bloquear a abertura da comanda por isso).
                if (balcaoV2Ref.current) {
                    clearTablePayments(storeId, numeroAbrindo).catch(() => {});
                }
            }
        } catch (error) {
            if (chamadaId !== handleSelectTableCallIdRef.current) return; // obsoleta, nao mostra erro de uma troca já abandonada
            console.error(error);
            showNotify('Erro ao verificar mesa.', 'error');
        } finally {
            // Só a chamada mais recente pode desligar o "carregando" -- uma
            // resposta atrasada não pode liberar isProcessing no meio de uma
            // troca de comanda mais nova que ainda está em andamento.
            if (chamadaId === handleSelectTableCallIdRef.current) setIsProcessing(false);
        }
    };

    useEffect(() => {
        if (initialTable) {
            handleSelectTable(initialTable.toString());
        }
    }, [initialTable]);

    // Qualquer chamada (Enter, F7, F8, clique) passa pela trava: enquanto um envio esta em curso, as
    // outras recebem o resultado dele em vez de gravar outro pedido.
    const handleFinalize = (): Promise<boolean> => envioUnicoRef.current(finalizarComanda);

    const finalizarComanda = async (): Promise<boolean> => {
        const numeroEnvio = parseInt(selectedTable, 10);
        // Carrinho que ESTE envio leva (o handler pode estar uma renderizacao atras do que o operador ja
        // lancou). Serve para detectar item lancado enquanto o envio estava em andamento.
        const cartEnviado = cart;
        // CRÍTICO (achado 02/10/2026, relato do Ikarus: "deletei todos os
        // itens da comanda, achei que ela sumiria sozinha, mas continuou
        // pendurada em Pedidos -- tive que ir lá cancelar manualmente"):
        // antes, carrinho vazio sempre devolvia `return false` sem fazer
        // nada, mesmo quando a comanda JÁ tinha pedido(s) no banco
        // (pedidosDaMesa). Se o operador esvaziou o carrinho de propósito
        // (removeu tudo), o esperado é excluir a comanda inteira -- mesmo
        // efeito do botão "Descartar" da lista, só que a partir de dentro da
        // tela de edição.
        if (cart.length === 0) {
            if (pedidosDaMesa.length > 0) {
                setIsProcessing(true);
                isProcessingRef.current = true;
                try {
                    // Em paralelo (achado 02/10/2026, relato do Ikarus: "X
                    // pra deletar demorou uns 10 segundos") -- antes era um
                    // `await` por sub-pedido em sequência, então uma comanda
                    // com vários sub-pedidos (ex.: itens novos + itens
                    // existentes gerando sub-pedidos separados) multiplicava
                    // o tempo de rede por cada um.
                    await Promise.all(pedidosDaMesa.map(pedido => deleteOrder(pedido.id!)));
                    if (balcaoV2Ref.current) {
                        clearTablePayments(storeId, parseInt(selectedTable, 10)).catch(() => {});
                    }
                    setPedidosDaMesa([]);
                    setCurrentOrderId(null);
                    delete rascunhosComandaRef.current[parseInt(selectedTable, 10)];
                    persistirRascunhos();
                    setVersaoRascunhos(v => v + 1);
                    showNotify('Comanda excluída (ficou sem itens). ✅');
                    if (balcaoV2Ref.current) {
                        setIsComandaModalOpen(false);
                        setSelectedTable('');
                    }
                    return true;
                } catch (error) {
                    console.error(error);
                    showNotify('Erro ao excluir comanda vazia.', 'error');
                    return false;
                } finally {
                    setIsProcessing(false);
                    isProcessingRef.current = false;
                }
            }
            return false;
        }
        setIsProcessing(true);
        isProcessingRef.current = true; // vale JA (o ref so atualizava no proximo render)
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
            else if (orderType === 'Balcão') finalAddress = balcaoV2Ref.current ? `Comanda ${selectedTable}` : `Mesa ${selectedTable}`;
            // Balcão V2 (decisão do Ikarus, 30/09): a comanda É uma mesa de
            // verdade (mesmo table_number, 1-20) -- só o RÓTULO exibido muda
            // de "Mesa N" para "Comanda N". Reaproveita de graça o caixa/
            // histórico/fechamento em lote que já funcionam pra mesa.
            // printed:true evita que a cozinha/estações disparem auto-print
            // -- o V2 não imprime sozinho, quem quiser imprimir usa o V1.
            const rotuloComandaV2 = balcaoV2Ref.current ? `Comanda ${selectedTable}` : null;
            // nomeSemPrefixoDeMesa() tira o "Comanda N ·"/"Mesa N ·" que já
            // pode estar no customerName (ex.: reenviar uma comanda que
            // handleSelectTable já recarregou com o prefixo). Sem isto,
            // reenviar duplicava o rótulo ("Comanda 1 · Comanda 1 · Nome").
            // Achado em 30/09/2026, print do Ikarus.
            const nomeLimpo = nomeSemPrefixoDeMesa(customerName);
            const orderData = {
                id: currentOrderId || undefined,
                // LET THE DATABASE HANDLE THIS (Trigger set_daily_order_number)
                // dailyOrderNumber: await getNextDailyOrderNumber(storeId), -> REMOVED TO FIX RACE CONDITION
                dailyOrderNumber: 0,
                // Mesa COM nome digitado -> "Mesa 2 · João" (o nome ajuda a
                // identificar quem e na hora de entregar/fechar).
                // Sem nome, continua so "Mesa 2" como sempre foi.
                customerName: rotuloComandaV2
                    ? (nomeLimpo ? `${rotuloComandaV2} · ${nomeLimpo}` : rotuloComandaV2)
                    : (isAvulso
                        ? (customerName || 'Cliente Avulso')
                        : (orderType === 'Balcão'
                            ? (nomeLimpo ? `Mesa ${selectedTable} · ${nomeLimpo}` : `Mesa ${selectedTable}`)
                            : (customerName || (orderType === 'Entrega' ? 'Entrega' : 'Balcão')))),
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
                // 'BALCÃO' (nao 'APP'): este pedido foi lancado NO BALCAO, pelo
                // operador. Marcado como 'APP' ele era tratado como pedido de
                // garcom/app — imprimia "via garcom" e escapava da regra de
                // auto-print de mesa/retirada.
                origin: 'BALCÃO',
                printed: rotuloComandaV2 ? true : false
            };

            // MESA COM PEDIDOS ABERTOS: nao sobrescrever tudo num id so.
            // Distribui igual ao onSave do EditOrderModal (AdminPage), que ja
            // roda em producao: itens novos viram sub-pedido novo, os que ja
            // existiam voltam para o pedido de origem pelo cartId, e o
            // sub-pedido que ficou vazio e deletado.
            if (pedidosDaMesa.length > 0 && orderType === 'Balcão' && selectedTable) {
                const idsOriginais = new Set(
                    pedidosDaMesa.flatMap(o => (o.items || []).map(i => i.cartId))
                );
                const itensNovos = cart.filter(i => !idsOriginais.has(i.cartId) && !cartIdsJaEnviadosRef.current.has(i.cartId));
                const itensExistentes = cart.filter(i => idsOriginais.has(i.cartId));

                // Usa calcularValorCarrinho (mesma função do total exibido na
                // tela) -- achado pela auditoria de 01/10/2026: esta cópia
                // manual não somava o preço de combo, então um item marcado
                // como combo ficava com total GRAVADO menor que o exibido,
                // divergindo silenciosamente no fechamento de caixa.
                const valorDe = (itens: CartItem[]) => calcularValorCarrinho(itens, settings?.comboPrice);

                // A. Itens novos viram um sub-pedido proprio (dispara impressao).
                if (itensNovos.length > 0) {
                    await onOrderComplete({
                        ...orderData,
                        id: undefined,
                        items: itensNovos,
                        total: valorDe(itensNovos),
                        printed: false,
                        status: 'Novo',
                    });
                    // Se o resto do envio (passo B) falhar, o reenvio nao recria este sub-pedido.
                    itensNovos.forEach(i => cartIdsJaEnviadosRef.current.add(i.cartId));
                }

                // B. Os demais voltam para o pedido de onde vieram. Em
                // paralelo (achado 02/10/2026, mesmo problema de lentidão do
                // "excluir comanda vazia" -- sub-pedidos não dependem um do
                // outro, não há motivo pra esperar um terminar antes do
                // próximo começar).
                await Promise.all(pedidosDaMesa.map(pedido => {
                    const idsDoPedido = new Set((pedido.items || []).map(i => i.cartId));
                    const meusItens = itensExistentes.filter(i => idsDoPedido.has(i.cartId));

                    // CRÍTICO (achado pela auditoria de 01/10/2026): antes a
                    // condição era `pedido.items.length > 0 && meusItens
                    // .length === 0` para deletar -- se `pedido.items` já
                    // chegasse vazio/nulo por qualquer motivo (ex.: pedido
                    // "fantasma" criado por falha anterior), NEM o delete
                    // NEM o update disparavam, e esse sub-pedido ficava
                    // órfão no banco, continuando a contar no fechamento do
                    // dia mesmo sem nenhum item seu na mesa. Agora: sem
                    // nenhum item meu, sempre deleta, independente do que
                    // `pedido.items` já era.
                    if (meusItens.length === 0) {
                        return deleteOrder(pedido.id!);
                    }
                    return updateOrder(pedido.id!, {
                        ...pedido,
                        items: meusItens,
                        total: valorDe(meusItens) + (Number(pedido.deliveryFee) || 0),
                    });
                }));

                showNotify('Comanda da mesa atualizada! ✅');
            } else {
                await onOrderComplete(orderData);
            }

            // Balcão V2 (decisão do Ikarus, 30/09): a comanda continua
            // ocupando o slot 1-20 até o checkout (reabrir mais tarde já
            // mostra o pedido enviado, igual mesa ocupada no V1) -- mas a
            // TELA fecha sozinha de volta pra lista assim que envia, sem
            // precisar apertar X. Pedido do Ikarus, 30/09: "o usuário é
            // preguiçoso" -- exigir X depois de todo envio é atrito
            // desnecessário, já que não há mais nada a fazer nesta comanda
            // agora (ela virou pedido de verdade).
            if (!balcaoV2Ref.current) {
                setCart([]);
                setSelectedTable('');
                setCurrentOrderId(null);
                setPedidosDaMesa([]);
                setCustomerName('');
            } else {
                // CRÍTICO (achado em 01/10/2026, print do Ikarus: "Comanda 2
                // continua PENDENTE/vermelha mesmo já aparecendo na aba
                // Pedidos"): o slot pode ter um rascunho salvo em
                // rascunhosComandaRef de uma visita anterior (salvarRascunhoAtual
                // grava ao trocar de comanda). Sem apagar aqui, cardsComandas
                // prioriza o rascunho (linha "if (rascunho)") sobre o pedido já
                // enviado no banco, e o card nunca mais vira verde sozinho.
                delete rascunhosComandaRef.current[parseInt(selectedTable, 10)];
                persistirRascunhos();
                setVersaoRascunhos(v => v + 1);
                // CAUSA RAIZ da duplicacao (auditoria 05/10/2026, pedidos #13->#20): o envio NAO
                // limpava o carrinho local. Ao trocar de comanda, salvarRascunhoAtual() guardava
                // esse carrinho (itens JA enviados) como rascunho e, ao reabrir, ele ressuscitava
                // por cima do banco -> o proximo Enter criava um pedido novo com tudo de novo.
                // Agora a comanda enviada sai da tela: reabrir carrega do banco (handleSelectTable).
                // So limpa se o operador ainda esta nesta comanda (nao apaga outra que abriu no meio).
                //
                // ATENCAO (06/10/2026, "varios pesos na mesma comanda + Enter apressado"): o envio leva
                // alguns instantes (rede). Se o operador JA lancou outro peso/produto nesse intervalo,
                // limpar a tela apagaria esse item sem ele ter sido enviado. Nesse caso a comanda NAO
                // fecha: recarrega o banco e mantem so o que ainda esta pendente.
                const mesmaComanda = parseInt(selectedTableRef.current, 10) === numeroEnvio;
                const idsEnviados = new Set(cartEnviado.map(i => i.cartId));
                const lancadosNoMeioDoEnvio = mesmaComanda ? cartRef.current.filter(i => !idsEnviados.has(i.cartId)) : [];
                cartIdsJaEnviadosRef.current = new Set();
                if (lancadosNoMeioDoEnvio.length > 0) {
                    try {
                        const abertos = await fetchAllOpenOrdersForTable(storeId, numeroEnvio);
                        const r = reconciliarRascunho(
                            { cart: cartRef.current, customerName, pedidosDaMesa, currentOrderId },
                            abertos,
                        );
                        setPedidosDaMesa(r.pedidosDaMesa);
                        setCart(r.cart);
                        setCurrentOrderId(r.currentOrderId);
                    } catch (e) {
                        // Sem conseguir reler o banco: tira da tela so o que JA foi enviado e mantem o novo.
                        console.error('Reconciliar comanda apos envio falhou:', e);
                        setCart(cartRef.current.filter(i => !idsEnviados.has(i.cartId)));
                    }
                } else {
                    setIsComandaModalOpen(false);
                    if (mesmaComanda) {
                        setCart([]);
                        setCurrentOrderId(null);
                        setPedidosDaMesa([]);
                        setCustomerName('');
                        setSelectedTable('');
                    }
                }
            }
            if (!(pedidosDaMesa.length > 0 && orderType === 'Balcão' && selectedTable)) {
                showNotify(isAvulso ? 'Venda Avulsa registrada! 💰' : 'Pedido salvo com sucesso! ✅');
            }
            // Bipe de confirmação ao ENVIAR a comanda -- pedido do Ikarus
            // 01/10/2026: hoje só existia bipe ao adicionar item ('ok') ou
            // somar peso ('somou'), nada tocava na finalização de verdade.
            bipar('enviado');
            return true;
        } catch (error) {
            console.error(error);
            showNotify('Erro ao salvar pedido.', 'error');
            return false;
        } finally {
            setIsProcessing(false);
            isProcessingRef.current = false;
        }
    };

    // Expõe handleFinalize pro AdminPage via ref -- pedido do Ikarus
    // 02/10/2026: "por que esperar lançar? já no faturar" -- F7/F8 agora
    // enviam a comanda sozinhos (se ainda não foi enviada) antes de abrir o
    // checkout/split. Atualizado a cada render pra nunca ficar com uma
    // versão velha de handleFinalize (que fecha sobre cart/selectedTable
    // atuais).
    useEffect(() => {
        if (enviarComandaAtivaRef) {
            // So envia se a comanda tem algo novo/alterado (F7/F8 chamam isto antes do checkout:
            // sem pendencia, nao ha o que gravar e o checkout abre na hora).
            enviarComandaAtivaRef.current = () =>
                comandaTemPendencia(cart, pedidosDaMesa) ? handleFinalize() : Promise.resolve(true);
        }
    });

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

    /**
     * Cards do "Comandas em Andamento" (Balcão V2) -- memoizado. Antes era
     * uma IIFE dentro do JSX que recalculava tudo (inclusive o total de
     * TODAS as comandas abertas) em QUALQUER render do CounterTab, mesmo um
     * causado por algo sem relação (ex.: digitar na busca de produto).
     * Achado pela auditoria de 30/09/2026. Só recalcula quando algo que
     * afeta a lista de fato muda.
     */
    /**
     * "Comandas em Andamento" (Balcão V2): um card por slot (1-20) que tem
     * pedido aberto no banco (mesma fonte que a aba Pedidos usa,
     * `activeOrders`/`tableStatuses`) -- a comanda É uma mesa de verdade
     * (decisão do Ikarus, 30/09), então não existe mais estado local
     * separado. O slot que está aberto na tela agora (selectedTable, dentro
     * de 1-20) aparece marcado como "ativa", usando os valores AO VIVO do
     * carrinho em vez do que já foi salvo -- assim o card reflete o que o
     * operador está digitando, não só o último envio.
     */
    const cardsComandas = useMemo(() => {
        if (!settings?.balcaoV2) return [];
        type CardComanda = { id: string; identificador: string; itens: number; valor: number; ativa: boolean; enviada: boolean };

        const numeroAtivo = parseInt(selectedTable, 10);
        const slotsComPedido = new Set([
            ...activeOrders
                .filter(o => o.table_number && Number(o.table_number) >= 1 && Number(o.table_number) <= TOTAL_COMANDAS_V2)
                .map(o => Number(o.table_number)),
            // Slots com rascunho não-enviado (comanda "em standby") também
            // aparecem na lista -- achado em 30/09/2026: o operador montava a
            // Comanda 3, trocava pra Comanda 4, e a 3 sumia da lista mesmo
            // com item dentro.
            ...Object.keys(rascunhosComandaRef.current).map(Number),
            // Slots com popup de sabor PAUSADO (tecla C dentro do popup,
            // 02/10/2026) -- sem isto, uma comanda que abriu o popup como
            // PRIMEIRO item (carrinho ainda vazio, sem rascunho) sumia da
            // lista por completo enquanto pausada, sem jeito de voltar a ela
            // pelo card.
            ...Object.keys(seletoresPausadosRef.current).map(Number),
        ]);
        if (numeroAtivo >= 1 && numeroAtivo <= TOTAL_COMANDAS_V2) slotsComPedido.add(numeroAtivo);

        return Array.from(slotsComPedido).sort((a, b) => a - b).map((numero): CardComanda => {
            const ehAtiva = numero === numeroAtivo;
            const rascunho = rascunhosComandaRef.current[numero];
            // nomeSemPrefixoDeMesa() tira o "Comanda N ·" que já vem embutido
            // no customerName (handleFinalize salva os dois juntos) -- sem
            // isto o card duplicava "Comanda 1 - Comanda 01 · Nome" (achado
            // em 30/09/2026, print do Ikarus).
            const nomeExtra = ehAtiva
                ? nomeSemPrefixoDeMesa(customerName)
                : rascunho
                    ? nomeSemPrefixoDeMesa(rascunho.customerName)
                    : nomeDaComanda(activeOrders.filter(o => Number(o.table_number) === numero));
            const identificador = `Comanda ${numero}` + (nomeExtra ? ` - ${nomeExtra}` : '');
            if (ehAtiva) {
                // ATIVA mas já existe pedido no banco pra este slot = já foi
                // enviada (currentOrderId sozinho não bastava: handleFinalize
                // não recarrega mais a comanda depois de enviar -- só fecha o
                // modal -- então currentOrderId ficava null até reabrir de
                // novo. Usar activeOrders reflete assim que o pedido chega
                // via polling/realtime, sem esperar reabrir. Achado em
                // 30/09/2026, print do Ikarus: "Comanda 3 ficou ativa, mas
                // continuou laranja" mesmo já enviada.
                const jaEnviada = !!currentOrderId || activeOrders.some(o => Number(o.table_number) === numero);
                return {
                    id: `slot-${numero}`,
                    identificador,
                    itens: cart.length,
                    valor: calcularValorCarrinho(cart, settings?.comboPrice),
                    ativa: true,
                    enviada: jaEnviada,
                };
            }
            // CRÍTICO (achado em 01/10/2026, véspera da demo -- print do
            // Ikarus mostrando "Comanda 1" vermelha/Pendente com item e valor
            // mesmo já tendo virado pedido de verdade): a ordem de checagem
            // estava ERRADA na raiz. Antes, `if (rascunho)` vinha PRIMEiro e
            // sempre retornava enviada:false -- um rascunho esquecido no
            // cache (por qualquer motivo: falha de limpeza em algum caminho,
            // fechar o app no meio, F5) fazia o card mentir "Pendente" PARA
            // SEMPRE, mesmo com o pedido certinho em activeOrders/no banco.
            // Corrigido invertendo a prioridade: ter pedido real no banco
            // SEMPRE vale mais que ter rascunho em cache. Rascunho só decide
            // o status quando não há NENHUM pedido no banco pra esse slot.
            const pedidosDoSlot = activeOrders.filter(o => Number(o.table_number) === numero);
            if (pedidosDoSlot.length > 0) {
                return {
                    id: `slot-${numero}`,
                    identificador,
                    itens: pedidosDoSlot.reduce((s, o) => s + (o.items || []).length, 0),
                    valor: pedidosDoSlot.reduce((s, o) => s + (Number(o.total) || 0), 0),
                    ativa: false,
                    enviada: true,
                };
            }
            if (rascunho) {
                return {
                    id: `slot-${numero}`,
                    identificador,
                    itens: rascunho.cart.length,
                    valor: calcularValorCarrinho(rascunho.cart, settings?.comboPrice),
                    ativa: false,
                    enviada: false,
                };
            }
            // Popup de sabor pausado (tecla C) com carrinho ainda vazio (o
            // popup era o PRIMEIRO item da comanda) -- sem este bloco caía no
            // "enviada: true" genérico abaixo, mostrando "Enviada" (verde)
            // pra uma comanda que na real está esperando o operador voltar e
            // decidir o sabor/adicional. Achado 02/10/2026.
            const pausado = seletoresPausadosRef.current[numero];
            if (pausado) {
                return {
                    id: `slot-${numero}`,
                    identificador,
                    itens: 1,
                    valor: 0,
                    ativa: false,
                    enviada: false,
                };
            }
            return {
                id: `slot-${numero}`,
                identificador,
                itens: 0,
                valor: 0,
                ativa: false,
                enviada: true,
            };
        });
    }, [settings?.balcaoV2, settings?.comboPrice, activeOrders, selectedTable, cart, customerName, currentOrderId, versaoRascunhos, seletorSabor]);

    return (
        // h-full (nao min-h-full): min-h-full forca "pelo menos a tela inteira" e,
        // somado a barra da balanca, estoura o container do pai. Ver Regra 7.
        <div className="flex flex-col h-full w-full gap-4 p-4 md:p-8 bg-gray-100 dark:bg-gray-900 overflow-y-auto md:overflow-hidden font-sans">
             <Notification show={notification.show} message={notification.message} type={notification.type} onClose={() => setNotification(p => ({ ...p, show: false }))} />

            {/* AVISO DO ATALHO DE TECLADO — grande e no meio da tela, para o
                operador enxergar sem tirar os olhos da balança. */}
            {avisoAtalho && !isCustomItemModalOpen && !isTableModalOpen && !isScaleModalOpen && !isCategoryModalOpen && !isAddonModalOpen && (
                // pointer-events-none SEMPRE no overlay. Antes ele virava
                // clicavel quando o campo de nome abria (`nomeAberto ? '' :`),
                // e como e `fixed inset-0 z-[9998]` cobria o app inteiro: uma
                // "pelicula" invisivel que engolia todo clique fora da caixa.
                // Quem precisa de clique e a CAIXA, nao a tela toda.
                <div
                    className="fixed inset-0 z-[9998] flex items-center justify-center p-4 pointer-events-none"
                    onClick={() => {
                        // Clique fora fecha, igual aos outros modais deste
                        // arquivo. Sem isto, perder o foco do campo deixava o
                        // operador sem nenhuma saida pelo mouse.
                        if (nomeAberto) { setNomeAberto(false); setAvisoAtalho(null); }
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className={`pointer-events-auto px-8 py-6 rounded-2xl shadow-2xl border-4 text-center max-w-lg animate-fade-in ${
                        avisoAtalho.tipo === 'enviar'    ? 'bg-blue-600 border-blue-300 text-white' :
                        avisoAtalho.tipo === 'ok'        ? 'bg-emerald-600 border-emerald-300 text-white' :
                        avisoAtalho.tipo === 'somou'     ? 'bg-amber-500 border-amber-200 text-slate-900' :
                        avisoAtalho.tipo === 'confirmar' ? 'bg-orange-600 border-orange-300 text-white' :
                                                           'bg-red-600 border-red-300 text-white'
                    }`}>
                        <p className="text-2xl md:text-3xl font-black tracking-tight">{avisoAtalho.titulo}</p>
                        {avisoAtalho.detalhe && (
                            <p className="text-sm md:text-base font-bold mt-2 opacity-90">{avisoAtalho.detalhe}</p>
                        )}

                        {/* Nome do cliente — opcional, só na tela de confirmação.
                            Tecla N abre; quem não quiser nome segue com ENTER direto. */}
                        {avisoAtalho.tipo === 'enviar' && (
                            nomeAberto ? (
                                <div className="mt-4">
                                    <input
                                        ref={campoNomeRef}
                                        autoFocus
                                        type="text"
                                        value={customerName}
                                        onChange={(e) => setCustomerName(e.target.value)}
                                        onKeyDown={(e) => {
                                            // ENTER dentro do campo já confirma e envia.
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setAvisoAtalho(null);
                                                setNomeAberto(false);
                                                if (!isProcessing) handleFinalize();
                                            }
                                            if (e.key === 'Escape') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setCustomerName('');
                                                setNomeAberto(false);
                                            }
                                        }}
                                        placeholder="Nome do cliente"
                                        className="w-full px-4 py-3 rounded-xl text-center text-lg font-bold text-slate-900 bg-white border-2 border-white/50 outline-none placeholder:text-slate-400"
                                    />
                                    <p className="text-[11px] font-bold mt-1.5 opacity-80">
                                        ENTER confirma e envia · ESC limpa o nome
                                    </p>
                                </div>
                            ) : (
                                <p className="text-[11px] font-bold mt-3 opacity-70">
                                    Aperte <kbd className="px-1.5 py-0.5 bg-white/25 rounded font-black">N</kbd> para dar um nome
                                </p>
                            )
                        )}
                    </div>
                </div>
            )}

            {/* Dígitos sendo digitados — mostra o que a mesa vai receber. */}
            {teclasMesa && !isCustomItemModalOpen && !isTableModalOpen && !isScaleModalOpen && !isCategoryModalOpen && !isAddonModalOpen && (
                <div className="fixed inset-0 z-[9998] flex items-center justify-center pointer-events-none">
                    <div className="bg-slate-900 border-4 border-emerald-500 rounded-2xl px-10 py-6 shadow-2xl text-center">
                        <span className="block text-[10px] font-black uppercase tracking-widest text-emerald-400">
                            {parseInt(teclasMesa, 10) >= 100 ? 'Código do Produto' : (settings?.balcaoV2 ? 'Comanda' : 'Mesa')}
                        </span>
                        <span className="block text-6xl font-black text-white font-mono leading-none my-1">{teclasMesa}</span>
                        {/* Mini-colinha: mostra so o que vale NESTE passo. */}
                        {settings?.mostrarDicasAtalho !== false && (
                            <div className="mt-2 pt-2 border-t border-slate-700 flex flex-col gap-0.5">
                                <span className="text-[11px] font-bold text-slate-300">
                                    <kbd className="px-1 bg-slate-800 rounded text-emerald-400">ENTER</kbd>
                                    {parseInt(teclasMesa, 10) >= 100 ? ' adiciona ao pedido' : (settings?.balcaoV2 ? ' abre a comanda' : ' lança na mesa')}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                    <kbd className="px-1 bg-slate-800 rounded">←</kbd> apaga ·
                                    <kbd className="px-1 bg-slate-800 rounded ml-1">ESC</kbd> cancela
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Mini-colinha do passo inicial: aparece quando nao ha nada digitado
                nem aviso na tela, para o operador lembrar por onde começar.
                Removida do Balcão V2 (pedido do Ikarus, 02/10/2026): com a
                barra de atalhos fixa no cabeçalho da comanda, essa dica
                flutuante ficou redundante e atrapalhava a tela -- continua
                valendo só pro V1 (sem comandas), que não tem a barra nova. */}
            {settings?.mostrarDicasAtalho !== false && !teclasMesa && !avisoAtalho && settings?.isScaleEnabled && !settings?.balcaoV2 &&
             !isCustomItemModalOpen && !isTableModalOpen && !isScaleModalOpen && !isCategoryModalOpen && !isAddonModalOpen && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9990] pointer-events-none">
                    {/* Aumentada e trocada para laranja (28/09/2026, pedido do
                        Ikarus): o operador nao estava enxergando bem em verde
                        pequeno, com a tela cheia de outras cores. */}
                    <div className="bg-slate-900/90 border border-amber-500/40 rounded-lg px-5 py-2.5 shadow-lg backdrop-blur-sm">
                        <span className="text-sm text-slate-300">
                            Digite o <strong className="text-amber-400">nº da mesa</strong> ou o
                            <strong className="text-amber-400"> código do produto</strong> ·
                            <kbd className="px-1.5 py-0.5 bg-slate-800 rounded ml-1 text-amber-300 font-bold">R</kbd> retirada
                        </span>
                    </div>
                </div>
            )}

            {/* BARRA DE BALANÇA EM TEMPO REAL (MODO VIGIA) */}
            {settings?.isScaleEnabled && (
                <div className="w-full bg-slate-950 border-2 border-emerald-500/40 rounded-2xl p-3.5 md:p-4 shadow-[0_0_25px_rgba(16,185,129,0.15)] flex flex-col lg:flex-row items-center justify-between gap-3 animate-fade-in shrink-0">
                    <div className="flex items-center gap-3 w-full lg:w-auto">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold transition-all ${scaleWeight > 0 ? 'bg-orange-500 text-slate-950 shadow-lg shadow-orange-500/40 scale-105' : 'bg-slate-900 text-emerald-400 border border-emerald-500/30'}`}>
                            <Scale size={24} className={scaleWeight > 0 ? "animate-pulse" : ""} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-black uppercase tracking-wider text-emerald-400">Balança em Tempo Real</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${scaleWeight > 0 ? 'bg-orange-950/80 text-orange-300 border-orange-500/50' : 'bg-slate-900 text-slate-400 border-slate-800'}`}>
                                    {liveScaleStatusText}
                                </span>
                                {settings?.balcaoV2 && scaleWeight > PESO_ZERO_KG && isScaleStable && (
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${pesoLancado
                                        ? 'bg-slate-800 text-slate-300 border-slate-600'
                                        : 'bg-amber-400 text-slate-950 border-amber-200 animate-pulse'}`}>
                                        {pesoLancado ? '✔ PESO LANÇADO · RETIRE O PRATO PARA PESAR OUTRO' : 'ENTER LANÇA ESTE PESO'}
                                    </span>
                                )}
                            </div>
                            <p className="text-[11px] text-slate-400 font-medium">Peso lido continuamente. Insira o prato/tigela para calcular o total.</p>
                        </div>
                    </div>

                    <div className="flex items-center justify-around w-full lg:w-auto gap-4 md:gap-8 bg-slate-900/90 px-5 py-2 rounded-xl border border-slate-800 font-mono shadow-inner">
                        <div className="text-center">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">PESO ATUAL</span>
                            <span className={`text-xl md:text-2xl font-extrabold ${scaleWeight > 0 ? 'text-orange-400 drop-shadow-[0_0_8px_rgba(251,146,60,0.7)]' : 'text-slate-500'}`}>
                                {(scaleWeight || 0).toFixed(3)} <span className="text-xs font-normal">kg</span>
                            </span>
                        </div>
                        <div className="h-7 w-px bg-slate-800"></div>
                        <div className="text-center">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">VALOR TOTAL</span>
                            <span className={`text-xl md:text-2xl font-extrabold ${scaleWeight > 0 ? 'text-orange-300 drop-shadow-[0_0_8px_rgba(251,146,60,0.7)]' : 'text-slate-500'}`}>
                                R$ {((scaleWeight || 0) * (scalePricePerKg || 60)).toFixed(2)}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 w-full lg:w-auto">
                        <button
                            type="button"
                            onClick={async () => {
                                try {
                                    await requestSerialPort(settings?.scaleBaudRate || 9600);
                                    alert('Balança conectada com sucesso!');
                                } catch(err: any) {
                                    // Se a balança já está lendo, a falha foi em alguma
                                    // das outras portas (esta máquina lista 38, quase
                                    // todas Bluetooth). Não é erro para o operador.
                                    if (getScaleSnapshot().status === 'stable' ||
                                        getScaleSnapshot().status === 'unstable' ||
                                        getScaleSnapshot().status === 'waiting') {
                                        return;
                                    }
                                    alert(err?.message || 'Erro ao conectar à porta da balança.');
                                }
                            }}
                            className="px-3 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 active:scale-95"
                            title="Conectar ou selecionar porta USB/COM da balança"
                        >
                            🔌 Conectar USB
                        </button>

                        <button
                            type="button"
                            onClick={() => setIsScaleDiagOpen(v => !v)}
                            className={`px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border active:scale-95 ${
                                isScaleDiagOpen
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700/80'
                            }`}
                            title="Mostrar os dados crus enviados pela balança (diagnóstico)"
                        >
                            🔍 Diagnóstico
                        </button>

                        {/* Só habilita o lançamento com peso ESTÁVEL e confirmado.
                            Peso oscilando = valor errado no pedido. Ver Regra 6. */}
                        <button
                            type="button"
                            onClick={() => handleLaunchScaleItemToOrder(scaleWeight)}
                            disabled={!scaleWeight || scaleWeight <= 0 || !isScaleStable || (!!settings?.balcaoV2 && pesoLancado)}
                            title={!isScaleStable && scaleWeight > 0 ? 'Aguarde o peso estabilizar' : undefined}
                            className={`flex-1 lg:flex-initial px-5 py-2.5 rounded-xl font-black text-xs md:text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg ${
                                scaleWeight > 0 && isScaleStable && !(settings?.balcaoV2 && pesoLancado)
                                    ? 'bg-gradient-to-r from-orange-500 via-orange-500 to-amber-600 hover:brightness-110 text-black shadow-orange-500/40 active:scale-95 cursor-pointer ring-2 ring-orange-300/60 animate-pulse'
                                    : 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
                            }`}
                        >
                            <Plus size={16} />
                            <span>
                                {scaleWeight > 0 && !isScaleStable
                                    ? 'Aguarde estabilizar...'
                                    : (settings?.balcaoV2 && pesoLancado && scaleWeight > 0)
                                    ? 'Peso lançado · retire o prato'
                                    : `Lançar Pedido (R$ ${((scaleWeight || 0) * (scalePricePerKg || 60)).toFixed(2)})`}
                            </span>
                        </button>
                    </div>
                </div>
            )}

            {/* PAINEL DE DIAGNÓSTICO DA BALANÇA — mostra o texto cru da porta serial.
                Serve para descobrir o formato real do frame da Urano US 31/2 POS. */}
            {settings?.isScaleEnabled && isScaleDiagOpen && (
                <div className="w-full bg-slate-950 border-2 border-amber-500/40 rounded-2xl p-4 shadow-lg animate-fade-in shrink-0">
                    <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-wider text-amber-400">
                                Diagnóstico da Balança (dados crus)
                            </h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                                Coloque um peso conhecido (ex.: 500 g) e observe as linhas abaixo.
                                É este texto que define como o peso é interpretado.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={async () => {
                                    const txt = getScaleRawLog().join('\n');
                                    if (!txt) { alert('Ainda não há log para salvar.'); return; }
                                    const api = (window as any).electron;
                                    if (api?.salvarLogBalanca) {
                                        const r = await api.salvarLogBalanca(txt);
                                        alert(r?.ok
                                            ? `Log salvo na Área de Trabalho:\n\n${r.caminho}`
                                            : `Não foi possível salvar: ${r?.erro || 'erro desconhecido'}`);
                                    } else {
                                        navigator.clipboard?.writeText(txt);
                                        alert('Log copiado para a área de transferência.');
                                    }
                                }}
                                className="px-3 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all active:scale-95"
                                title="Salva o log num arquivo .txt na Área de Trabalho"
                            >
                                Salvar Arquivo
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (!confirm('Apagar o log? Se ainda não salvou, o conteúdo será perdido.')) return;
                                    clearScaleRawLog();
                                    setScaleRawLines([]);
                                }}
                                className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all active:scale-95"
                            >
                                Limpar
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const txt = getScaleRawLog().join('\n');
                                    if (txt) navigator.clipboard?.writeText(txt);
                                }}
                                className="px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all active:scale-95"
                            >
                                Copiar Log
                            </button>
                        </div>
                    </div>

                    <div className="bg-black/60 border border-slate-800 rounded-xl p-3 max-h-56 overflow-y-auto font-mono text-[11px] leading-relaxed">
                        {scaleRawLines.length === 0 ? (
                            <p className="text-slate-500">
                                Nenhum dado recebido ainda. Verifique se a balança está ligada,
                                conectada via USB e se a porta foi selecionada em "Conectar USB".
                            </p>
                        ) : (
                            scaleRawLines.map((line, i) => (
                                <div key={i} className="text-emerald-300 whitespace-pre-wrap break-all">
                                    {line}
                                </div>
                            ))
                        )}
                    </div>

                    <p className="text-[10px] text-slate-500 mt-2">
                        Status atual: <span className="text-slate-300 font-bold">{scaleStatus}</span>
                        {' · '}Peso: <span className="text-slate-300 font-bold">{scaleWeight.toFixed(3)} kg</span>
                        {' · '}Estável: <span className="text-slate-300 font-bold">{isScaleStable ? 'sim' : 'não'}</span>
                    </p>
                </div>
            )}

            {/* min-h-0 tambem aqui: sem ele este flex-1 cresce com o conteudo das
                colunas e empurra a pagina, mesmo com o <main> ja corrigido. Regra 7. */}
            <div className="flex flex-col md:flex-row flex-1 min-h-0 w-full gap-4 md:gap-8 overflow-y-auto md:overflow-hidden">
                {/* COLUMN 1: MENU (PICKING) - BLUE THEME */}
                <div className="flex-[3] min-h-0 flex flex-col bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-blue-100 dark:border-blue-900/30 md:overflow-hidden">
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
                            ref={buscaProdutoRef}
                            type="text"
                            placeholder="Buscar produto ou código..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white border border-blue-100 dark:border-blue-900/30 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-gray-400"
                        />
                        </div>
                    </div>
                    {!balcaoV2 && (
                    <div className="flex flex-wrap items-center gap-2 pb-1">
                        {mostrarPromocoes && normalizedPromotions.length > 0 && (
                            <button 
                                onClick={() => setSelectedCategoryId(-1)} 
                                className={`px-3.5 py-1.5 rounded-full whitespace-nowrap font-bold text-xs uppercase tracking-wider transition-all shadow-sm flex items-center gap-1.5
                                    ${selectedCategoryId === -1 
                                        ? 'bg-red-600 text-white shadow-red-500/20' 
                                        : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-100 dark:border-red-900/10'}`}
                            >
                                <Percent size={14} />
                                Promoções
                            </button>
                        )}

                        {/* Top 5 Categorias */}
                        {categoriasVisiveis.slice(0, 5).map(cat => (
                            <button 
                                key={cat.id} 
                                onClick={() => setSelectedCategoryId(cat.id)} 
                                className={`px-3.5 py-1.5 rounded-full whitespace-nowrap font-bold text-xs uppercase tracking-wider transition-all shadow-sm
                                    ${selectedCategoryId === cat.id 
                                        ? 'bg-blue-600 text-white shadow-blue-500/20 ring-2 ring-blue-400/30' 
                                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-blue-100 dark:border-gray-700'}`}
                            >
                                {cat.name}
                            </button>
                        ))}

                        {/* Categoria Ativa se fora das top 5 */}
                        {selectedCategoryId !== -1 && !categoriasVisiveis.slice(0, 5).some(c => c.id === selectedCategoryId) && (
                            <button 
                                onClick={() => setSelectedCategoryId(selectedCategoryId)} 
                                className="px-3.5 py-1.5 rounded-full whitespace-nowrap font-bold text-xs uppercase tracking-wider transition-all shadow-sm bg-blue-600 text-white shadow-blue-500/20 ring-2 ring-blue-400/30"
                            >
                                {categories.find(c => c.id === selectedCategoryId)?.name || 'Categoria'}
                            </button>
                        )}

                        {/* Botão MAIS... */}
                        {categoriasVisiveis.length > 5 && (
                            <button 
                                type="button"
                                onClick={() => {
                                    setCategorySearchTerm('');
                                    setIsCategoryModalOpen(true);
                                }}
                                className="px-3.5 py-1.5 rounded-full whitespace-nowrap font-black text-xs uppercase tracking-wider transition-all shadow-md bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white flex items-center gap-1.5 cursor-pointer hover:scale-105"
                                title="Ver todas as categorias"
                            >
                                <Grid size={14} />
                                <span>MAIS...</span>
                                <ChevronDown size={14} />
                            </button>
                        )}
                    </div>
                    )}
                </div>
                
                <CounterMenuGrid items={filteredItems} onAdd={addToCart} modoLista={balcaoV2} />
            </div>

            {/* CARRINHO DA COMANDA ATIVA (Balcão V2) — ocupa o MESMO lugar do
                card de comandas quando uma comanda está sendo editada. Nunca
                em overlay: a barra da balança (acima, fora deste bloco) tem
                que continuar visível para pegar peso a qualquer momento
                (pedido do Ikarus, 30/09). */}
            {settings?.balcaoV2 && isComandaModalOpen ? (
            /* Uma coluna SÓ para a comanda (pedido do Ikarus, 30/09): sem
               busca de produto separada -- o lançamento é só código+Enter
               (herdado do V1) ou B para pegar o peso da balança. */
            <div className="flex-[6] min-h-0 flex flex-col bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-green-100 dark:border-green-900/30 md:overflow-hidden">
                <div className="px-3 py-1.5 bg-green-50/50 dark:bg-green-900/10 border-b border-green-100 dark:border-green-900/20 flex justify-between items-center gap-2">
                    {isRenomeandoComanda ? (
                        <input
                            ref={campoRenomeComandaRef}
                            type="text"
                            // So' o nome LIMPO (sem "Comanda N ·") -- sem isto o
                            // campo vinha com o rotulo dentro, obrigando o
                            // operador a apagar antes de digitar. Achado em
                            // 30/09/2026, print do Ikarus.
                            // ...mas preservando o ESPACO no fim enquanto digita: a funcao
                            // faz trim(), e o espaco sumia a cada tecla -- nao dava para
                            // digitar nome e sobrenome (Ikarus, 05/10/2026).
                            value={nomeSemPrefixoDeMesa(customerName) + (nomeSemPrefixoDeMesa(customerName) ? (customerName.match(/\s+$/)?.[0] ?? '') : '')}
                            onChange={e => setCustomerName(e.target.value)}
                            onKeyDown={e => {
                                // ENTER fecha o campo E JÁ ENVIA a comanda --
                                // pedido do Ikarus, 30/09: "digitei o nome,
                                // não tinha porque me fazer clicar de novo em
                                // Enviar Comanda". Vale com ou sem nome
                                // digitado (Enter vazio também envia).
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsRenomeandoComanda(false);
                                    // Devolve o foco para fora do input antes de
                                    // qualquer outra coisa -- sem isto o campo
                                    // some da tela mas o navegador mantem o foco
                                    // nele (agora invisivel), e o handler global
                                    // de teclado continua achando que "esta
                                    // digitando", ignorando o proximo codigo de
                                    // produto. Achado em 30/09/2026 (Ikarus: "C,
                                    // N, nome, Enter, código, Enter e não lançou").
                                    (e.target as HTMLInputElement).blur();
                                    if (cart.length > 0 && !isProcessing) handleFinalize();
                                }
                                // ESC só cancela o nome, não envia nada.
                                if (e.key === 'Escape') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsRenomeandoComanda(false);
                                    (e.target as HTMLInputElement).blur();
                                }
                            }}
                            placeholder="Nome do cliente (opcional)"
                            className="flex-1 px-3 py-1.5 rounded-lg text-sm font-bold text-green-900 dark:text-green-100 bg-white dark:bg-gray-900 border-2 border-green-400 outline-none"
                        />
                    ) : (
                        <h3 className="font-black text-green-700 dark:text-green-400 uppercase tracking-widest text-xs flex flex-col items-center gap-1 flex-1 min-w-0">
                            {/* Selo da comanda (compacto, 05/10/2026: o cabecalho ocupava
                                espaco demais e o carrinho mostrava poucas linhas). */}
                            <span className="relative inline-flex items-center gap-1.5 px-3 py-0.5 bg-green-600 text-white rounded-full border border-green-400 shadow shadow-green-600/30">
                                <span className="absolute inset-0 rounded-full border border-green-400 animate-ping opacity-60"></span>
                                <span className="w-1.5 h-1.5 bg-white rounded-full shrink-0"></span>
                                <span className="text-xs tracking-wide">
                                    {selectedTable ? `Comanda ${selectedTable}` : 'Comanda nova'}
                                    {nomeSemPrefixoDeMesa(customerName) ? ` - ${nomeSemPrefixoDeMesa(customerName)}` : ''}
                                </span>
                            </span>
                            {/* Legenda de atalhos (laranja) + colinha dos produtos ADD (violeta) no MESMO
                                fluxo, em pilulas pequenas. A colinha le do cardapio os produtos cujo nome
                                comeca com "ADD" e rotula pelo PRECO (ADD 3, ADD 10...). */}
                            <span className="flex items-center gap-1 flex-wrap justify-center">
                                {[
                                    { tecla: 'N', acao: 'RENOMEIA' },
                                    { tecla: 'CÓDIGO', acao: 'LANÇA' },
                                    { tecla: '+/-', acao: 'QTD' },
                                    { tecla: 'DEL', acao: 'REMOVE ÚLTIMO' },
                                    { tecla: 'B', acao: 'BALANÇA' },
                                    { tecla: 'ENTER', acao: 'ENVIA' },
                                    { tecla: 'F7', acao: 'CHECKOUT' },
                                    { tecla: 'F8', acao: 'DIVIDIR CONTA' },
                                    { tecla: 'X', acao: 'FECHA' },
                                ].map(({ tecla, acao }) => (
                                    <span key={tecla} className="inline-flex items-center gap-0.5 px-1.5 py-px bg-orange-500/20 border border-orange-500/60 rounded-full">
                                        <kbd className="px-1 bg-orange-500/50 rounded text-[9px] font-black uppercase text-gray-900 dark:text-white">{tecla}</kbd>
                                        <span className="text-[9px] font-black uppercase text-gray-900 dark:text-white">{acao}</span>
                                    </span>
                                ))}
                                {menuItems
                                    .filter(p => p.codigo !== undefined && /^ADD\b/i.test(p.name.trim()))
                                    .sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0))
                                    .map(p => (
                                        <span key={p.id} className="inline-flex items-center gap-0.5 px-1.5 py-px bg-violet-500/15 border border-violet-500/40 rounded-full" title={`${p.name} — R$ ${(Number(p.price) || 0).toFixed(2)}`}>
                                            <span className="text-[9px] font-black uppercase text-gray-900 dark:text-white">{`ADD ${Number(p.price) || 0}`}</span>
                                            <kbd className="px-1 bg-violet-500/30 rounded text-[9px] font-black text-gray-900 dark:text-white">{p.codigo}</kbd>
                                        </span>
                                    ))}
                            </span>
                        </h3>
                    )}
                    {/* Mute do bipe de "comanda enviada" -- pedido do Ikarus
                        01/10/2026, não afeta os outros bipes (item/erro). */}
                    <button
                        type="button"
                        onClick={alternarMuteBipeEnvio}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg shrink-0"
                        title={muteBipeEnvio ? 'Som de comanda enviada: desligado (clique pra ligar)' : 'Som de comanda enviada: ligado (clique pra desligar)'}
                    >
                        {muteBipeEnvio ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                    <button
                        type="button"
                        onClick={() => fecharComandaAtivaRef.current()}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg shrink-0"
                        title="Voltar para a lista de comandas (tecla X)"
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1 scrollbar-hide">
                    {/* UMA linha por item (05/10/2026): nome | sabor | - qtd + | valor | lixeira.
                        Antes cada item ocupava 2 linhas e o carrinho mostrava ~5 itens. Os
                        adicionais vao na mesma linha, em cinza e truncados (o nome completo
                        aparece ao passar o mouse). */}
                    {cart.map(item => {
                        const detalhe = item.selectedAddons.length > 0 ? item.selectedAddons.map(a => a.name).join(', ') : '';
                        const valorLinha = (((Number(item.price) || 0) + item.selectedAddons.reduce((s, a) => s + (Number(a.price) || 0), 0)) * item.quantity);
                        return (
                        <div key={item.cartId} className="flex items-center gap-1.5 bg-gray-50/50 dark:bg-gray-700/20 rounded-lg pl-2 pr-1 py-0.5 border border-gray-100 dark:border-gray-700">
                            <span className="flex-1 min-w-0 truncate font-bold text-gray-800 dark:text-gray-100 text-xs uppercase tracking-tight" title={detalhe ? `${item.name} — ${detalhe}` : item.name}>
                                {item.name}
                                {detalhe && <span className="font-medium normal-case tracking-normal text-[10px] text-gray-500 dark:text-gray-400"> · {detalhe}</span>}
                            </span>
                            {/* Produto sem preco proprio (preco no sabor): chama atencao ate escolher o
                                sabor. So aparece quando o produto TEM opcoes de sabor cadastradas. */}
                            {opcoesDeSaborDoProduto(item).length > 0 && (
                                <button
                                    onClick={() => openAddonModal(item)}
                                    className={`shrink-0 px-1.5 py-0.5 text-[9px] font-black rounded uppercase tracking-wide transition-all border ${
                                        item.selectedAddons.length === 0
                                            ? 'bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-200'
                                            : 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200/50 dark:border-green-700/50 hover:bg-green-100'
                                    }`}
                                >
                                    {item.selectedAddons.length === 0 ? '+ Adds' : `Adds (${item.selectedAddons.length})`}
                                </button>
                            )}
                            <div className="shrink-0 flex items-center bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-px">
                                <button onClick={() => updateQuantity(item.cartId, -1)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 transition-colors"><Minus size={12} /></button>
                                <span className="px-1.5 text-xs font-black min-w-[18px] text-center">{item.quantity}</span>
                                <button onClick={() => updateQuantity(item.cartId, 1)} className="p-1 hover:bg-green-50 dark:hover:bg-green-900/30 rounded text-green-600 transition-colors"><Plus size={12} /></button>
                            </div>
                            <span className="shrink-0 w-[72px] text-right font-black text-gray-900 dark:text-white text-xs whitespace-nowrap">R$ {valorLinha.toFixed(2)}</span>
                            <button onClick={() => removeItem(item.cartId)} className="shrink-0 p-1 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title="Remover item"><Trash2 size={13} /></button>
                        </div>
                        );
                    })}
                    {cart.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-gray-300 dark:text-gray-600 opacity-50 space-y-2">
                            <ShoppingBag size={48} strokeWidth={1} />
                            <p className="font-bold uppercase tracking-widest text-[10px]">Carrinho vazio</p>
                            <p className="text-[10px]">Digite o código do produto (cai na hora), ENTER envia a comanda, ou aperte B para pegar o peso</p>
                        </div>
                    )}
                </div>
                <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700 space-y-2">
                    <div className="flex justify-between items-end">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">TOTAL</span>
                        <span className="text-xl font-black text-primary tracking-tighter">R$ {Number(total).toFixed(2)}</span>
                    </div>
                    {/* CRÍTICO (achado 02/10/2026, relato do Ikarus: "deletei os
                        itens, o botão nem dava pra clicar, achei que ia sumir
                        sozinho"): disabled bloqueava com carrinho vazio, mesmo
                        quando a comanda JÁ tinha pedido no banco -- handleFinalize
                        exclui a comanda nesse caso, mas o botão nunca chegava a
                        chamar. Agora só desabilita se não há NADA a fazer
                        (carrinho vazio E nunca teve pedido nenhum). */}
                    <button
                        onClick={() => handleFinalize()}
                        disabled={(cart.length === 0 && pedidosDaMesa.length === 0) || isProcessing}
                        className={`w-full py-2.5 rounded-xl font-black text-sm uppercase tracking-widest transition-all shadow-xl flex items-center justify-center gap-2 active:scale-[0.98] ${
                            (cart.length === 0 && pedidosDaMesa.length === 0) || isProcessing
                                ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed shadow-none'
                                : cart.length === 0
                                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/20'
                                    : 'bg-green-600 hover:bg-green-700 text-white shadow-green-600/20'
                        }`}
                    >
                        {isProcessing ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : cart.length === 0 ? <><span>Excluir Comanda</span><X size={18} strokeWidth={3} /></> : <><span>Enviar Comanda</span><Plus size={18} strokeWidth={3} /></>}
                    </button>
                </div>
            </div>
            ) : settings?.balcaoV2 ? (
            /* CARD ÚNICO DE COMANDAS (Balcão V2) — substitui as colunas de
               Carrinho + Mesa/Retirada/Entrega. Lista as comandas em
               andamento; clicar numa abre o carrinho dela (acima). */
            <div className="flex-[6] min-h-0 flex flex-col bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-orange-100 dark:border-orange-900/30 md:overflow-hidden">
                <div className="p-4 bg-orange-50/50 dark:bg-orange-900/10 border-b border-orange-100 dark:border-orange-900/20 flex justify-between items-center">
                    <h3 className="font-black text-orange-700 dark:text-orange-400 uppercase tracking-widest text-xs flex items-center gap-2">
                        <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>
                        Comandas em Andamento ({cardsComandas.length})
                    </h3>
                    <button
                        type="button"
                        onClick={() => abrirProximaComandaLivreRef.current()}
                        className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-all shadow-md shadow-orange-600/20 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider"
                        title="Abrir comanda nova (tecla C)"
                    >
                        <Plus size={15} strokeWidth={3} />
                        <span>Comanda <kbd className="px-1 bg-white/20 rounded ml-0.5">C</kbd></span>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
                    {(() => {
                        if (cardsComandas.length === 0) {
                            return (
                                <div className="flex flex-col items-center justify-center h-full text-gray-300 dark:text-gray-600 opacity-50 space-y-2">
                                    <ShoppingBag size={48} strokeWidth={1} />
                                    <p className="font-bold uppercase tracking-widest text-[10px]">Nenhuma comanda aberta</p>
                                    <p className="text-[10px]">Aperte <kbd className="px-1 bg-gray-200 dark:bg-gray-700 rounded">C</kbd> para começar</p>
                                </div>
                            );
                        }

                        return (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {cardsComandas.map(c => {
                                    const numero = c.id.replace('slot-', '');
                                    // Cores por status (pedido do Ikarus, 30/09):
                                    // laranja = é a que está aberta na tela agora;
                                    // vermelho = rascunho pendente, ainda não enviado
                                    //   (precisa terminar o atendimento);
                                    // verde = já enviada, virou pedido de verdade.
                                    // Verde tem prioridade sobre "ativa": uma comanda ja
                                    // enviada fica verde mesmo sendo a que esta aberta na
                                    // tela agora -- laranja so' enquanto ainda nao enviou
                                    // nada (pedido do Ikarus, 30/09).
                                    const cor = c.enviada ? 'green' : c.ativa ? 'orange' : 'red';
                                    return (
                                    <div key={c.id} className="relative group">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (c.ativa) { setIsComandaModalOpen(true); return; }
                                                salvarRascunhoAtual();
                                                handleSelectTable(numero.padStart(2, '0'), `Comanda ${numero}`);
                                                setIsComandaModalOpen(true);
                                            }}
                                            className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                                                cor === 'orange' ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 shadow-md' :
                                                cor === 'red' ? 'border-red-400 bg-red-50 dark:bg-red-900/20 hover:border-red-500' :
                                                'border-green-400 bg-green-50 dark:bg-green-900/20 hover:border-green-500'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between mb-1 pr-5">
                                                <span className={`font-black text-sm ${
                                                    cor === 'orange' ? 'text-orange-700 dark:text-orange-300' :
                                                    cor === 'red' ? 'text-red-700 dark:text-red-300' :
                                                    'text-green-700 dark:text-green-300'
                                                }`}>
                                                    {c.identificador}
                                                </span>
                                                {c.enviada && <span className="text-[9px] font-black text-green-600 uppercase">Enviada</span>}
                                                {!c.enviada && c.ativa && <span className="text-[9px] font-black text-orange-600 uppercase">Ativa</span>}
                                                {!c.enviada && !c.ativa && <span className="text-[9px] font-black text-red-600 uppercase">Pendente</span>}
                                            </div>
                                            <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                                                <span>{c.itens} {c.itens === 1 ? 'item' : 'itens'}</span>
                                                <span className="font-bold">R$ {c.valor.toFixed(2)}</span>
                                            </div>
                                        </button>
                                        {/* Descartar rascunho direto da lista -- só para
                                            comandas NÃO enviadas (rascunho pendente, com ou
                                            sem estar aberta na tela agora). Uma comanda já
                                            ENVIADA é pedido de verdade: cancelar isso é
                                            operação da aba Pedidos, não daqui. */}
                                        {!c.enviada && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!confirm(`Descartar ${c.identificador}? Os itens lançados serão perdidos.`)) return;
                                                    if (c.ativa) {
                                                        // CRÍTICO (achado 02/10/2026, relato do Ikarus:
                                                        // "clico no X, confirmo, mas a comanda
                                                        // continua lá"): antes só limpava o carrinho
                                                        // (setCart([])) sem FECHAR a tela -- a comanda
                                                        // continuava "ativa" na lista pra sempre,
                                                        // porque cardsComandas sempre inclui o slot
                                                        // ativo, mesmo vazio. Descartar a comanda
                                                        // ativa precisa fechar de verdade, igual o X
                                                        // do cabeçalho já faz, e também limpar
                                                        // qualquer rascunho que tenha sobrado dela.
                                                        setCart([]);
                                                        setCustomerName(`Comanda ${numero}`);
                                                        delete rascunhosComandaRef.current[parseInt(numero, 10)];
                                                        persistirRascunhos();
                                                        setVersaoRascunhos(v => v + 1);
                                                        setIsComandaModalOpen(false);
                                                        setSelectedTable('');
                                                    } else {
                                                        delete rascunhosComandaRef.current[parseInt(numero, 10)];
                                                        persistirRascunhos();
                                                        setVersaoRascunhos(v => v + 1);
                                                    }
                                                }}
                                                className="absolute top-2 right-2 p-1 text-black dark:text-white hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                title={`Descartar ${c.identificador}`}
                                            >
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>
                        );
                    })()}
                </div>
            </div>
            ) : (
            <>
            {/* COLUMN 2: SELECTED ITEMS (CART) - GREEN THEME */}
            <div className="flex-[3] min-h-0 flex flex-col bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-green-100 dark:border-green-900/30 md:overflow-hidden">
                <div className="p-4 bg-green-50/50 dark:bg-green-900/10 border-b border-green-100 dark:border-green-900/20 flex justify-between items-center">
                    <h3 className="font-black text-green-700 dark:text-green-400 uppercase tracking-widest text-xs flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        Produtos no Pedido
                    </h3>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                // Comeca do peso que ja estiver na balanca ao vivo (se houver e
                                // estavel), mas so essa UMA vez -- dali em diante o campo do
                                // modal e independente e nao acompanha mais o stream.
                                setManualWeight(isScaleStable ? scaleWeight : 0);
                                setIsScaleModalOpen(true);
                            }}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-md shadow-blue-600/20 flex items-center gap-1 text-xs font-bold"
                            title="Puxar peso da balança física OU digitar o peso na mão"
                        >
                            <Scale size={15} />
                            <span>Balança</span>
                        </button>
                        <button onClick={() => setIsCustomItemModalOpen(true)} className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all shadow-lg shadow-green-600/20" title="Adicionar Item Avulso">
                            <Plus size={16} strokeWidth={3} />
                        </button>
                    </div>
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
            <div className="flex-[3] min-h-0 flex flex-col bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-red-100 dark:border-red-900/30 md:overflow-hidden">
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
                            {settings?.modeloMesas === 'personalizado' ? (
                                // MODELO 2: cada mesa e uma LINHA INTEIRA (nao mais um
                                // quadrado num grid-cols-5). Pega o "quadrado" que seria
                                // a mesa e estica na largura toda — cabe "MESA 01 - NOME".
                                // Sem altura maxima aqui: quem rola e o container pai
                                // (overflow-y-auto, ja existente), entao a mesa 9+ some da
                                // vista mas continua alcancavel descendo a pagina.
                                <div className="space-y-2">
                                    {Array.from({ length: TOTAL_MESAS }, (_, i) => i + 1).map(num => {
                                        const status = tableStatuses[num];
                                        const isSelected = selectedTable === num.toString().padStart(2, '0');
                                        const nome = nomeDaComanda(
                                            activeOrders.filter(o => mesmaMesa(o.table_number, num))
                                        );
                                        let statusColor = isSelected
                                            ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                                            : (status
                                                ? 'bg-red-50 dark:bg-red-900/20 text-red-600 border-red-100 dark:border-red-900/30'
                                                : 'bg-white dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 border-gray-100 dark:border-gray-600 hover:border-orange-200');
                                        return (
                                            <button
                                                key={num}
                                                onClick={() => handleSelectTable(num.toString().padStart(2, '0'))}
                                                className={`w-full rounded-xl font-black text-sm border-2 transition-all flex items-center px-4 py-3 truncate ${statusColor}`}
                                            >
                                                MESA {num.toString().padStart(2, '0')}{nome ? ` - ${nome}` : ''}
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                // MODELO 1: grade numerada, como sempre foi.
                                <div className="grid grid-cols-5 gap-2">
                                    {Array.from({ length: TOTAL_MESAS }, (_, i) => i + 1).map(num => {
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
                            )}
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
            </>
            )}
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
                            {Array.from({ length: TOTAL_MESAS }, (_, i) => i + 1).map(num => {
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

            {/* MODAL DA BALANÇA ELETRÔNICA */}
            {isScaleModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsScaleModalOpen(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-black text-gray-900 dark:text-white text-lg flex items-center gap-2">
                                <Scale className="text-blue-600 animate-pulse" size={24} /> Pesagem
                            </h3>
                            <button onClick={() => setIsScaleModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2 mb-2">
                            Digite o peso na mão ou use "Capturar da Balança" se tiver uma conectada.
                        </p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">Produto / Descrição</label>
                                <input 
                                    type="text" 
                                    value={scaleItemName}
                                    onChange={e => setScaleItemName(e.target.value)}
                                    placeholder="Ex: Açaí por Quilo / Sorvete"
                                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl font-bold text-gray-900 dark:text-white"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">Preço / Kg (R$)</label>
                                    <input 
                                        type="number" 
                                        step="0.10"
                                        value={scalePricePerKg}
                                        onChange={e => setScalePricePerKg(parseFloat(e.target.value) || 0)}
                                        className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl font-bold text-gray-900 dark:text-white"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                                        Peso (Kg) <span className="text-blue-600 dark:text-blue-400 font-black normal-case">— digite direto se não tiver balança conectada</span>
                                    </label>
                                    <input
                                        type="number"
                                        step="0.005"
                                        value={manualWeight || ''}
                                        onChange={e => setManualWeight(parseFloat(e.target.value) || 0)}
                                        onKeyDown={e => {
                                            // ENTER aqui dentro age como clicar em "Adicionar ao
                                            // Pedido" -- pedido do Ikarus, 28/09/2026. stopPropagation
                                            // evita que o Enter tambem chegue no handler global de
                                            // atalhos do Balcao (ele ja ignora quando modalAbertoRef
                                            // esta true, mas aqui reforça no proprio campo).
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                confirmarPesoManual();
                                            }
                                        }}
                                        placeholder="Digite o peso aqui (ex: 0.350)"
                                        autoFocus
                                        className="w-full px-4 py-2.5 bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-400 rounded-xl font-black text-xl text-blue-700 dark:text-blue-300 text-center"
                                    />
                                </div>
                            </div>

                            {/* DISPLAY DIGITAL BALANÇA */}
                            <div className="bg-slate-950 p-4 rounded-xl border-2 border-slate-800 text-center shadow-inner">
                                <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest block mb-1">Display Balança (Urano / Toledo)</span>
                                <div className="flex justify-around items-baseline font-mono">
                                    <div>
                                        <span className="text-gray-400 text-xs block">PESO</span>
                                        <span className="text-emerald-400 font-extrabold text-3xl tracking-wider">{(manualWeight || 0).toFixed(3)} kg</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-400 text-xs block">TOTAL</span>
                                        <span className="text-yellow-400 font-extrabold text-3xl tracking-wider">R$ {((manualWeight || 0) * (scalePricePerKg || 0)).toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={async () => {
                                        setIsReadingScale(true);
                                        try {
                                            const result = await getScaleWeightWithFallback(settings || undefined);
                                            // Só aceita peso confirmado como estável. Ver Regra 6.
                                            if (!result.isStable || result.weightKg <= 0) {
                                                alert('Peso ainda não estabilizou. Aguarde a balança parar de oscilar e tente novamente.');
                                            } else {
                                                // Copia UMA vez para o campo do modal -- nao gruda no
                                                // stream ao vivo, senao volta o bug de nao "fixar".
                                                setManualWeight(result.weightKg);
                                            }
                                        } catch (err: any) {
                                            alert(err?.message || 'Não foi possível ler a balança. Verifique o cabo USB/Serial.');
                                        } finally {
                                            setIsReadingScale(false);
                                        }
                                    }}
                                    disabled={isReadingScale}
                                    title="So funciona com balanca fisica conectada por USB/Serial"
                                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 text-sm"
                                >
                                    <Scale size={18} className={isReadingScale ? "animate-spin" : ""} />
                                    {isReadingScale ? "Lendo..." : "⚖️ Capturar da Balança"}
                                </button>

                                <button
                                    type="button"
                                    onClick={confirmarPesoManual}
                                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase text-xs tracking-wider shadow-lg shadow-emerald-600/20"
                                >
                                    Adicionar ao Pedido
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE TODAS AS CATEGORIAS */}
            {isCategoryModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in" onClick={() => setIsCategoryModalOpen(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-2xl w-full shadow-2xl border border-gray-100 dark:border-gray-700 flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-gradient-to-br from-purple-500 to-indigo-600 text-white rounded-xl shadow-md">
                                    <Grid size={22} />
                                </div>
                                <div>
                                    <h3 className="font-black text-gray-900 dark:text-white text-lg">Todas as Categorias ({categoriasVisiveis.length})</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Selecione para filtrar os produtos do cardápio</p>
                                </div>
                            </div>
                            <button onClick={() => setIsCategoryModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Campo de Busca de Categoria se houver mais de 6 */}
                        {categoriasVisiveis.length > 6 && (
                            <div className="relative mb-4">
                                <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                                <input 
                                    type="text" 
                                    placeholder="Buscar categoria por nome..." 
                                    value={categorySearchTerm} 
                                    onChange={e => setCategorySearchTerm(e.target.value)} 
                                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-purple-500 outline-none text-gray-900 dark:text-white" 
                                />
                            </div>
                        )}

                        {/* Grid de Categorias */}
                        <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-2 sm:grid-cols-3 gap-3 scrollbar-hide">
                            {mostrarPromocoes && normalizedPromotions.length > 0 && (
                                <button 
                                    onClick={() => {
                                        setSelectedCategoryId(-1);
                                        setIsCategoryModalOpen(false);
                                    }}
                                    className={`p-4 rounded-xl border text-left font-bold transition-all flex flex-col justify-between group relative overflow-hidden
                                        ${selectedCategoryId === -1 
                                            ? 'bg-red-600 text-white border-red-600 shadow-lg shadow-red-500/20' 
                                            : 'bg-red-50/70 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/30 hover:bg-red-100'}`}
                                >
                                    <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider mb-2">
                                        <Percent size={16} />
                                        Promoções
                                    </span>
                                    <div className="flex justify-between items-center text-[10px] font-bold opacity-90">
                                        <span>{normalizedPromotions.length} itens</span>
                                        {selectedCategoryId === -1 && <span className="font-black">✓ SELECIONADO</span>}
                                    </div>
                                </button>
                            )}

                            {categoriasVisiveis
                                .filter(cat => !categorySearchTerm || normalizeString(cat.name).includes(normalizeString(categorySearchTerm)))
                                .map(cat => {
                                    const itemCount = menuItems.filter(i => i.categoryId === cat.id).length;
                                    const isSelected = selectedCategoryId === cat.id;

                                    return (
                                        <button
                                            key={cat.id}
                                            onClick={() => {
                                                setSelectedCategoryId(cat.id);
                                                setIsCategoryModalOpen(false);
                                            }}
                                            className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between group relative overflow-hidden cursor-pointer hover:scale-[1.02]
                                                ${isSelected
                                                    ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20 ring-2 ring-blue-400/30'
                                                    : 'bg-gray-50/80 dark:bg-gray-700/40 hover:bg-blue-50/80 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600'}`}
                                        >
                                            <span className="font-extrabold text-xs uppercase tracking-wider mb-3 leading-snug">
                                                {cat.name}
                                            </span>
                                            <div className="flex justify-between items-center text-[10px] font-bold opacity-80 border-t border-black/5 dark:border-white/10 pt-2">
                                                <span>{itemCount} {itemCount === 1 ? 'produto' : 'produtos'}</span>
                                                {isSelected && <span className="font-black text-white">✓ ATIVO</span>}
                                            </div>
                                        </button>
                                    );
                                })}
                        </div>
                    </div>
                </div>
            )}

            {isAddonModalOpen && editingCartItem && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setIsAddonModalOpen(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full shadow-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Adicionais: {editingCartItem.name}</h3>
                            <button onClick={() => setIsAddonModalOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"><X /></button>
                        </div>
                        <div className="space-y-2">
                            {/* Marcação visual igual ao popup por comando (borda
                                verde + check) -- pedido do Ikarus 02/10/2026:
                                "quando clicamos no sabor dele deveria marcar
                                igual fizemos com o comando S, em todos os
                                produtos, por comando ou por clique". Este modal
                                é o de clique via botão "Adds" do carrinho;
                                antes usava border-primary (roxo fraco), sem
                                nenhum check -- não dava pra saber o que já
                                tinha sido marcado de relance. */}
                            {addons.filter(addon => {
                                const originalItem = menuItems.find(i => i.id === editingCartItem.id);
                                if (originalItem && originalItem.selectedAddons?.length) return originalItem.selectedAddons.some(a => a.id === addon.id);
                                return addon.categoryId === editingCartItem.categoryId;
                            }).map(addon => {
                                const isSelected = editingCartItem.selectedAddons.some(a => a.id === addon.id);
                                return (
                                    <button
                                        key={addon.id}
                                        onClick={() => handleAddAddon(addon)}
                                        className={`w-full flex justify-between items-center p-3 rounded-lg border-2 transition-colors ${
                                            isSelected
                                                ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                                                : 'border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100'
                                        }`}
                                    >
                                        <span className="font-medium flex items-center gap-1.5">
                                            {isSelected && <Check size={14} className="shrink-0" />}
                                            {addon.name}
                                        </span>
                                        <span className="text-sm font-bold">+ R$ {addon.price.toFixed(2)}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <button onClick={() => setIsAddonModalOpen(false)} className="w-full mt-4 py-2 bg-primary text-white rounded-lg font-bold">Concluir</button>
                    </div>
                </div>
            )}

            {/* Popup de escolha de sabor por teclado (Balcão V2) -- SEM clique.
                Abre sozinho assim que o código digitado bate com um produto de
                2+ sabores (ver bloco de dígitos do handler). ↑↓ navega, Enter
                lança o sabor escolhido na comanda, ESC cancela sem lançar
                nada. Pedido do Ikarus, 01/10/2026, véspera da demo: "tudo é
                atalho, não vamos usar clique de hora nenhuma". */}
            {seletorSabor && (() => {
                // Separa opcional (R$0,00) de adicional (pago) dentro da MESMA
                // lista -- pedido do Ikarus 02/10/2026: "tá misturado o que é
                // opcional de graça junto com os adicionais com valor". Mantém
                // a ordem/índice original (data-sabor-idx) pra ↑↓/scroll
                // continuarem funcionando, só agrupa visualmente com um
                // cabeçalho de seção entre os dois blocos.
                const graficos = seletorSabor.opcoes.map((addon, idx) => ({ addon, idx }));
                const semAdicional = graficos.filter(g => g.addon === null);
                const opcionais = graficos.filter(g => g.addon !== null && Number(g.addon!.price) === 0);
                const adicionais = graficos.filter(g => g.addon !== null && Number(g.addon!.price) > 0);
                // Multi-seleção (S, só etapa 'unico'): item MARCADO fica com
                // borda verde pintada -- diferente do cursor atual (azul),
                // pedido do Ikarus 02/10/2026: "nós pintamos a borda quando
                // selecionado". Os dois estados podem coexistir (cursor em
                // cima de um item já marcado).
                const linha = (g: { addon: Addon | null; idx: number }) => {
                    const ehCursor = g.idx === seletorSabor.indice;
                    const ehMarcado = seletorSabor.marcados.has(g.idx);
                    const clicavel = seletorSabor.etapa === 'unico' && g.idx > 0;
                    return (
                    <div
                        key={g.addon ? g.addon.id : 'sem-adicional'}
                        data-sabor-idx={g.idx}
                        onClick={clicavel ? () => alternarMarcacaoSeletor(g.idx) : undefined}
                        className={`w-full flex justify-between items-center p-3 rounded-lg border-2 transition-colors ${clicavel ? 'cursor-pointer' : ''} ${
                            ehMarcado
                                ? (ehCursor ? 'border-green-500 bg-green-600 text-white shadow-lg shadow-green-600/30' : 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400')
                                : ehCursor
                                    ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                                    : g.addon === null
                                        ? 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 border-dashed'
                                        : 'border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200'
                        }`}
                    >
                        <span className="font-bold flex items-center gap-1.5">
                            {ehCursor ? '▶ ' : ''}
                            {ehMarcado && <Check size={14} className="shrink-0" />}
                            {g.addon ? g.addon.name : 'Prosseguir sem adicional'}
                        </span>
                        {g.addon && (
                            <span className="text-sm font-bold">
                                {Number(g.addon.price) === 0 ? 'Grátis' : `+ R$ ${Number(g.addon.price).toFixed(2)}`}
                            </span>
                        )}
                    </div>
                    );
                };
                return (
                <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full shadow-2xl max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">{seletorSabor.produto.name}</h3>
                                {seletorSabor.etapa !== 'unico' && (
                                    <p className="text-[11px] font-black uppercase text-blue-600 dark:text-blue-400 mt-0.5">
                                        {seletorSabor.etapa === 'sabor' ? '1/2 · Escolha o sabor' : '2/2 · Escolha a calda'}
                                    </p>
                                )}
                            </div>
                            <span className="text-[10px] font-black text-gray-400 uppercase">ESC {seletorSabor.etapa === 'calda' ? 'volta' : 'cancela'}</span>
                        </div>
                        <div className="space-y-2">
                            {semAdicional.map(linha)}
                            {opcionais.length > 0 && (
                                <>
                                    <p className="text-[10px] font-black uppercase text-gray-400 pt-2">Opcionais (grátis)</p>
                                    {opcionais.map(linha)}
                                </>
                            )}
                            {adicionais.length > 0 && (
                                <>
                                    <p className="text-[10px] font-black uppercase text-gray-400 pt-2">Adicionais (com valor)</p>
                                    {adicionais.map(linha)}
                                </>
                            )}
                        </div>
                        <div className="mt-4 flex items-center justify-center gap-1.5 flex-wrap">
                            {[
                                { tecla: '↑↓', acao: 'NAVEGA' },
                                ...(seletorSabor.etapa === 'unico' ? [{ tecla: 'S', acao: 'MARCA' }] : []),
                                { tecla: 'ENTER', acao: seletorSabor.etapa === 'sabor' ? 'PRÓXIMO' : 'LANÇA NA COMANDA' },
                                { tecla: 'C', acao: 'PAUSA · NOVA COMANDA' },
                                { tecla: 'ESC', acao: seletorSabor.etapa === 'calda' ? 'VOLTA' : 'CANCELA' },
                            ].map(({ tecla, acao }) => (
                                <span key={tecla} className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-500/20 border border-orange-500/60 rounded-full">
                                    <kbd className="px-1.5 py-0.5 bg-orange-500/50 rounded text-[10px] font-black uppercase text-gray-900 dark:text-white">{tecla}</kbd>
                                    <span className="text-[10px] font-black uppercase text-gray-900 dark:text-white">{acao}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
                );
            })()}
        </div>
    );
});

export default CounterTab;
