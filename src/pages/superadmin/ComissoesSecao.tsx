import React, { useMemo, useState } from 'react';
import { updateStoreSubscription, salvarFinanceiro, salvarPadroesPlataforma } from '../../services/supabaseService';
import { tipoDaLoja } from '../../services/recursos';
import { estimarComissao, ehPedidoOnline, simularVolume, receitaComMistura, taxasPorMeio } from '../../services/comissao';
import { usePlataforma } from './dados';
import { CamposFinanceiros } from './CamposFinanceiros';
import { FIN_PADRAO, brl, pct, type FormFinanceiro } from './util';

const campo = 'w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500';

interface PropsSimulador {
    padrao: FormFinanceiro;
    /** Grava estes percentuais e a parte fixa como padrão das lojas novas. */
    onUsarComoPadrao: (pctPropria: number, pctApp: number, fixa: number) => void;
}

/**
 * Simulador de comissão. Ticket médio e pedidos por mês: o resultado dos DOIS tipos de entrega aparece
 * na hora, lado a lado, e a porcentagem de cada um se mexe ali mesmo. A forma de pagamento não entra:
 * com a taxa do pagamento online repassada ao lojista, a plataforma recebe a comissão inteira.
 */
const Simulador: React.FC<PropsSimulador> = ({ padrao, onUsarComoPadrao }) => {
    const [ticket, setTicket] = useState(30);
    const [pedidos, setPedidos] = useState(100);
    const [pctPropria, setPctPropria] = useState(padrao.comissao_pct_propria);
    const [pctApp, setPctApp] = useState(padrao.comissao_pct_app);
    const [fixa, setFixa] = useState(padrao.comissao_fixa);
    const [pctPeloApp, setPctPeloApp] = useState(30);

    const propria = simularVolume({ ticket, pedidosPorMes: pedidos, pct: pctPropria, fixa });
    const app = simularVolume({ ticket, pedidosPorMes: pedidos, pct: pctApp, fixa });
    const mistura = receitaComMistura(propria, app, pedidos, pctPeloApp);
    const gateway = taxasPorMeio(ticket);
    const num = (set: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => set(parseFloat(e.target.value) || 0);

    const Cartao: React.FC<{ titulo: string; cor: string; pct: number; onPct: (n: number) => void; r: ReturnType<typeof simularVolume> }> = ({ titulo, cor, pct: p, onPct, r }) => (
        <div className={`rounded-xl border p-5 ${cor}`}>
            <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold text-white">{titulo}</h3>
                <label className="flex items-center gap-2 text-sm text-gray-200">
                    Comissão
                    <input type="number" min="0" max="100" step="0.5" value={p} onChange={e => onPct(parseFloat(e.target.value) || 0)} className="w-20 rounded-lg bg-gray-900/60 border border-gray-600 p-1.5 text-right text-white" />
                    %
                </label>
            </div>
            <p className="mt-4 text-xs uppercase font-bold text-gray-300">Você recebe por mês</p>
            <p className="text-4xl font-black text-white">{brl(r.comissaoMensal)}</p>
            <dl className="mt-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-200"><dt>Comissão por pedido</dt><dd className="font-bold">{brl(r.comissaoPorPedido)}</dd></div>
                <div className="flex justify-between text-gray-200"><dt>O lojista paga</dt><dd className="font-bold">{String(r.custoDoLojistaPct).replace('.', ',')}% do ticket</dd></div>
                <div className="flex justify-between text-gray-200"><dt>O lojista fica com, por mês</dt><dd className="font-bold">{brl(r.lojistaRecebeMes)}</dd></div>
            </dl>
        </div>
    );

    return (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
            <h2 className="text-xl font-bold text-white">Simulador de comissão</h2>
            <p className="text-sm text-gray-400 mt-1 mb-5">Digite o ticket médio e a quantidade de pedidos: o resultado dos dois tipos de entrega aparece na hora. Mexa na porcentagem de cada um para ver quanto você recebe.</p>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
                <div><label className="block text-xs text-gray-400 mb-1">Ticket médio dos produtos (R$)</label><input type="number" min="0" step="0.5" value={ticket} onChange={num(setTicket)} className={campo} /></div>
                <div><label className="block text-xs text-gray-400 mb-1">Pedidos por mês (volume de vendas)</label><input type="number" min="0" step="1" value={pedidos} onChange={num(setPedidos)} className={campo} /></div>
                <div><label className="block text-xs text-gray-400 mb-1">Parte fixa por pedido (R$)</label><input type="number" min="0" step="0.01" value={fixa} onChange={num(setFixa)} className={campo} /></div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
                <Cartao titulo="Entrega do lojista" cor="border-blue-700 bg-blue-950/40" pct={pctPropria} onPct={setPctPropria} r={propria} />
                <Cartao titulo="Entrega do app (motoboy)" cor="border-orange-700 bg-orange-950/40" pct={pctApp} onPct={setPctApp} r={app} />
            </div>

            <div className="mt-5 rounded-xl border border-gray-700 bg-gray-900/40 p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
                <label className="flex items-center gap-2 text-sm text-gray-200">
                    Se
                    <input type="number" min="0" max="100" step="5" value={pctPeloApp} onChange={num(setPctPeloApp)} className="w-20 rounded-lg bg-gray-900/60 border border-gray-600 p-1.5 text-right text-white" />
                    % dos pedidos forem entregues pelo app
                </label>
                <p className="text-sm text-gray-300">
                    Comissão do mês: <span className="text-2xl font-black text-white">{brl(mistura.comissaoMensal)}</span>
                    <span className="ml-2 text-xs text-gray-500">({mistura.pedidosProprios} pelo lojista e {mistura.pedidosApp} pelo app)</span>
                </p>
                <button onClick={() => onUsarComoPadrao(pctPropria, pctApp, fixa)} className="ml-auto rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-bold text-white">Usar estes valores como padrão</button>
            </div>

            <p className="mt-4 text-xs text-gray-500">
                A forma de pagamento não muda o que você recebe, desde que a taxa do pagamento online seja repassada ao lojista (é o padrão). Se a plataforma passar a pagar essa taxa, desconte por pedido neste ticket: Pix {brl(gateway.pix)}, cartão de crédito {brl(gateway.credito)}, débito {brl(gateway.debito)} (taxas do Asaas de 30/10/2026; confirme na sua conta). A comissão é calculada sobre os produtos, sem a taxa de entrega.
            </p>
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
    const usarComoPadrao = async (pctPropria: number, pctApp: number, fixa: number) => {
        if (d.padroes === null) return alert('As tabelas de comissão ainda não existem no banco. Rode o SQL 4 no Supabase.');
        if (!window.confirm(`Salvar ${pct(pctPropria)} (entrega do lojista), ${pct(pctApp)} (entrega do app) e ${brl(fixa)} fixos por pedido como padrão das lojas novas?`)) return;
        try {
            const novos = { ...formPadroes, comissao_pct_propria: pctPropria, comissao_pct_app: pctApp, comissao_fixa: fixa };
            const { debito_dinheiro: _d, ...p } = novos;
            await salvarPadroesPlataforma(p);
            setFormPadroes(novos);
            await d.recarregar();
            alert('Padrões salvos. Valem para as lojas novas; as que já existem mantêm as condições delas.');
        } catch (e: any) { alert(`Erro ao salvar os padrões: ${e?.message || e}`); }
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
                                            <button onClick={() => alternarDinheiro(s.id, s.aceita_dinheiro === false)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${s.aceita_dinheiro === false ? 'bg-green-800 hover:bg-green-700 text-green-100' : 'bg-red-900/70 hover:bg-red-800 text-red-100 border border-red-700'}`}>{s.aceita_dinheiro === false ? 'Liberar dinheiro' : 'Bloquear dinheiro'}</button>
                                            {f && f.debito_dinheiro > 0 && <button onClick={() => zerarDebito(s.id, s.name)} className="rounded-lg bg-blue-700 hover:bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">Zerar débito</button>}
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

            <Simulador padrao={{ ...FIN_PADRAO, ...(d.padroes || {}) }} onUsarComoPadrao={usarComoPadrao} />

            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-4">
                <h2 className="text-xl font-bold text-white">Padrões das lojas de comissão</h2>
                <p className="text-sm text-gray-400">Valores que toda loja nova recebe. Cada loja pode ser ajustada depois, em Lojas.</p>
                <CamposFinanceiros v={formPadroes} onChange={setFormPadroes} />
                <button onClick={salvarPadroes} disabled={d.padroes === null} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 px-5 rounded-lg">Salvar padrões</button>
            </div>
        </div>
    );
};
