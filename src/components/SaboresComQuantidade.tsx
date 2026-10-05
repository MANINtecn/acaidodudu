import React from 'react';
import { Minus as LucideMinus, Plus as LucidePlus } from 'lucide-react';
import type { Addon } from '../types';

/**
 * Lista de sabores com contador (− 0 +) por sabor -- usada nos produtos com
 * `saboresComQuantidade` (picolés). O cliente monta o pedido sabor por sabor
 * ("3 de nata, 3 de morango, 2 de coco") em vez de só marcar/desmarcar.
 * Cada sabor com quantidade > 0 vira UMA linha do carrinho (ver
 * `montarLinhasPorSabor`), então o preço da linha continua sendo
 * (produto + sabor) x quantidade, igual ao resto do app.
 */
interface Props {
    addons: Addon[];
    /** Preço base do produto: somado ao do sabor para mostrar o valor de 1 unidade. */
    precoBase: number;
    quantidades: Record<string, number>;
    onChange: (addonId: string, quantidade: number) => void;
    sanitize: (texto?: string) => string;
}

export const SaboresComQuantidade: React.FC<Props> = ({ addons, precoBase, quantidades, onChange, sanitize }) => (
    <div className="space-y-3">
        <h3 className="text-xs font-black text-purple-300 uppercase tracking-widest flex items-center justify-between">
            <span>Escolha os sabores</span>
            <span className="text-[10px] text-amber-400 font-bold uppercase">(quantidade de cada um)</span>
        </h3>
        <div className="grid grid-cols-1 gap-2">
            {addons.map(addon => {
                const indisponivel = addon.isAvailable === false;
                const qtd = quantidades[addon.id] || 0;
                const unitario = (Number(precoBase) || 0) + (Number(addon.price) || 0);
                return (
                    <div
                        key={addon.id}
                        className={`flex items-center p-3 rounded-2xl border transition-all
                            ${qtd > 0
                                ? 'bg-orange-500/20 border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.2)]'
                                : 'bg-[#1a0c33] border-purple-500/20'}
                            ${indisponivel ? 'opacity-40 grayscale' : ''}`}
                    >
                        <span className="flex-grow text-xs font-bold text-white uppercase tracking-tight">
                            {sanitize(addon.name)}
                        </span>
                        <span className={`font-black text-xs mr-3 ${qtd > 0 ? 'text-amber-400' : 'text-purple-300'}`}>
                            R$ {unitario.toFixed(2)}
                        </span>
                        <div className="flex items-center bg-[#130826] rounded-lg border border-purple-500/30">
                            <button
                                type="button"
                                disabled={indisponivel || qtd === 0}
                                onClick={() => onChange(addon.id, Math.max(0, qtd - 1))}
                                className="w-8 h-8 flex items-center justify-center text-amber-400 disabled:opacity-30 active:scale-90 transition-all"
                                aria-label={`Diminuir ${addon.name}`}
                            >
                                <LucideMinus size={16} />
                            </button>
                            <span className="w-7 text-center text-sm font-black text-white">{qtd}</span>
                            <button
                                type="button"
                                disabled={indisponivel}
                                onClick={() => onChange(addon.id, qtd + 1)}
                                className="w-8 h-8 flex items-center justify-center text-amber-400 disabled:opacity-30 active:scale-90 transition-all"
                                aria-label={`Aumentar ${addon.name}`}
                            >
                                <LucidePlus size={16} />
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    </div>
);

/** Soma das unidades de todos os sabores. */
export const totalUnidadesPorSabor = (quantidades: Record<string, number>) =>
    Object.values(quantidades).reduce((s, q) => s + (q || 0), 0);

/** Valor total: soma de (produto + sabor) x quantidade de cada sabor escolhido. */
export const totalValorPorSabor = (precoBase: number, addons: Addon[], quantidades: Record<string, number>) =>
    addons.reduce((s, a) => s + ((Number(precoBase) || 0) + (Number(a.price) || 0)) * (quantidades[a.id] || 0), 0);

/** Uma entrada de carrinho por sabor com quantidade > 0 (sabor fica em selectedAddons, qtd na linha). */
export const montarLinhasPorSabor = <T extends { id: number | string }>(
    item: T,
    addons: Addon[],
    quantidades: Record<string, number>,
    notes: string,
    agora: number = Date.now(),
) =>
    addons
        .filter(a => (quantidades[a.id] || 0) > 0)
        .map((a, i) => ({
            ...item,
            cartId: `${item.id}-${a.id}-${agora}-${i}`,
            quantity: quantidades[a.id],
            isCombo: false,
            selectedAddons: [a],
            notes,
        }));
