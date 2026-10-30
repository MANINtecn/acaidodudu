import React, { useMemo, useState } from 'react';
import { usePlataforma } from './dados';
import { resumirCancelamentos } from '../../services/comissao';
import { brl, dataHora } from './util';

const PERIODOS = [
    { id: 'hoje', rotulo: 'Hoje', dias: 0 },
    { id: '7', rotulo: '7 dias', dias: 7 },
    { id: '30', rotulo: '30 dias', dias: 30 },
] as const;

const campo = 'bg-gray-700 border-gray-600 rounded-lg p-2 text-white text-sm';

export const PedidosSecao: React.FC = () => {
    const d = usePlataforma();
    const [periodo, setPeriodo] = useState<typeof PERIODOS[number]['id']>('7');
    const [loja, setLoja] = useState('');
    const [soCancelados, setSoCancelados] = useState(false);

    const desde = useMemo(() => {
        const p = PERIODOS.find(x => x.id === periodo)!;
        if (p.dias === 0) { const h = new Date(d.agora); h.setHours(0, 0, 0, 0); return h.getTime(); }
        return d.agora - p.dias * 86400000;
    }, [periodo, d.agora]);

    const doPeriodo = useMemo(() => d.pedidos.filter(p => new Date(p.timestamp).getTime() >= desde), [d.pedidos, desde]);
    const resumos = useMemo(() => resumirCancelamentos(doPeriodo).filter(r => r.cancelados > 0), [doPeriodo]);
    const lista = useMemo(() => doPeriodo.filter(p => (!loja || p.store_id === loja) && (!soCancelados || p.status === 'Cancelado')), [doPeriodo, loja, soCancelados]);
    const nomeDe = (id: string) => d.lojaPorId(id)?.name || 'loja removida';

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white">Pedidos e cancelamentos</h1>
                <p className="text-sm text-gray-400 mt-1">Pedidos de todas as lojas. Em loja de comissão, cancelamento demais pode ser fuga da comissão: por isso o motivo é obrigatório.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <div className="flex rounded-lg overflow-hidden border border-gray-600">
                    {PERIODOS.map(p => <button key={p.id} onClick={() => setPeriodo(p.id)} className={`px-4 py-2 text-sm font-bold ${periodo === p.id ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>{p.rotulo}</button>)}
                </div>
                <select value={loja} onChange={e => setLoja(e.target.value)} className={campo}>
                    <option value="">Todas as lojas</option>
                    {d.stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer"><input type="checkbox" checked={soCancelados} onChange={e => setSoCancelados(e.target.checked)} className="h-4 w-4" /> Só cancelados</label>
                <span className="text-sm text-gray-400 ml-auto">{lista.length} pedidos</span>
            </div>
            {d.pedidosCortados && <p className="text-xs text-yellow-300">Mostrando só os 1.500 pedidos mais recentes dos últimos 30 dias.</p>}

            <section>
                <h2 className="text-xl font-bold text-white mb-3">Cancelamentos por loja</h2>
                {resumos.length === 0 ? <div className="rounded-xl border border-gray-700 bg-gray-800 p-5 text-gray-300 text-sm">Nenhum cancelamento neste período.</div> : (
                    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-700 text-gray-300 uppercase text-xs"><tr><th className="p-3">Loja</th><th className="p-3">Pedidos</th><th className="p-3">Cancelados</th><th className="p-3">Taxa</th><th className="p-3">Valor</th><th className="p-3">Sem motivo</th><th className="p-3">Motivos</th></tr></thead>
                            <tbody className="divide-y divide-gray-700">
                                {resumos.map(r => (
                                    <tr key={r.store_id}>
                                        <td className="p-3 font-bold text-white">{nomeDe(r.store_id)}{r.suspeito && <span className="ml-2 rounded px-2 py-0.5 text-xs font-bold bg-red-900 text-red-200">suspeito</span>}</td>
                                        <td className="p-3 text-gray-300">{r.pedidos}</td>
                                        <td className="p-3 text-gray-300">{r.cancelados}</td>
                                        <td className={`p-3 font-bold ${r.suspeito ? 'text-red-300' : 'text-gray-300'}`}>{String(r.taxaPct).replace('.', ',')}%</td>
                                        <td className="p-3 text-gray-300">{brl(r.valorCancelado)}</td>
                                        <td className="p-3 text-gray-300">{r.semMotivo || '-'}</td>
                                        <td className="p-3 text-xs text-gray-400">{Object.entries(r.motivos).map(([m, n]) => `${m} (${n})`).join(', ') || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section>
                <h2 className="text-xl font-bold text-white mb-3">Pedidos</h2>
                <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-700 text-gray-300 uppercase text-xs"><tr><th className="p-3">Quando</th><th className="p-3">Loja</th><th className="p-3">Nº</th><th className="p-3">Cliente</th><th className="p-3">Origem</th><th className="p-3">Pagamento</th><th className="p-3">Total</th><th className="p-3">Situação</th></tr></thead>
                        <tbody className="divide-y divide-gray-700">
                            {lista.length === 0 && <tr><td colSpan={8} className="p-6 text-gray-400">Nenhum pedido neste filtro.</td></tr>}
                            {lista.slice(0, 200).map(p => (
                                <tr key={p.id} className={p.status === 'Cancelado' ? 'bg-red-900/10' : ''}>
                                    <td className="p-3 text-gray-300 whitespace-nowrap">{dataHora(p.timestamp)}</td>
                                    <td className="p-3 text-gray-200">{nomeDe(p.store_id)}</td>
                                    <td className="p-3 text-gray-400">{p.daily_order_number ?? '-'}</td>
                                    <td className="p-3 text-gray-300">{p.customer_name || '-'}</td>
                                    <td className="p-3 text-gray-400 text-xs">{p.origin || '-'}{p.order_type ? ` · ${p.order_type}` : ''}</td>
                                    <td className="p-3 text-gray-300">{p.payment_method || '-'}</td>
                                    <td className="p-3 font-bold text-white">{brl(p.total)}</td>
                                    <td className="p-3">{p.status === 'Cancelado' ? <span className="text-red-300 font-bold">Cancelado<span className="block text-xs font-normal text-red-200/80">{p.cancel_reason || 'sem motivo registrado'}</span></span> : <span className="text-gray-300">{p.status}</span>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {lista.length > 200 && <p className="text-xs text-gray-500 mt-2">Mostrando os 200 mais recentes.</p>}
            </section>
        </div>
    );
};
