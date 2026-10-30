import React, { useEffect, useMemo, useState } from 'react';
import { Phone, MessageCircle, Clock, Volume2, X } from 'lucide-react';
import type { Order } from '../types';
import { testarSirene, VOLUME_PADRAO } from '../services/sireneService';

/**
 * Pedidos para o celular (30/10/2026), pensada para a loja de comissão: sem PC, sem impressora.
 * Uma lista vertical, um pedido por cartão, botões grandes que fazem o pedido andar, e cancelamento com
 * motivo obrigatório (o cliente é avisado e a plataforma audita cancelamento para a comissão não ser burlada).
 * Quem chama (AdminPage) entrega os pedidos em andamento e as ações; o toque de pedido novo continua sendo
 * o mesmo do painel (sireneService), e aqui só há o botão que libera o som no celular.
 */
type Status = Order['status'];

const MOTIVOS = [
    'Cliente pediu para cancelar',
    'Produto em falta',
    'Fora da área de entrega',
    'Sem entregador agora',
    'Loja fechada',
    'Outro motivo',
];

const brl = (v: number) => `R$ ${(Number(v) || 0).toFixed(2).replace('.', ',')}`;

const minutosDesde = (t?: string): number => (t ? Math.max(0, Math.floor((Date.now() - new Date(t).getTime()) / 60000)) : 0);

const ehEntrega = (o: Order) => String(o.orderType || '').toLowerCase().includes('entrega');

const PRIORIDADE: Record<string, number> = { 'Novo': 0, 'Em Produção': 1, 'A Caminho': 2, 'No Portão': 2 };

/** Próximo passo do pedido e o rótulo do botão grande. */
export function proximoPasso(o: Order): { status: Status; rotulo: string } | null {
    switch (o.status) {
        case 'Novo': return { status: 'Em Produção', rotulo: 'Aceitar e produzir' };
        case 'Em Produção': return ehEntrega(o)
            ? { status: 'A Caminho', rotulo: 'Saiu para entrega' }
            : { status: 'Entregue', rotulo: 'Entregue ao cliente' };
        case 'A Caminho':
        case 'No Portão': return { status: 'Entregue', rotulo: 'Entregue' };
        default: return null;
    }
}

const textoPagamento = (o: Order): string => {
    if (o.paymentMethod === 'Dinheiro') return `Dinheiro${o.changeFor ? `, troco para ${brl(Number(String(o.changeFor).replace(',', '.')))}` : ''}`;
    return String(o.paymentMethod || '');
};

interface Props {
    pedidos: Order[];
    onAvancar: (pedido: Order, novoStatus: Status) => void;
    onCancelar: (pedido: Order, motivo: string) => void;
}

export const PedidosCelular: React.FC<Props> = ({ pedidos, onAvancar, onCancelar }) => {
    const [, setTick] = useState(0);
    const [cancelando, setCancelando] = useState<Order | null>(null);
    const [motivo, setMotivo] = useState(MOTIVOS[0]);
    const [detalhe, setDetalhe] = useState('');
    const [somTestado, setSomTestado] = useState(false);
    const [dicaFechada, setDicaFechada] = useState(() => { try { return localStorage.getItem('pedidos_dica_pwa') === '1'; } catch (_) { return false; } });

    // Os minutos de espera de cada pedido andam sozinhos.
    useEffect(() => {
        const t = setInterval(() => setTick(x => x + 1), 30000);
        return () => clearInterval(t);
    }, []);

    const lista = useMemo(() => [...pedidos].sort((a, b) =>
        (PRIORIDADE[a.status] ?? 9) - (PRIORIDADE[b.status] ?? 9) ||
        new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()), [pedidos]);

    const instalado = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (window.navigator as any).standalone === true);

    const confirmarCancelamento = () => {
        if (!cancelando) return;
        const texto = motivo === 'Outro motivo' && detalhe.trim() ? `Outro motivo: ${detalhe.trim()}` : motivo;
        onCancelar(cancelando, texto);
        setCancelando(null); setMotivo(MOTIVOS[0]); setDetalhe('');
    };

    return (
        <div className="flex-1 min-h-0 overflow-y-auto pb-24">
            <div className="sticky top-0 z-10 bg-gray-100 dark:bg-gray-900 pb-3">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-xl font-black text-gray-900 dark:text-gray-100">
                        Pedidos <span className="ml-1 inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded-full bg-red-600 text-white text-sm">{lista.length}</span>
                    </h2>
                    <button
                        onClick={() => { testarSirene('sino', VOLUME_PADRAO); setSomTestado(true); }}
                        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${somTestado ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-amber-500 text-slate-950'}`}
                    >
                        <Volume2 size={16} /> {somTestado ? 'Som ativado' : 'Ativar o som'}
                    </button>
                </div>
                {!somTestado && <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">Toque em Ativar o som uma vez. Sem isso o celular não toca quando chegar pedido.</p>}
                {!instalado && !dicaFechada && (
                    <div className="mt-2 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 px-3 py-2 text-xs text-sky-900 dark:text-sky-200 flex items-start gap-2">
                        <span className="flex-1">Para o aviso chegar com o celular bloqueado, adicione este aplicativo à tela inicial (menu do navegador, Adicionar à tela inicial).</span>
                        <button onClick={() => { setDicaFechada(true); try { localStorage.setItem('pedidos_dica_pwa', '1'); } catch (_) { /* tudo bem */ } }} aria-label="Fechar aviso"><X size={16} /></button>
                    </div>
                )}
            </div>

            {lista.length === 0 ? (
                <div className="mt-10 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center">
                    <p className="text-lg font-black text-gray-800 dark:text-gray-100">Nenhum pedido agora</p>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Quando chegar um pedido, o celular toca e ele aparece aqui.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {lista.map(o => {
                        const passo = proximoPasso(o);
                        const espera = minutosDesde(o.timestamp);
                        const urgente = o.status === 'Novo' && espera >= 5;
                        const fone = String(o.phone || '').replace(/\D/g, '');
                        return (
                            <article key={o.id} className={`rounded-2xl bg-white dark:bg-gray-800 shadow border-2 ${o.status === 'Novo' ? 'border-red-500' : 'border-transparent'} overflow-hidden`}>
                                <header className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/50">
                                    <div>
                                        <p className="text-lg font-black text-gray-900 dark:text-gray-100">Pedido #{o.dailyOrderNumber || '-'}</p>
                                        <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{o.status} · {ehEntrega(o) ? 'Entrega' : 'Retirada'}</p>
                                    </div>
                                    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${urgente ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-100'}`}>
                                        <Clock size={14} /> {espera} min
                                    </span>
                                </header>

                                <div className="px-4 py-3 space-y-3">
                                    <div>
                                        <p className="font-bold text-gray-900 dark:text-gray-100">{o.customerName || 'Cliente'}</p>
                                        {ehEntrega(o) && o.address && <p className="text-sm text-gray-600 dark:text-gray-300">{o.address}</p>}
                                        {fone && (
                                            <div className="mt-2 flex gap-2">
                                                <a href={`tel:${fone}`} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 px-3 py-2 text-sm font-semibold text-gray-800 dark:text-gray-100"><Phone size={15} /> Ligar</a>
                                                <a href={`https://wa.me/${fone.length <= 11 ? '55' + fone : fone}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-green-100 dark:bg-green-900/30 px-3 py-2 text-sm font-semibold text-green-800 dark:text-green-300"><MessageCircle size={15} /> WhatsApp</a>
                                            </div>
                                        )}
                                    </div>

                                    <ul className="divide-y divide-gray-100 dark:divide-gray-700 text-sm">
                                        {(o.items || []).map((it, i) => (
                                            <li key={i} className="py-1.5">
                                                <span className="font-bold text-gray-900 dark:text-gray-100">{it.quantity}x {it.name}</span>
                                                {Array.isArray(it.selectedAddons) && it.selectedAddons.length > 0 && (
                                                    <span className="block text-xs text-gray-500 dark:text-gray-400">{it.selectedAddons.map(a => a.name).join(', ')}</span>
                                                )}
                                                {it.notes && <span className="block text-xs italic text-gray-500 dark:text-gray-400">{it.notes}</span>}
                                            </li>
                                        ))}
                                    </ul>
                                    {o.observation && <p className="rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">Obs: {o.observation}</p>}

                                    <div className="flex items-end justify-between border-t border-gray-100 dark:border-gray-700 pt-3">
                                        <div className="text-sm text-gray-600 dark:text-gray-300">
                                            <p>{textoPagamento(o)}</p>
                                            {Number(o.deliveryFee) > 0 && <p className="text-xs">Taxa de entrega {brl(Number(o.deliveryFee))}</p>}
                                        </div>
                                        <p className="text-xl font-black text-gray-900 dark:text-gray-100">{brl(o.total)}</p>
                                    </div>
                                </div>

                                <footer className="px-4 pb-4 flex gap-2">
                                    {passo && (
                                        <button onClick={() => onAvancar(o, passo.status)} className="flex-1 rounded-xl bg-green-600 active:bg-green-700 text-white font-black text-base py-4">{passo.rotulo}</button>
                                    )}
                                    <button onClick={() => setCancelando(o)} className="rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 font-bold text-sm px-4 py-4">{o.status === 'Novo' ? 'Recusar' : 'Cancelar'}</button>
                                </footer>
                            </article>
                        );
                    })}
                </div>
            )}

            {cancelando && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={() => setCancelando(null)}>
                    <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white dark:bg-gray-800 p-5 space-y-4" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-black text-gray-900 dark:text-gray-100">Cancelar o pedido #{cancelando.dailyOrderNumber || ''}?</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300">O cliente é avisado. Escolha o motivo: ele fica registrado.</p>
                        <div className="space-y-2">
                            {MOTIVOS.map(m => (
                                <label key={m} className={`flex items-center gap-3 rounded-lg border px-3 py-3 cursor-pointer ${motivo === m ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-600'}`}>
                                    <input type="radio" name="motivo" checked={motivo === m} onChange={() => setMotivo(m)} className="h-4 w-4" />
                                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{m}</span>
                                </label>
                            ))}
                        </div>
                        {motivo === 'Outro motivo' && (
                            <input value={detalhe} onChange={e => setDetalhe(e.target.value)} placeholder="Explique em poucas palavras" className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-3 text-sm text-gray-900 dark:text-gray-100" />
                        )}
                        <div className="flex gap-2">
                            <button onClick={() => setCancelando(null)} className="flex-1 rounded-xl bg-gray-200 dark:bg-gray-700 font-bold py-3 text-gray-800 dark:text-gray-100">Voltar</button>
                            <button onClick={confirmarCancelamento} disabled={motivo === 'Outro motivo' && !detalhe.trim()} className="flex-1 rounded-xl bg-red-600 disabled:opacity-50 text-white font-bold py-3">Cancelar pedido</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
