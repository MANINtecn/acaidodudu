/**
 * MODAL DE COMPLEMENTOS POR PASSOS (21/10/2026) -- cardápio do site, celular primeiro.
 *
 * Os passos vêm do TIPO de cada item da biblioteca marcado no produto, sempre nesta ordem:
 *   1. Sabor     (obrigatório, escolhe 1)
 *   2. Opcionais (grátis, pode pular)
 *   3. Adicionais (pagos, pode pular)
 *   4. Resumo com quantidade e observação
 * Passo sem item não aparece. Item SEM tipo num produto que tem passos entra em Opcionais (grátis)
 * ou Adicionais (pago) pelo preço, para nada sumir do cardápio.
 * Entrega ao carrinho o MESMO formato do modal antigo (CartItem com selectedAddons), então carrinho,
 * impressão, cozinha, histórico e nota não mudam. Só abre em produto que tem item com tipo.
 *
 * Regra de preço único (Ikarus, 16/10/2026): um sabor por unidade. Quem quer outro sabor usa
 * "+ outro sabor" e leva outra unidade, com o preço cheio.
 */
import React, { useMemo, useState } from 'react';
import { X, Check, ChevronLeft, Minus, Plus } from 'lucide-react';
import type { MenuItem, CartItem, Addon, TipoComplemento } from '../types';

export interface EtapaComplemento { tipo: TipoComplemento; itens: Addon[] }

export const TITULO_ETAPA: Record<TipoComplemento, string> = {
    sabor: 'Escolha o sabor',
    opcional: 'Opcionais',
    adicional: 'Adicionais',
};

const ORDEM: TipoComplemento[] = ['sabor', 'opcional', 'adicional'];

const itensDoProduto = (item: MenuItem): Addon[] =>
    (item.selectedAddons && item.selectedAddons.length > 0) ? item.selectedAddons : (item.addons || []);

/** O produto usa o passo a passo? (tem pelo menos 1 item com tipo) */
export const produtoTemPassos = (item: MenuItem): boolean => itensDoProduto(item).some(a => !!a.tipoComplemento);

/** Monta os passos do produto na ordem fixa, só com itens disponíveis. */
export function montarEtapas(item: MenuItem): EtapaComplemento[] {
    const disponiveis = itensDoProduto(item).filter(a => a.isAvailable !== false);
    const tipoDe = (a: Addon): TipoComplemento => a.tipoComplemento || ((Number(a.price) || 0) > 0 ? 'adicional' : 'opcional');
    return ORDEM
        .map(tipo => ({ tipo, itens: disponiveis.filter(a => tipoDe(a) === tipo) }))
        .filter(e => e.itens.length > 0);
}

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

export const ModalComplementos: React.FC<{
    item: MenuItem;
    onAddToCart: (item: CartItem) => void;
    onClose: () => void;
}> = ({ item, onAddToCart, onClose }) => {
    const etapas = useMemo(() => montarEtapas(item), [item]);
    const [passo, setPasso] = useState(0);
    const [escolhas, setEscolhas] = useState<Partial<Record<TipoComplemento, Addon[]>>>({});
    const [quantidade, setQuantidade] = useState(1);
    const [obs, setObs] = useState('');
    const [adicionado, setAdicionado] = useState<string | null>(null);

    const etapa = passo < etapas.length ? etapas[passo] : null;
    const temSabor = etapas.some(e => e.tipo === 'sabor');
    const escolhidosDe = (t: TipoComplemento) => escolhas[t] || [];

    const alternar = (t: TipoComplemento, a: Addon) => {
        setEscolhas(prev => {
            const atuais = prev[t] || [];
            if (t === 'sabor') return { ...prev, sabor: [a] };          // escolhe 1: troca
            return atuais.some(x => x.id === a.id)
                ? { ...prev, [t]: atuais.filter(x => x.id !== a.id) }
                : { ...prev, [t]: [...atuais, a] };
        });
    };

    const selecionados: Addon[] = etapas.flatMap(e => escolhidosDe(e.tipo));
    const unitario = (Number(item.price) || 0) + selecionados.reduce((s, a) => s + (Number(a.price) || 0), 0);
    const total = unitario * quantidade;
    const sabor = escolhidosDe('sabor')[0];

    const podeAvancar = !etapa || etapa.tipo !== 'sabor' || !!sabor;

    const adicionar = () => {
        onAddToCart({
            ...item,
            cartId: `${item.id}-${Date.now()}`,
            quantity: quantidade,
            isCombo: false,
            selectedAddons: selecionados,
            notes: obs.trim(),
        });
        setAdicionado(sabor ? sabor.name : item.name);
    };

    const outroSabor = () => { setEscolhas({}); setQuantidade(1); setObs(''); setPasso(0); setAdicionado(null); };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-end md:items-center justify-center p-0 md:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-[#130826] border border-purple-500/30 md:rounded-3xl rounded-t-3xl w-full max-w-lg h-[92vh] md:h-auto md:max-h-[90vh] flex flex-col text-white overflow-hidden" data-testid="modal-complementos">
                <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-purple-500/20 shrink-0">
                    {passo > 0 && !adicionado ? (
                        <button onClick={() => setPasso(p => p - 1)} className="p-2 -ml-2 rounded-full hover:bg-white/10" aria-label="Voltar" data-testid="voltar"><ChevronLeft size={22} /></button>
                    ) : <div className="w-2" />}
                    <div className="flex-1 min-w-0">
                        <p className="font-black text-base truncate">{item.name}</p>
                        <p className="text-xs text-purple-200/80">{brl(Number(item.price) || 0)}{sabor ? ` · ${sabor.name}` : ''}</p>
                    </div>
                    {!adicionado && (
                        <div className="flex gap-1" aria-hidden>
                            {[...etapas, null].map((_, i) => <span key={i} className={`w-2 h-2 rounded-full ${i === passo ? 'bg-purple-400' : i < passo ? 'bg-purple-700' : 'bg-white/15'}`} />)}
                        </div>
                    )}
                    <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-white/10" aria-label="Fechar" data-testid="fechar"><X size={20} /></button>
                </div>

                {adicionado ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6 text-center" data-testid="adicionado">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center"><Check size={34} /></div>
                        <div>
                            <p className="text-xl font-black">Adicionado!</p>
                            <p className="text-sm text-purple-200/80 mt-1">{item.name} · {adicionado}</p>
                        </div>
                        <div className="w-full flex flex-col gap-2">
                            {temSabor && <button onClick={outroSabor} className="w-full py-3.5 rounded-2xl bg-purple-600 hover:bg-purple-500 font-black" data-testid="outro-sabor">+ Outro sabor</button>}
                            <button onClick={onClose} className="w-full py-3.5 rounded-2xl bg-white/10 hover:bg-white/15 font-bold" data-testid="continuar-comprando">Continuar comprando</button>
                        </div>
                    </div>
                ) : etapa ? (
                    <>
                        <div className="px-4 pt-4 shrink-0">
                            <p className="text-lg font-black" data-testid="titulo-passo">{TITULO_ETAPA[etapa.tipo]}</p>
                            <p className="text-xs text-purple-200/70 mt-0.5">
                                {etapa.tipo === 'sabor' ? 'Obrigatório · escolha 1 (quer outro sabor? adicione outra unidade no final)'
                                    : etapa.tipo === 'opcional' ? 'Grátis · escolha quantos quiser, ou pule'
                                    : 'Escolha quantos quiser, ou pule'}
                            </p>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                            {etapa.itens.map(a => {
                                const marcado = escolhidosDe(etapa.tipo).some(x => x.id === a.id);
                                const unico = etapa.tipo === 'sabor';
                                return (
                                    <button key={a.id} onClick={() => alternar(etapa.tipo, a)} data-testid={`opcao-${a.id}`}
                                        className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all ${marcado ? 'border-purple-400 bg-purple-500/20' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
                                        <span className={`w-5 h-5 shrink-0 flex items-center justify-center border-2 ${unico ? 'rounded-full' : 'rounded-md'} ${marcado ? 'border-purple-400 bg-purple-500' : 'border-white/30'}`}>{marcado && <Check size={13} strokeWidth={4} />}</span>
                                        <span className="flex-1 font-bold text-sm">{a.name}</span>
                                        {Number(a.price) > 0 && <span className="text-sm font-black text-emerald-300">+ {brl(Number(a.price))}</span>}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="p-4 border-t border-purple-500/20 shrink-0">
                            <button onClick={() => setPasso(p => p + 1)} disabled={!podeAvancar} data-testid="avancar"
                                className="w-full py-3.5 rounded-2xl font-black bg-purple-600 hover:bg-purple-500 disabled:bg-white/10 disabled:text-white/40">
                                {!podeAvancar ? 'Escolha o sabor para continuar' : (etapa.tipo !== 'sabor' && escolhidosDe(etapa.tipo).length === 0) ? 'Não quero, continuar' : 'Continuar'}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" data-testid="resumo">
                            <p className="text-lg font-black">Confira o seu pedido</p>
                            {etapas.map(e => {
                                const esc = escolhidosDe(e.tipo);
                                return (
                                    <div key={e.tipo} className="text-sm">
                                        <p className="text-xs uppercase tracking-wider text-purple-200/60 font-bold">{e.tipo === 'sabor' ? 'Sabor' : TITULO_ETAPA[e.tipo]}</p>
                                        <p className="font-bold">{esc.length ? esc.map(a => a.name + (Number(a.price) > 0 ? ` (+ ${brl(Number(a.price))})` : '')).join(', ') : 'Nenhum'}</p>
                                    </div>
                                );
                            })}
                            <div>
                                <p className="text-xs uppercase tracking-wider text-purple-200/60 font-bold mb-1">Observação</p>
                                <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} placeholder="Algum pedido especial?" className="w-full rounded-xl bg-white/5 border border-white/10 p-3 text-sm outline-none focus:border-purple-400" data-testid="obs" />
                            </div>
                        </div>
                        <div className="p-4 border-t border-purple-500/20 shrink-0 flex items-center gap-3">
                            <div className="flex items-center bg-white/5 rounded-2xl border border-white/10">
                                <button onClick={() => setQuantidade(q => Math.max(1, q - 1))} className="p-3" aria-label="Menos" data-testid="menos"><Minus size={16} /></button>
                                <span className="w-8 text-center font-black" data-testid="quantidade">{quantidade}</span>
                                <button onClick={() => setQuantidade(q => q + 1)} className="p-3" aria-label="Mais" data-testid="mais"><Plus size={16} /></button>
                            </div>
                            <button onClick={adicionar} className="flex-1 py-3.5 rounded-2xl font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950" data-testid="adicionar">
                                Adicionar {brl(total)}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ModalComplementos;
