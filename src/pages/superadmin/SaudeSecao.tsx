import React, { useEffect, useMemo } from 'react';
import { usePlataforma } from './dados';
import { nivelDeContato, type NivelDeContato } from '../../services/comissao';
import { brl, haQuanto } from './util';

const COR: Record<NivelDeContato, string> = { ok: 'bg-green-900 text-green-200', atencao: 'bg-yellow-900 text-yellow-200', critico: 'bg-red-900 text-red-200' };
const ROTULO: Record<NivelDeContato, string> = { ok: 'Em contato', atencao: 'Atenção', critico: 'Sem contato' };

/** Saúde das lojas com PDV de PC: o que cada computador mandou de sinal de vida e quanta venda ele guarda sem enviar. */
export const SaudeSecao: React.FC = () => {
    const d = usePlataforma();

    // O sinal de vida é novo a cada minuto: atualiza sozinho para a tela não mentir.
    useEffect(() => {
        const t = setInterval(() => { d.recarregarSinais(); }, 30000);
        return () => clearInterval(t);
    }, [d.recarregarSinais]);

    const linhas = useMemo(() => d.sinais
        .map(s => ({ s, nivel: nivelDeContato(s.ultimo_contato, d.agora, s.vendas_na_fila), loja: d.lojaPorId(s.store_id)?.name || 'loja removida' }))
        .sort((a, b) => ['critico', 'atencao', 'ok'].indexOf(a.nivel) - ['critico', 'atencao', 'ok'].indexOf(b.nivel)), [d.sinais, d.agora, d.lojaPorId]);

    const versoes = linhas.map(l => l.s.versao).filter(Boolean) as string[];
    const maisNova = versoes.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-white">Saúde das lojas</h1>
                <p className="text-sm text-gray-400 mt-1">Computadores com o programa do PDV. Cada um manda um sinal de vida por minuto. Vermelho com venda guardada quer dizer: ligue para o lojista, a venda está só no computador dele.</p>
            </div>

            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-700 text-gray-300 uppercase text-xs"><tr><th className="p-3">Loja</th><th className="p-3">Computador</th><th className="p-3">Versão</th><th className="p-3">Último sinal</th><th className="p-3">Vendas só nele</th><th className="p-3">Última venda enviada</th><th className="p-3">Situação</th></tr></thead>
                    <tbody className="divide-y divide-gray-700">
                        {linhas.length === 0 && <tr><td colSpan={7} className="p-6 text-gray-400">Nenhum computador mandou sinal ainda.</td></tr>}
                        {linhas.map(({ s, nivel, loja }) => (
                            <tr key={`${s.store_id}-${s.maquina}`}>
                                <td className="p-3 font-bold text-white">{loja}</td>
                                <td className="p-3 text-gray-400 font-mono text-xs">{s.maquina}</td>
                                <td className="p-3 text-gray-300">{s.versao || '-'}{maisNova && s.versao && s.versao !== maisNova && <span className="ml-2 text-xs text-yellow-300">desatualizado</span>}</td>
                                <td className="p-3 text-gray-300">{haQuanto(s.ultimo_contato, d.agora)}</td>
                                <td className="p-3 text-gray-300">{s.vendas_na_fila > 0 ? <span className="font-bold text-yellow-300">{s.vendas_na_fila} ({brl(s.valor_na_fila)})</span> : '0'}</td>
                                <td className="p-3 text-gray-400">{haQuanto(s.ultima_venda_enviada_em, d.agora)}</td>
                                <td className="p-3"><span className={`rounded px-2 py-1 text-xs font-bold ${COR[nivel]}`}>{ROTULO[nivel]}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-gray-500">Os dados são o último sinal que o computador conseguiu enviar. Se a internet da loja cair, o sinal para, e a tela mostra o tempo desde o último contato.</p>
        </div>
    );
};
