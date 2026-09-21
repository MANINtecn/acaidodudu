import { useEffect, useState } from 'react';
import { Star, Gift, Save, Trash2 } from 'lucide-react';
import type { MenuItem, Settings } from '../types';
import {
    fetchLoyaltyRewardItems,
    saveLoyaltyRewardItems,
    updateSettings,
} from '../services/supabaseService';

interface FidelidadeTabProps {
    storeId: string;
    settings: Settings | null;
    menuItems: MenuItem[];
    /** Avisa o AdminPage que settings mudou, para recarregar sem esperar o polling. */
    onSettingsChanged?: (novo: Partial<Settings>) => void;
}

/**
 * Um dos ate 4 slots de produto resgatavel. `null` = slot vazio, ainda nao
 * escolhido — a tela sempre mostra 4 posicoes, preenchidas ou nao.
 */
type Slot = { menuItemId: number | null; pointsCost: string };

const MAX_PRODUTOS = 4;

/**
 * Aba "Fidelidade" — os DOIS modelos que a loja pode usar, nunca os dois ao
 * mesmo tempo (settings.loyaltyModel decide qual esta ativo):
 *
 * 'selo'   — o historico: 10 pedidos elegiveis (>= R$35) = 1 desconto.
 *            Continua existindo como estava, sem mudanca de logica aqui.
 * 'pontos' — novo (17/09/2026): cliente acumula pontos por valor gasto
 *            (regra em calcularPontosGanhos, supabaseService.ts) e resgata
 *            entre ate 4 produtos que a loja escolhe aqui, cada um com seu
 *            custo em pontos.
 *
 * Pedido do Icaro: padronizar numa aba propria em vez de espalhar em
 * Configuracoes, ja que agora sao 2 sistemas distintos.
 */
export default function FidelidadeTab({ storeId, settings, menuItems, onSettingsChanged }: FidelidadeTabProps) {
    const [modelo, setModelo] = useState<'selo' | 'pontos'>(settings?.loyaltyModel || 'selo');
    const [slots, setSlots] = useState<Slot[]>(
        Array.from({ length: MAX_PRODUTOS }, () => ({ menuItemId: null, pointsCost: '' }))
    );
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [salvo, setSalvo] = useState(false);

    // Carrega os produtos ja configurados, uma vez, ao entrar na aba.
    useEffect(() => {
        let cancelado = false;
        (async () => {
            try {
                const itens = await fetchLoyaltyRewardItems(storeId);
                if (cancelado) return;
                const novosSlots = Array.from({ length: MAX_PRODUTOS }, (_, i): Slot => {
                    const item = itens[i];
                    return item
                        ? { menuItemId: item.menu_item_id, pointsCost: String(item.points_cost) }
                        : { menuItemId: null, pointsCost: '' };
                });
                setSlots(novosSlots);
            } catch (err) {
                console.error('[Fidelidade] erro ao carregar produtos resgataveis:', err);
            } finally {
                if (!cancelado) setCarregando(false);
            }
        })();
        return () => { cancelado = true; };
    }, [storeId]);

    useEffect(() => {
        setModelo(settings?.loyaltyModel || 'selo');
    }, [settings?.loyaltyModel]);

    const escolherModelo = async (novo: 'selo' | 'pontos') => {
        setModelo(novo);
        try {
            await updateSettings(storeId, { loyaltyModel: novo });
            onSettingsChanged?.({ loyaltyModel: novo });
        } catch (err) {
            console.error('[Fidelidade] erro ao salvar modelo:', err);
            alert('Nao foi possivel salvar a escolha do modelo. Tente novamente.');
        }
    };

    const atualizarSlot = (indice: number, campo: keyof Slot, valor: string | number | null) => {
        setSlots(prev => prev.map((s, i) => i === indice ? { ...s, [campo]: valor } : s));
        setSalvo(false);
    };

    const limparSlot = (indice: number) => {
        atualizarSlot(indice, 'menuItemId', null);
        atualizarSlot(indice, 'pointsCost', '');
    };

    const salvarProdutos = async () => {
        const preenchidos = slots.filter(s => s.menuItemId !== null);

        // Validacao: todo slot preenchido precisa de um custo em pontos > 0.
        const semCusto = preenchidos.find(s => !s.pointsCost || Number(s.pointsCost) <= 0);
        if (semCusto) {
            alert('Todo produto escolhido precisa de um custo em pontos maior que zero.');
            return;
        }

        setSalvando(true);
        try {
            const itensParaSalvar = preenchidos.map(s => {
                const item = menuItems.find(m => m.id === s.menuItemId)!;
                return {
                    menu_item_id: item.id,
                    points_cost: Number(s.pointsCost),
                    menu_item_name: item.name,
                    menu_item_price: item.price,
                };
            });
            await saveLoyaltyRewardItems(storeId, itensParaSalvar);
            setSalvo(true);
            setTimeout(() => setSalvo(false), 2500);
        } catch (err) {
            console.error('[Fidelidade] erro ao salvar produtos resgataveis:', err);
            alert('Nao foi possivel salvar os produtos. Tente novamente.');
        } finally {
            setSalvando(false);
        }
    };

    // Produtos ja usados em OUTRO slot nao podem ser escolhidos de novo.
    const jaEscolhidos = (indiceAtual: number) =>
        new Set(slots.filter((_, i) => i !== indiceAtual).map(s => s.menuItemId).filter(Boolean));

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Fidelidade</h2>

            {/* Seletor de modelo */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-bold mb-1 text-gray-900 dark:text-gray-100">Modelo de fidelidade</h3>
                <p className="text-[11px] text-gray-500 mb-4">
                    Os dois modelos nunca ficam ativos ao mesmo tempo. Trocar aqui muda para toda a loja.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={() => escolherModelo('selo')}
                        className={`text-left p-4 rounded-lg border-2 transition-all ${
                            modelo === 'selo'
                                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:border-purple-300'
                        }`}
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <Star size={18} className={modelo === 'selo' ? 'text-purple-600' : 'text-gray-400'} />
                            <span className={`font-bold text-sm ${modelo === 'selo' ? 'text-purple-700 dark:text-purple-300' : 'text-gray-900 dark:text-gray-100'}`}>
                                Selo (atual)
                            </span>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            A cada 10 pedidos elegiveis, o cliente ganha um desconto.
                        </p>
                    </button>
                    <button
                        type="button"
                        onClick={() => escolherModelo('pontos')}
                        className={`text-left p-4 rounded-lg border-2 transition-all ${
                            modelo === 'pontos'
                                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:border-purple-300'
                        }`}
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <Gift size={18} className={modelo === 'pontos' ? 'text-purple-600' : 'text-gray-400'} />
                            <span className={`font-bold text-sm ${modelo === 'pontos' ? 'text-purple-700 dark:text-purple-300' : 'text-gray-900 dark:text-gray-100'}`}>
                                Pontos (novo)
                            </span>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            Cliente acumula pontos por valor gasto e resgata produtos escolhidos por voce.
                        </p>
                    </button>
                </div>
            </div>

            {/* Configuracao dos produtos resgataveis — so aparece com Pontos ativo */}
            {modelo === 'pontos' && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-bold mb-1 text-gray-900 dark:text-gray-100">
                        Produtos resgataveis (ate {MAX_PRODUTOS})
                    </h3>
                    <p className="text-[11px] text-gray-500 mb-4">
                        A cada R$15 gastos (pedidos pelo site/app), o cliente ganha pontos. Escolha o que ele pode
                        trocar e quanto custa em pontos.
                    </p>

                    {carregando ? (
                        <p className="text-sm text-gray-400">Carregando...</p>
                    ) : (
                        <div className="space-y-3">
                            {slots.map((slot, indice) => {
                                const usados = jaEscolhidos(indice);
                                const itemSelecionado = menuItems.find(m => m.id === slot.menuItemId);
                                return (
                                    <div key={indice} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center p-3 bg-gray-50 dark:bg-gray-900/40 rounded-lg border border-gray-100 dark:border-gray-700">
                                        <span className="text-[10px] font-black uppercase text-gray-400 w-16 shrink-0">
                                            Slot {indice + 1}
                                        </span>
                                        <select
                                            value={slot.menuItemId ?? ''}
                                            onChange={e => atualizarSlot(indice, 'menuItemId', e.target.value ? Number(e.target.value) : null)}
                                            className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-purple-500"
                                        >
                                            <option value="">— Selecione um produto —</option>
                                            {menuItems
                                                .filter(m => !usados.has(m.id) || m.id === slot.menuItemId)
                                                .map(m => (
                                                    <option key={m.id} value={m.id}>{m.name}</option>
                                                ))}
                                        </select>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min={1}
                                                placeholder="Pontos"
                                                value={slot.pointsCost}
                                                onChange={e => atualizarSlot(indice, 'pointsCost', e.target.value)}
                                                disabled={!slot.menuItemId}
                                                className="w-24 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-40"
                                            />
                                            {itemSelecionado && (
                                                <button
                                                    type="button"
                                                    onClick={() => limparSlot(indice)}
                                                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                                    title="Remover"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            <div className="flex items-center gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={salvarProdutos}
                                    disabled={salvando}
                                    className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white rounded-lg font-bold text-sm transition-all active:scale-95 flex items-center gap-2"
                                >
                                    <Save size={16} />
                                    {salvando ? 'Salvando...' : 'Salvar produtos'}
                                </button>
                                {salvo && (
                                    <span className="text-sm font-bold text-green-600 dark:text-green-400">
                                        Salvo! ✅
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
