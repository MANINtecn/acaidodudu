import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
    fetchAllStores, getGlobalStats, fetchFinanceiroDeTodas, fetchPadroesPlataforma, fetchSinaisDeVida,
    fetchContagemDeCardapio, fetchPedidosDaPlataforma, type PedidoDaPlataforma, type SinalDeVidaDaLoja,
} from '../../services/supabaseService';
import type { Store, LojaFinanceiro, PadroesPlataforma } from '../../types';

export interface DadosDaPlataforma {
    stores: Store[];
    financeiros: Record<string, LojaFinanceiro>;
    /** undefined = ainda carregando; null = a tabela ainda não existe (SQL 4 não rodado). */
    padroes: PadroesPlataforma | null | undefined;
    sinais: SinalDeVidaDaLoja[];
    pedidos: PedidoDaPlataforma[];
    pedidosCortados: boolean;
    cardapio: Record<string, number>;
    stats: { totalStores: number; activeStores: number; lojasDeComissao: number; mrr: number };
    carregando: boolean;
    agora: number;
    recarregar: () => Promise<void>;
    recarregarSinais: () => Promise<void>;
    lojaPorId: (id: string) => Store | undefined;
}

export const PlataformaContext = createContext<DadosDaPlataforma | null>(null);
const Contexto = PlataformaContext;

export const usePlataforma = (): DadosDaPlataforma => {
    const c = useContext(Contexto);
    if (!c) throw new Error('usePlataforma fora do PlataformaProvider');
    return c;
};

const TRINTA_DIAS = 30 * 86400000;

/** Carrega uma vez os dados que as telas da central dividem, e recarrega quando alguém muda algo. */
export const PlataformaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [stores, setStores] = useState<Store[]>([]);
    const [financeiros, setFinanceiros] = useState<Record<string, LojaFinanceiro>>({});
    const [padroes, setPadroes] = useState<PadroesPlataforma | null | undefined>(undefined);
    const [sinais, setSinais] = useState<SinalDeVidaDaLoja[]>([]);
    const [pedidos, setPedidos] = useState<PedidoDaPlataforma[]>([]);
    const [pedidosCortados, setPedidosCortados] = useState(false);
    const [cardapio, setCardapio] = useState<Record<string, number>>({});
    const [stats, setStats] = useState({ totalStores: 0, activeStores: 0, lojasDeComissao: 0, mrr: 0 });
    const [carregando, setCarregando] = useState(true);
    const [agora, setAgora] = useState(Date.now());

    const recarregar = useCallback(async () => {
        try {
            const [lojas, estat, fins, pad, vidas, itens, ped] = await Promise.all([
                fetchAllStores(), getGlobalStats(), fetchFinanceiroDeTodas(), fetchPadroesPlataforma(), fetchSinaisDeVida(), fetchContagemDeCardapio(),
                fetchPedidosDaPlataforma(new Date(Date.now() - TRINTA_DIAS).toISOString()).catch(() => ({ pedidos: [] as PedidoDaPlataforma[], cortado: false })),
            ]);
            setStores(lojas); setStats(estat);
            setFinanceiros(Object.fromEntries(fins.map(f => [f.store_id, f])));
            setPadroes(pad); setSinais(vidas); setCardapio(itens);
            setPedidos(ped.pedidos); setPedidosCortados(ped.cortado);
            setAgora(Date.now());
        } catch (e) {
            console.error('[central] erro ao carregar dados:', e);
            alert('Erro ao carregar os dados da plataforma.');
        } finally {
            setCarregando(false);
        }
    }, []);

    const recarregarSinais = useCallback(async () => { setSinais(await fetchSinaisDeVida()); setAgora(Date.now()); }, []);

    useEffect(() => { recarregar(); }, [recarregar]);

    const valor = useMemo<DadosDaPlataforma>(() => ({
        stores, financeiros, padroes, sinais, pedidos, pedidosCortados, cardapio, stats, carregando, agora, recarregar, recarregarSinais,
        lojaPorId: (id: string) => stores.find(s => s.id === id),
    }), [stores, financeiros, padroes, sinais, pedidos, pedidosCortados, cardapio, stats, carregando, agora, recarregar, recarregarSinais]);

    return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
};
