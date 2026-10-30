import React from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { LayoutDashboard, Store, Percent, Receipt, Activity, Globe, Settings, LogOut, Lock } from 'lucide-react';
import { supabase } from '../../services/supabaseService';
import { PlataformaProvider, usePlataforma } from './dados';
import { VisaoGeralSecao } from './VisaoGeralSecao';
import { LojasSecao } from './LojasSecao';
import { ComissoesSecao } from './ComissoesSecao';
import { PedidosSecao } from './PedidosSecao';
import { SaudeSecao } from './SaudeSecao';
import { ShoppingSecao } from './ShoppingSecao';
import { PlataformaSecao } from './PlataformaSecao';

const ITENS = [
    { para: '/super-admin', fim: true, rotulo: 'Visão geral', Icone: LayoutDashboard },
    { para: '/super-admin/lojas', rotulo: 'Lojas', Icone: Store },
    { para: '/super-admin/comissoes', rotulo: 'Comissões', Icone: Percent },
    { para: '/super-admin/pedidos', rotulo: 'Pedidos', Icone: Receipt },
    { para: '/super-admin/saude', rotulo: 'Saúde das lojas', Icone: Activity },
    { para: '/super-admin/shopping', rotulo: 'Shopping', Icone: Globe },
    { para: '/super-admin/plataforma', rotulo: 'Plataforma', Icone: Settings },
];
const EM_BREVE = ['Pagamentos', 'Repasses e saques', 'Cadastro assistido', 'Notificações'];

const classe = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`;

const Corpo: React.FC = () => {
    const { carregando } = usePlataforma();
    if (carregando) return <div className="text-gray-400">Carregando...</div>;
    return (
        <Routes>
            <Route index element={<VisaoGeralSecao />} />
            <Route path="lojas" element={<LojasSecao />} />
            <Route path="comissoes" element={<ComissoesSecao />} />
            <Route path="pedidos" element={<PedidosSecao />} />
            <Route path="saude" element={<SaudeSecao />} />
            <Route path="shopping" element={<ShoppingSecao />} />
            <Route path="plataforma" element={<PlataformaSecao />} />
            <Route path="*" element={<Navigate to="/super-admin" replace />} />
        </Routes>
    );
};

/** Tudo que é da gestão da plataforma, num lugar só: um caminho para cada assunto. */
export const CentralDeGestao: React.FC = () => (
    <PlataformaProvider>
        <LayoutDaCentral />
    </PlataformaProvider>
);

/** Menu lateral e corpo. Separado do carregamento de dados para poder ser visto com dados de exemplo. */
export const LayoutDaCentral: React.FC = () => (
        <div className="min-h-screen bg-gray-900 text-gray-100 md:flex">
            <aside className="hidden md:flex md:w-60 shrink-0 flex-col border-r border-gray-800 bg-gray-950 p-4">
                <div className="mb-6 px-2">
                    <p className="text-lg font-black text-white">Pede Aqui</p>
                    <p className="text-xs font-bold uppercase tracking-wide text-blue-400">Central de gestão</p>
                </div>
                <nav className="space-y-1 flex-1">
                    {ITENS.map(({ para, fim, rotulo, Icone }) => (
                        <NavLink key={para} to={para} end={fim} className={classe}><Icone size={18} /> {rotulo}</NavLink>
                    ))}
                    <p className="px-3 pt-6 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-600">Em breve</p>
                    {EM_BREVE.map(t => <div key={t} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-600"><Lock size={15} /> {t}</div>)}
                </nav>
                <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold text-gray-400 hover:bg-gray-800 hover:text-white"><LogOut size={18} /> Sair</button>
            </aside>

            <div className="flex-1 min-w-0">
                {/* Menu no celular */}
                <nav className="md:hidden flex gap-2 overflow-x-auto border-b border-gray-800 bg-gray-950 px-3 py-2">
                    {ITENS.map(({ para, fim, rotulo }) => (
                        <NavLink key={para} to={para} end={fim} className={({ isActive }) => `shrink-0 rounded-full px-4 py-1.5 text-sm font-bold ${isActive ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300'}`}>{rotulo}</NavLink>
                    ))}
                    <button onClick={() => supabase.auth.signOut()} className="shrink-0 rounded-full px-4 py-1.5 text-sm font-bold bg-gray-800 text-gray-400">Sair</button>
                </nav>
                <main className="p-4 md:p-8 max-w-7xl"><Corpo /></main>
            </div>
        </div>
);
