import React from 'react';
import type { MenuItem } from '../types';

/**
 * Preço de vitrine do produto no site. Produto com preço R$ 0 cujo valor vem dos
 * sabores/opções pagas (ex.: Picolés Gourmet, sabores de R$ 7 a R$ 10) mostrava
 * "R$ 0.00" -- agora mostra "a partir de R$ 7.00" (o menor preço entre as opções
 * disponíveis). Produto com preço normal continua igual.
 */
export const precoParaExibir = (item: MenuItem): { valor: number; aPartirDe: boolean } => {
    const base = Number(item.price) || 0;
    if (base > 0) return { valor: base, aPartirDe: false };

    const opcoes = (item.selectedAddons && item.selectedAddons.length > 0) ? item.selectedAddons : (item.addons || []);
    const precos = opcoes
        .filter(a => a.isAvailable !== false && Number(a.price) > 0)
        .map(a => Number(a.price));
    if (precos.length === 0) return { valor: base, aPartirDe: false };
    return { valor: Math.min(...precos), aPartirDe: true };
};

export const PrecoDoItem: React.FC<{ item: MenuItem; className?: string }> = ({ item, className }) => {
    const { valor, aPartirDe } = precoParaExibir(item);
    return (
        <span className={className}>
            {aPartirDe && (
                <span className="block text-[9px] font-bold uppercase tracking-wide leading-tight opacity-80 text-right">a partir de</span>
            )}
            R$ {valor.toFixed(2)}
        </span>
    );
};
