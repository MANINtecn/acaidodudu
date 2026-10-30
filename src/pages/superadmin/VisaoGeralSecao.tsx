import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { usePlataforma } from './dados';
import { calcularAtencoes, type Atencao } from './atencoes';
import { nivelDeContato, resumirCancelamentos, ehPedidoOnline } from '../../services/comissao';
import { brl } from './util';

const COR: Record<Atencao['gravidade'], string> = {
    alta: 'bg-red-900/50 border-red-700 text-red-100',
    media: 'bg-yellow-900/40 border-yellow-700 text-yellow-100',
    baixa: 'bg-gray-800 border-gray-700 text-gray-200',
};
const ROTULO: Record<Atencao['gravidade'], string> = { alta: 'Urgente', media: 'Atenção', baixa: 'Quando der' };
const ROTA: Record<Atencao['secao'], string> = { lojas: '/super-admin/lojas', comissoes: '/super-admin/comissoes', pedidos: '/super-admin/pedidos', saude: '/super-admin/saude', shopping: '/super-admin/shopping' };

const Cartao: React.FC<{ titulo: string; valor: string | number; cor?: string; sub?: string }> = ({ titulo, valor, cor = 'text-white', sub }) => (
    <div className="bg-gray-800 p-5 rounded-xl shadow-lg border border-gray-700">
        <h3 className="text-gray-400 text-xs font-bold uppercase">{titulo}</h3>
        <p className={`text-3xl font-bold mt-2 ${cor}`}>{valor}</p>
        {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
);

export const VisaoGeralSecao: React.FC = () => {
    const d = usePlataforma();

    const sete = d.agora - 7 * 86400000;
    const dosUltimos7 = useMemo(() => d.pedidos.filter(p => new Date(p.timestamp).getTime() >= sete), [d.pedidos, sete]);
    const online = dosUltimos7.filter(p => ehPedidoOnline(p.origin) && p.status !== 'Cancelado');
    const vendasOnline = online.reduce((s, p) => s + (Number(p.total) || 0), 0);
    const cancelados = dosUltimos7.filter(p => p.status === 'Cancelado').length;
    const semContato = d.sinais.filter(s => nivelDeContato(s.ultimo_contato, d.agora, s.vendas_na_fila) === 'critico').length;

    const atencoes = useMemo(() => calcularAtencoes({
        stores: d.stores, financeiros: d.financeiros, cardapio: d.cardapio, sinais: d.sinais, pedidos: d.pedidos, agora: d.agora,
    }), [d.stores, d.financeiros, d.cardapio, d.sinais, d.pedidos, d.agora]);

    const suspeitos = resumirCancelamentos(d.pedidos).filter(r => r.suspeito).length;

    return (
        <div className="space-y-8">
            <h1 className="text-3xl font-bold text-white">Visão geral</h1>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Cartao titulo="Lojas" valor={d.stats.totalStores} sub={`${d.stats.activeStores} ativas`} />
                <Cartao titulo="Lojas de comissão" valor={d.stats.lojasDeComissao} cor="text-orange-400" />
                <Cartao titulo="Mensalidades (PDV)" valor={brl(d.stats.mrr)} cor="text-blue-400" />
                <Cartao titulo="Computadores sem contato" valor={semContato} cor={semContato ? 'text-red-400' : 'text-green-400'} sub={`${d.sinais.length} no total`} />
                <Cartao titulo="Pedidos online, 7 dias" valor={online.length} sub="site, app e robô, sem cancelados" />
                <Cartao titulo="Vendas online, 7 dias" valor={brl(vendasOnline)} cor="text-green-400" />
                <Cartao titulo="Cancelados, 7 dias" valor={cancelados} cor={cancelados ? 'text-yellow-400' : 'text-white'} />
                <Cartao titulo="Lojas com cancelamento alto" valor={suspeitos} cor={suspeitos ? 'text-red-400' : 'text-green-400'} sub="25% ou mais, com amostra" />
            </div>

            <section>
                <h2 className="text-xl font-bold text-white mb-3">Precisa da sua atenção</h2>
                {atencoes.length === 0 ? (
                    <div className="rounded-xl border border-gray-700 bg-gray-800 p-6 text-gray-300">Nada pendente agora.</div>
                ) : (
                    <ul className="space-y-3">
                        {atencoes.map(a => (
                            <li key={a.id} className={`rounded-xl border p-4 flex items-start justify-between gap-4 ${COR[a.gravidade]}`}>
                                <div className="min-w-0">
                                    <p className="text-xs font-bold uppercase opacity-80">{ROTULO[a.gravidade]}</p>
                                    <p className="font-bold">{a.texto}</p>
                                    <p className="text-sm opacity-90 mt-1">{a.lojas.slice(0, 5).join(', ')}{a.lojas.length > 5 ? ` e mais ${a.lojas.length - 5}` : ''}</p>
                                </div>
                                <Link to={ROTA[a.secao]} className="shrink-0 rounded-lg bg-white/10 hover:bg-white/20 px-4 py-2 text-sm font-bold">Ver</Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
};
