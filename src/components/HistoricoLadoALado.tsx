import React from 'react';
import { CheckCircle2, WifiOff, RefreshCw, Loader2, Monitor, Cloud } from 'lucide-react';
import type { ComparacaoPeriodo, LinhaDia } from '../offline/historicoDuasCamadas';
import type { EstadoConexao } from '../offline/estadoConexao';
import { DIAS_GUARDANDO_ENVIADAS } from '../offline/armazemBalcao';

const brl = (v: number | null) => (v === null ? '-' : `R$ ${v.toFixed(2).replace('.', ',')}`);
const rotuloDia = (dia: string) => {
    const [a, m, d] = dia.split('-').map(Number);
    const semana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(a, m - 1, d).getDay()];
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')} ${semana}`;
};
const hora = (ms: number) => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const textoSituacao = (l: LinhaDia): { texto: string; cor: string } => {
    switch (l.situacao) {
        case 'sincronizado': return { texto: 'Sincronizado', cor: 'text-green-700 dark:text-green-400' };
        case 'aguardando': return { texto: `${plural(l.soNoPcQtd, 'venda', 'vendas')} só neste computador (${brl(l.soNoPcValor)})`, cor: 'text-amber-700 dark:text-amber-400 font-bold' };
        case 'diferenca': return { texto: `${plural(l.soNaNuvemQtd, 'venda', 'vendas')} na nuvem que não saíram deste computador`, cor: 'text-slate-600 dark:text-slate-300' };
        case 'so_nuvem': return { texto: `Só na nuvem (o computador guarda ${DIAS_GUARDANDO_ENVIADAS} dias)`, cor: 'text-gray-500 dark:text-gray-400' };
        default: return { texto: 'Nuvem sem resposta', cor: 'text-gray-500 dark:text-gray-400' };
    }
};

interface Props {
    comp: ComparacaoPeriodo;
    conexao: EstadoConexao;
    consultandoNuvem: boolean;
}

/**
 * Faixa de estado + tabela dia a dia: o que ESTE computador vendeu no Balcão contra o que a nuvem tem.
 * Com tudo enviado as duas colunas são iguais e a faixa diz que está sincronizado; sem internet o lado do
 * computador continua completo e a faixa explica por que a nuvem está atrás.
 */
export const HistoricoLadoALado: React.FC<Props> = ({ comp, conexao, consultandoNuvem }) => {
    const t = comp.totais;
    const semNuvem = !comp.bancoDisponivel && !consultandoNuvem;

    let faixa: React.ReactNode;
    if (consultandoNuvem) {
        faixa = (
            <div className="flex items-center gap-2 rounded-lg px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-sm">
                <Loader2 size={18} className="animate-spin" /> Consultando a nuvem... O que está neste computador já aparece abaixo.
            </div>
        );
    } else if (semNuvem) {
        faixa = (
            <div className="rounded-lg px-4 py-3 bg-red-600 text-white font-bold text-sm">
                <div className="flex items-center gap-2"><WifiOff size={18} /> Sem conexão com a nuvem. Mostrando o que está salvo neste computador.</div>
                {conexao.naFila > 0 && (
                    <p className="mt-1 text-xs font-medium opacity-95">
                        {plural(conexao.naFila, 'venda', 'vendas')} ({brl(conexao.valorNaFila)}) ainda não enviada{conexao.naFila === 1 ? '' : 's'}. Estão salvas aqui e sobem sozinhas quando a internet voltar. Mantenha o computador ligado.
                    </p>
                )}
            </div>
        );
    } else if (conexao.naFila > 0 || t.soNoPcQtd > 0) {
        const n = Math.max(conexao.naFila, t.soNoPcQtd);
        faixa = (
            <div className="flex items-center gap-2 rounded-lg px-4 py-3 bg-sky-600 text-white font-bold text-sm">
                <RefreshCw size={18} className="animate-spin" /> Enviando {plural(n, 'venda', 'vendas')} para a nuvem. Isso costuma levar segundos.
            </div>
        );
    } else {
        faixa = (
            <div className="flex items-center gap-2 rounded-lg px-4 py-3 bg-green-600 text-white font-bold text-sm">
                <CheckCircle2 size={18} /> Internet ativa e sincronizada. Tudo que este computador vendeu já está na nuvem.
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-1">Balcão: neste computador e na nuvem</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                A nuvem é o cofre final. O computador guarda cada venda na hora, mesmo sem internet, e envia quando der.
            </p>
            {faixa}

            {comp.linhas.length === 0 ? (
                <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Nenhuma venda de Balcão neste período.</p>
            ) : (
                <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs uppercase text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                <th className="py-2 pr-4">Dia</th>
                                <th className="py-2 pr-4 text-right"><span className="inline-flex items-center gap-1"><Monitor size={14} /> Neste computador</span></th>
                                <th className="py-2 pr-4 text-right"><span className="inline-flex items-center gap-1"><Cloud size={14} /> Na nuvem</span></th>
                                <th className="py-2">Situação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {comp.linhas.map(l => {
                                const s = textoSituacao(l);
                                return (
                                    <tr key={l.dia}>
                                        <td className="py-2 pr-4 font-semibold text-gray-800 dark:text-gray-100 whitespace-nowrap">{rotuloDia(l.dia)}</td>
                                        <td className="py-2 pr-4 text-right text-gray-800 dark:text-gray-100">
                                            {l.pcDisponivel ? <>{brl(l.pcValor)}<span className="block text-[10px] text-gray-400">{plural(l.pcQtd, 'venda', 'vendas')}</span></> : '-'}
                                        </td>
                                        <td className="py-2 pr-4 text-right text-gray-800 dark:text-gray-100">
                                            {l.nuvemQtd === null ? '-' : <>{brl(l.nuvemValor)}<span className="block text-[10px] text-gray-400">{plural(l.nuvemQtd, 'venda', 'vendas')}{l.nuvemDeCache ? ' (último valor conhecido)' : ''}</span></>}
                                        </td>
                                        <td className={`py-2 ${s.cor}`}>{s.texto}</td>
                                    </tr>
                                );
                            })}
                            <tr className="border-t-2 border-gray-200 dark:border-gray-600">
                                <td className="py-2 pr-4 font-black text-gray-900 dark:text-gray-100">Total</td>
                                <td className="py-2 pr-4 text-right font-black text-gray-900 dark:text-gray-100">{brl(t.pcValor)}<span className="block text-[10px] font-medium text-gray-400">{plural(t.pcQtd, 'venda', 'vendas')}</span></td>
                                <td className="py-2 pr-4 text-right font-black text-gray-900 dark:text-gray-100">{brl(t.nuvemValor)}{t.nuvemQtd !== null && <span className="block text-[10px] font-medium text-gray-400">{plural(t.nuvemQtd, 'venda', 'vendas')}</span>}</td>
                                <td className="py-2 font-bold text-amber-700 dark:text-amber-400">{t.soNoPcQtd > 0 ? `${brl(t.soNoPcValor)} aguardando a internet` : ''}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}

            <div className="mt-4 rounded-lg bg-gray-50 dark:bg-gray-900/40 px-4 py-3 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-200">Balcão no período (soma dos dois lados)</span>
                <span className="text-xl font-black text-gray-900 dark:text-gray-100">{brl(t.uniaoValor)} <span className="text-xs font-medium text-gray-500">({plural(t.uniaoQtd, 'venda', 'vendas')})</span></span>
            </div>

            {comp.site && (
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                    Pedidos do site e do robô (existem só na nuvem): {plural(comp.site.qtd, 'pedido', 'pedidos')}, {brl(comp.site.valor)}
                    {comp.site.deCache ? ' (último valor conhecido)' : ''}.
                </p>
            )}
            {comp.cacheEm !== null && !comp.bancoDisponivel && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Último valor conhecido da nuvem: consulta de {hora(comp.cacheEm)}.</p>
            )}
            {comp.canceladasNaNuvem > 0 && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {plural(comp.canceladasNaNuvem, 'venda enviada que foi cancelada ou apagada na nuvem', 'vendas enviadas que foram canceladas ou apagadas na nuvem')} (não entram na conta).
                </p>
            )}
            {comp.recusadas.qtd > 0 && (
                <p className="mt-2 text-sm font-bold text-red-600 dark:text-red-400">
                    Atenção: {plural(comp.recusadas.qtd, 'venda foi recusada', 'vendas foram recusadas')} pelo sistema ({brl(comp.recusadas.valor)}) e não vão subir sozinhas. Chame o suporte.
                </p>
            )}
        </div>
    );
};
