import React, { useMemo, useState } from 'react';
import { updateStoreSubscription, salvarFinanceiro, salvarPadroesPlataforma } from '../../services/supabaseService';
import { tipoDaLoja } from '../../services/recursos';
import { calcularPedido, estimarComissao, ehPedidoOnline, TAXAS_ASAAS_PADRAO, TAXAS_ASAAS_PROMO, type MeioDePagamento, type QuemEntrega } from '../../services/comissao';
import { usePlataforma } from './dados';
import { CamposFinanceiros } from './CamposFinanceiros';
import { FIN_PADRAO, brl, pct, type FormFinanceiro } from './util';

const campo = 'w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500';

/** Quanto sobra para cada lado num pedido de exemplo: serve para escolher percentual e parte fixa com números na mão. */
const Simulador: React.FC<{ padrao: FormFinanceiro }> = ({ padrao }) => {
    const [total, setTotal] = useState(30);
    const [frete, setFrete] = useState(0);
    const [meio, setMeio] = useState<MeioDePagamento>('pix');
    const [entrega, setEntrega] = useState<QuemEntrega>('propria');
    const [promo, setPromo] = useState(false);
    const [cond, setCond] = useState<FormFinanceiro>(padrao);
    const r = calcularPedido({ total, frete, meio, entrega, condicoes: cond, taxas: promo ? TAXAS_ASAAS_PROMO : TAXAS_ASAAS_PADRAO });
    const linha = (rotulo: string, valor: string, destaque = false) => (
        <div className={`flex justify-between py-1.5 ${destaque ? 'font-bold text-white border-t border-gray-600 mt-1 pt-2' : 'text-gray-300'}`}><span>{rotulo}</span><span>{valor}</span></div>
    );
    return (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
            <h2 className="text-xl font-bold text-white">Simulador de pedido</h2>
            <p className="text-sm text-gray-400 mt-1 mb-4">Testa uma condição antes de usar. As taxas do gateway são as da página de preços do Asaas em 30/10/2026: confirme na sua conta.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div><label className="block text-xs text-gray-400 mb-1">Total do pedido (R$)</label><input type="number" min="0" step="0.5" value={total} onChange={e => setTotal(parseFloat(e.target.value) || 0)} className={campo} /></div>
                <div><label className="block text-xs text-gray-400 mb-1">Taxa de entrega (R$)</label><input type="number" min="0" step="0.5" value={frete} onChange={e => setFrete(parseFloat(e.target.value) || 0)} className={campo} /></div>
                <div><label className="block text-xs text-gray-400 mb-1">Pagamento</label>
                    <select value={meio} onChange={e => setMeio(e.target.value as MeioDePagamento)} className={campo}>
                        <option value="pix">PIX</option><option value="credito">Cartão de crédito</option><option value="debito">Cartão de débito</option><option value="dinheiro">Dinheiro</option>
                    </select></div>
                <div><label className="block text-xs text-gray-400 mb-1">Quem entrega</label>
                    <select value={entrega} onChange={e => setEntrega(e.target.value as QuemEntrega)} className={campo}>
                        <option value="propria">O lojista</option><option value="app">O app (motoboy)</option>
                    </select></div>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
                <div className="rounded-lg border border-gray-700 p-3">
                    <p className="text-sm font-bold text-orange-300 mb-3">Condições usadas</p>
                    <CamposFinanceiros v={cond} onChange={setCond} />
                    <label className="mt-3 flex items-center gap-2 text-sm text-gray-300 cursor-pointer"><input type="checkbox" checked={promo} onChange={e => setPromo(e.target.checked)} className="h-4 w-4" /> Taxa promocional do Asaas (3 primeiros meses)</label>
                </div>
                <div className="text-sm">
                    {linha('Total pago pelo cliente', brl(r.total))}
                    {linha('Base da comissão (produtos)', brl(r.baseComissao))}
                    {linha('Comissão', brl(r.comissao))}
                    {linha('Taxa do gateway', brl(r.taxaGateway))}
                    {r.repasseMotoboy > 0 && linha('Repasse ao motoboy', brl(r.repasseMotoboy))}
                    {meio === 'dinheiro'
                        ? linha('Débito gerado para o lojista', brl(r.debitoGerado), true)
                        : (<>
                            {linha('Repasse ao lojista', brl(r.repasseLojista), true)}
                            {linha('Sobra para a plataforma', brl(r.margemPlataforma), true)}
                        </>)}
                    {linha('Custo do lojista (comissão mais taxa repassada)', pct(r.custoDoLojistaPct))}
                    {meio !== 'dinheiro' && r.margemPlataforma < 0.5 && (
                        <p className="mt-3 rounded-lg bg-red-900/40 border border-red-700 text-red-100 px-3 py-2 text-xs">Sobra menos de R$ 0,50 para a plataforma neste pedido: aumente a parte fixa ou repasse a taxa ao lojista.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export const ComissoesSecao: React.FC = () => {
    const d = usePlataforma();
    const [formPadroes, setFormPadroes] = useState<FormFinanceiro>({ ...FIN_PADRAO, ...(d.padroes || {}) });
    const comissao = d.stores.filter(s => tipoDaLoja(s) === 'comissao');

    const linhas = useMemo(() => comissao.map(s => {
        const f = d.financeiros[s.id];
        const dos30 = d.pedidos.filter(p => p.store_id === s.id && ehPedidoOnline(p.origin));
        const est = f ? estimarComissao(dos30, f) : null;
        return { s, f, est };
    }), [comissao, d.financeiros, d.pedidos]);

    const total = linhas.reduce((a, l) => ({ vendas: a.vendas + (l.est?.vendas || 0), comissao: a.comissao + (l.est?.comissao || 0), debito: a.debito + (l.f?.debito_dinheiro || 0) }), { vendas: 0, comissao: 0, debito: 0 });

    const alternarDinheiro = async (id: string, aceita: boolean) => {
        try { await updateStoreSubscription(id, { aceita_dinheiro: aceita }); await d.recarregar(); } catch (e: any) { alert(`Erro: ${e?.message || e}`); }
    };
    const zerarDebito = async (id: string, nome: string) => {
        if (!window.confirm(`Zerar o débito do dinheiro de ${nome}? Faça isso depois de receber o pagamento dele.`)) return;
        try { await salvarFinanceiro(id, { debito_dinheiro: 0 }); await updateStoreSubscription(id, { aceita_dinheiro: true }); await d.recarregar(); } catch (e: any) { alert(`Erro: ${e?.message || e}`); }
    };
    const salvarPadroes = async () => {
        try {
            const { debito_dinheiro: _d, ...p } = formPadroes;
            await salvarPadroesPlataforma(p);
            await d.recarregar();
            alert('Padrões salvos. Valem para as lojas novas; as que já existem mantêm as condições delas.');
        } catch (e: any) { alert(`Erro ao salvar os padrões: ${e?.message || e}`); }
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white">Comissões</h1>
                <p className="text-sm text-gray-400 mt-1">Lojas de comissão, condições, débito do dinheiro e estimativa dos últimos 30 dias. A cobrança automática chega com a fase do pagamento: por enquanto os valores são estimativas.</p>
            </div>

            {d.padroes === null && (
                <div className="rounded-lg bg-yellow-900/40 border border-yellow-700 text-yellow-200 px-4 py-3 text-sm">As tabelas de comissão ainda não existem no banco. Rode o SQL 4 no Supabase.</div>
            )}

            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-700 text-gray-300 uppercase text-xs">
                            <tr><th className="p-3">Loja</th><th className="p-3">Condições</th><th className="p-3">30 dias (online)</th><th className="p-3">Comissão estimada</th><th className="p-3">Débito do dinheiro</th><th className="p-3 text-right">Ações</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {linhas.length === 0 && <tr><td colSpan={6} className="p-6 text-gray-400">Nenhuma loja de comissão ainda. Crie uma em Lojas.</td></tr>}
                            {linhas.map(({ s, f, est }) => {
                                const cheio = !!f && f.limite_debito > 0 && f.debito_dinheiro >= f.limite_debito;
                                const parte = f && f.limite_debito > 0 ? Math.min(100, (f.debito_dinheiro / f.limite_debito) * 100) : 0;
                                return (
                                    <tr key={s.id}>
                                        <td className="p-3 font-bold text-white">{s.name}{!s.is_active && <span className="ml-2 text-xs text-red-300">suspensa</span>}</td>
                                        <td className="p-3 text-gray-300">{f ? <>{pct(f.comissao_pct_propria)} / {pct(f.comissao_pct_app)} + {brl(f.comissao_fixa)}<span className="block text-xs text-gray-500">{f.repassa_taxa_pagamento ? 'taxa do pagamento repassada' : 'plataforma paga a taxa'}</span></> : <span className="text-yellow-400">sem condições</span>}</td>
                                        <td className="p-3 text-gray-300">{est ? <>{est.pedidos} pedidos<span className="block text-xs text-gray-500">{brl(est.vendas)}</span></> : '-'}</td>
                                        <td className="p-3 text-gray-300">{est ? <>{brl(est.comissao)}<span className="block text-xs text-gray-500">sobra {brl(est.margem)} após o gateway</span></> : '-'}</td>
                                        <td className="p-3 min-w-[10rem]">
                                            {f ? (<>
                                                <span className={cheio ? 'text-red-300 font-bold' : 'text-gray-300'}>{brl(f.debito_dinheiro)} de {brl(f.limite_debito)}</span>
                                                <div className="h-1.5 rounded bg-gray-700 mt-1"><div className={`h-1.5 rounded ${cheio ? 'bg-red-500' : parte >= 80 ? 'bg-yellow-400' : 'bg-green-500'}`} style={{ width: `${parte}%` }} /></div>
                                                {s.aceita_dinheiro === false && <span className="text-xs text-red-300">dinheiro bloqueado</span>}
                                            </>) : '-'}
                                        </td>
                                        <td className="p-3 text-right whitespace-nowrap space-x-2">
                                            <button onClick={() => alternarDinheiro(s.id, s.aceita_dinheiro === false)} className="rounded-lg bg-gray-700 hover:bg-gray-600 px-3 py-1.5 text-xs font-bold text-white">{s.aceita_dinheiro === false ? 'Liberar dinheiro' : 'Bloquear dinheiro'}</button>
                                            {f && f.debito_dinheiro > 0 && <button onClick={() => zerarDebito(s.id, s.name)} className="rounded-lg bg-green-700 hover:bg-green-600 px-3 py-1.5 text-xs font-bold text-white">Zerar débito</button>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        {linhas.length > 0 && (
                            <tfoot><tr className="bg-gray-700/50 text-white font-bold"><td className="p-3" colSpan={2}>Total</td><td className="p-3">{brl(total.vendas)}</td><td className="p-3">{brl(total.comissao)}</td><td className="p-3" colSpan={2}>{brl(total.debito)} em débito</td></tr></tfoot>
                        )}
                    </table>
                </div>
            </div>

            <Simulador padrao={{ ...FIN_PADRAO, ...(d.padroes || {}) }} />

            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-4">
                <h2 className="text-xl font-bold text-white">Padrões das lojas de comissão</h2>
                <p className="text-sm text-gray-400">Valores que toda loja nova recebe. Cada loja pode ser ajustada depois, em Lojas.</p>
                <CamposFinanceiros v={formPadroes} onChange={setFormPadroes} />
                <button onClick={salvarPadroes} disabled={d.padroes === null} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 px-5 rounded-lg">Salvar padrões</button>
            </div>
        </div>
    );
};
