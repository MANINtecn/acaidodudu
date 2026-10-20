/**
 * Interruptor do Balcão V2 OFFLINE (15/10/2026) -- vale só para ESTE computador.
 *
 * Ligado: as comandas ficam no disco do PC e o F7/F8 fecha na hora, sem internet; a venda
 * sobe sozinha depois. Desligado: Balcão V2 de sempre (comandas no banco).
 * Só troca com zero comandas abertas (nunca mistura comanda do banco com comanda do PC).
 * Ver DESIGN-BALCAO-OFFLINE.md.
 */
import React, { useEffect, useState } from 'react';
import { useStore } from '../contexts/StoreContext';
import { fetchActiveOrders } from '../services/supabaseService';
import {
    offlineDisponivel, carregarArmazem, modoOfflineAtivo, definirModoOffline, assinarArmazem, vendasNaFila, vendasComProblema,
} from '../offline/armazemBalcao';
import { dispararEnvio } from '../offline/sincronizadorBalcao';

export const ModoOfflineBalcao: React.FC<{ balcaoV2: boolean }> = ({ balcaoV2 }) => {
    const { currentStore } = useStore();
    const [, setVersao] = useState(0);
    const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
    const [trocando, setTrocando] = useState(false);

    useEffect(() => {
        if (!offlineDisponivel()) return;
        const sair = assinarArmazem(() => setVersao(v => v + 1));
        carregarArmazem().then(() => setVersao(v => v + 1));
        return sair;
    }, []);

    if (!offlineDisponivel()) return null; // site/celular: não existe

    const ativo = modoOfflineAtivo();
    const fila = vendasNaFila();
    const problemas = vendasComProblema();

    const alternar = async () => {
        setTrocando(true);
        setAviso(null);
        try {
            let abertasNoBanco = 0;
            if (!ativo) {
                if (!currentStore?.id) throw new Error('Loja ainda não carregou.');
                const abertos = await fetchActiveOrders(currentStore.id);
                abertasNoBanco = new Set(abertos.filter(o => o.table_number && Number(o.table_number) >= 1 && Number(o.table_number) <= 20).map(o => Number(o.table_number))).size;
            }
            const r = await definirModoOffline(!ativo, abertasNoBanco);
            setAviso(r.ok
                ? { tipo: 'ok', texto: !ativo ? 'Modo offline LIGADO neste computador.' : 'Modo offline desligado. Comandas voltam a ir para o banco.' }
                : { tipo: 'erro', texto: r.motivo || 'Não foi possível trocar.' });
        } catch (e: any) {
            setAviso({ tipo: 'erro', texto: `Não consegui conferir as comandas abertas no banco (${e?.message || e}). Tente com internet.` });
        } finally {
            setTrocando(false);
        }
    };

    return (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3">
                <input
                    type="checkbox"
                    id="balcaoOffline"
                    checked={ativo}
                    disabled={trocando || (!balcaoV2 && !ativo)}
                    onChange={alternar}
                    className="h-5 w-5 rounded text-emerald-600 focus:ring-emerald-500 border-gray-300 dark:bg-gray-700 dark:border-gray-600"
                />
                <div>
                    <label htmlFor="balcaoOffline" className="text-sm font-bold text-gray-900 dark:text-gray-100 cursor-pointer">
                        Balcão V2 · Modo offline (só neste computador)
                    </label>
                    <p className="text-[11px] text-gray-500">
                        As comandas ficam neste computador e o F7/F8 fecha na hora, mesmo sem internet. A venda sobe sozinha para o sistema logo depois.
                        {!balcaoV2 && ' Ligue o Balcão V2 primeiro.'}
                    </p>
                </div>
            </div>
            {(fila.length > 0 || problemas.length > 0) && (
                <div className="mt-2 text-[11px] font-bold text-amber-700 dark:text-amber-400 flex items-center gap-2 flex-wrap">
                    {fila.length > 0 && <span>{fila.length} venda(s) aguardando subir (R$ {fila.reduce((s, v) => s + v.total, 0).toFixed(2)}).</span>}
                    {problemas.length > 0 && <span className="text-red-600">{problemas.length} venda(s) recusada(s) pelo sistema: chame o suporte.</span>}
                    {fila.length > 0 && <button type="button" onClick={() => dispararEnvio()} className="underline">Tentar enviar agora</button>}
                </div>
            )}
            {aviso && (
                <p className={`mt-2 text-xs font-bold ${aviso.tipo === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>{aviso.texto}</p>
            )}
        </div>
    );
};
