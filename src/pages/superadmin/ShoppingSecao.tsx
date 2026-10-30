import React from 'react';
import { updateStoreSubscription } from '../../services/supabaseService';
import { tipoDaLoja, ROTULO_DO_TIPO } from '../../services/recursos';
import { usePlataforma } from './dados';

/** A vitrine do Pede Aqui: quem aparece, quem está pronto para aparecer e quem aparece sem estar pronto. */
export const ShoppingSecao: React.FC = () => {
    const d = usePlataforma();

    const pronta = (id: string) => (d.cardapio[id] || 0) > 0;
    const alternar = async (id: string, aparecer: boolean) => {
        try { await updateStoreSubscription(id, { aparecer_no_shopping: aparecer }); await d.recarregar(); } catch (e: any) { alert(`Erro: ${e?.message || e}`); }
    };

    const naVitrine = d.stores.filter(s => s.aparecer_no_shopping && s.is_active !== false);
    const prontas = d.stores.filter(s => !s.aparecer_no_shopping && s.is_active !== false && pronta(s.id));

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-white">Shopping</h1>
                <p className="text-sm text-gray-400 mt-1">A vitrine do Pede Aqui. Uma loja só deve aparecer com o cardápio pronto. {naVitrine.length} na vitrine, {prontas.length} pronta{prontas.length === 1 ? '' : 's'} para entrar.</p>
            </div>

            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-700 text-gray-300 uppercase text-xs"><tr><th className="p-3">Loja</th><th className="p-3">Modelo</th><th className="p-3">Categoria e cidade</th><th className="p-3">Cardápio</th><th className="p-3">Situação</th><th className="p-3 text-right">Ação</th></tr></thead>
                    <tbody className="divide-y divide-gray-700">
                        {d.stores.map(s => {
                            const no = !!s.aparecer_no_shopping;
                            const semCardapio = !pronta(s.id);
                            return (
                                <tr key={s.id}>
                                    <td className="p-3 font-bold text-white">{s.name}{s.is_active === false && <span className="ml-2 text-xs text-red-300">suspensa</span>}</td>
                                    <td className="p-3 text-gray-300">{ROTULO_DO_TIPO[tipoDaLoja(s)]}</td>
                                    <td className="p-3 text-gray-400">{[s.categoria, s.cidade].filter(Boolean).join(' · ') || <span className="text-yellow-400">falta categoria e cidade</span>}</td>
                                    <td className="p-3">{semCardapio ? <span className="text-yellow-400">vazio</span> : <span className="text-gray-300">{d.cardapio[s.id]} itens</span>}</td>
                                    <td className="p-3">
                                        {no && semCardapio ? <span className="rounded px-2 py-1 text-xs font-bold bg-red-900 text-red-200">na vitrine sem cardápio</span>
                                            : no ? <span className="rounded px-2 py-1 text-xs font-bold bg-green-900 text-green-200">na vitrine</span>
                                            : !semCardapio ? <span className="rounded px-2 py-1 text-xs font-bold bg-blue-900 text-blue-200">pronta para entrar</span>
                                            : <span className="text-gray-500 text-xs">fora</span>}
                                    </td>
                                    <td className="p-3 text-right whitespace-nowrap space-x-2">
                                        <a href={`/${s.slug}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 text-xs">ver loja</a>
                                        <button onClick={() => alternar(s.id, !no)} className={`rounded-lg px-3 py-1.5 text-xs font-bold text-white ${no ? 'bg-gray-700 hover:bg-gray-600' : 'bg-green-700 hover:bg-green-600'}`}>{no ? 'Tirar da vitrine' : 'Colocar na vitrine'}</button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="rounded-xl border border-dashed border-gray-700 p-5 text-sm text-gray-400">
                Em breve nesta seção: anúncios patrocinados (sempre marcados como Patrocinado), destaque no carrossel e lojas que entregam no endereço do cliente.
            </div>
        </div>
    );
};
