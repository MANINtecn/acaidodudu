import React from 'react';
import { TODOS_OS_RECURSOS, ROTULO_DO_RECURSO, temRecurso } from '../../services/recursos';
import { VALOR_PADRAO, brl } from './util';

const TIPOS = [
    { chave: 'comissao', rotulo: 'Comissão', loja: { modelo: 'comissao' as const, plan: null } },
    { chave: 'pdv_basico', rotulo: 'PDV Básico', loja: { modelo: 'pdv' as const, plan: 'basico' as const } },
    { chave: 'pdv_avancado', rotulo: 'PDV Avançado', loja: { modelo: 'pdv' as const, plan: 'avancado' as const } },
];

const PROXIMOS = [
    ['Pagamentos', 'Gateway Asaas: cobrança online, PIX e cartão, com divisão automática entre plataforma, lojista e motoboy.'],
    ['Repasses e saques', 'Saldo de cada loja (subconta no parceiro) e saque para o banco dela.'],
    ['Cadastro assistido', 'Subir o cardápio da loja nova por você, com ela acompanhando.'],
    ['Notificações', 'Aviso de pedido novo no celular do lojista (PWA e depois o aplicativo).'],
    ['Entrega pelo app', 'Motoboys da plataforma e repasse do frete (projeto à parte, com advogado).'],
];

export const PlataformaSecao: React.FC = () => (
    <div className="space-y-8">
        <div>
            <h1 className="text-3xl font-bold text-white">Plataforma</h1>
            <p className="text-sm text-gray-400 mt-1">Os modelos de venda e o que cada um enxerga. A divisão entre Básico e Avançado é provisória: quando você decidir, muda-se numa tabela só no código (src/services/recursos.ts).</p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
                <p className="text-xs font-bold uppercase text-orange-300">Comissão</p>
                <p className="text-2xl font-bold text-white mt-1">Sem mensalidade</p>
                <p className="text-sm text-gray-400 mt-2">Tudo que se cadastra no Pede Aqui. Pagamento online com divisão; dinheiro vira débito. Painel enxuto para o celular.</p>
            </div>
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
                <p className="text-xs font-bold uppercase text-blue-300">PDV Básico</p>
                <p className="text-2xl font-bold text-white mt-1">{brl(VALOR_PADRAO.pdv_basico)}/mês</p>
                <p className="text-sm text-gray-400 mt-2">Link próprio, sem comissão. Balcão, caixa, cozinha e fidelidade.</p>
            </div>
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
                <p className="text-xs font-bold uppercase text-blue-300">PDV Avançado</p>
                <p className="text-2xl font-bold text-white mt-1">{brl(VALOR_PADRAO.pdv_avancado)}/mês</p>
                <p className="text-sm text-gray-400 mt-2">Tudo do Básico, mais nota fiscal e robô de WhatsApp.</p>
            </div>
        </div>

        <section>
            <h2 className="text-xl font-bold text-white mb-3">O que cada modelo enxerga no painel da loja</h2>
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-700 text-gray-300 uppercase text-xs"><tr><th className="p-3">Recurso</th>{TIPOS.map(t => <th key={t.chave} className="p-3 text-center">{t.rotulo}</th>)}</tr></thead>
                    <tbody className="divide-y divide-gray-700">
                        {TODOS_OS_RECURSOS.map(r => (
                            <tr key={r}>
                                <td className="p-3 text-gray-200">{ROTULO_DO_RECURSO[r]}</td>
                                {TIPOS.map(t => <td key={t.chave} className="p-3 text-center">{temRecurso(t.loja, r) ? <span className="font-bold text-green-400">sim</span> : <span className="text-gray-600">não</span>}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>

        <section>
            <h2 className="text-xl font-bold text-white mb-3">Chegando</h2>
            <ul className="grid md:grid-cols-2 gap-3">
                {PROXIMOS.map(([titulo, texto]) => (
                    <li key={titulo} className="rounded-xl border border-dashed border-gray-700 p-4"><p className="font-bold text-gray-200">{titulo}</p><p className="text-sm text-gray-400 mt-1">{texto}</p></li>
                ))}
            </ul>
        </section>
    </div>
);
