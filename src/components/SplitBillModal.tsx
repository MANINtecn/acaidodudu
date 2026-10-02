// ============================================================================
// FECHAMENTO DE CONTA FRACIONADO — 01/10/2026
// ----------------------------------------------------------------------------
// Trazido do Papaleguas (WaiterSplitBillModal.tsx) a pedido do Ikarus, véspera
// da demo pro Marlon: mesa grande onde cada um paga sua parte.
//
// Dois modos:
//   VALOR   — divide o total por N pessoas; operador marca cada um que pagou
//   PRODUTO — cada um paga o que consumiu; item compartilhado divide ÷2, ÷3, ÷4
//
// O saldo vive no BANCO (tabela table_payments), não na tela: a máquina pode
// travar, reiniciar, outro operador pode assumir -- o que já foi recebido não
// se perde.
// ============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Users, ShoppingBag, Check, Undo2, AlertTriangle, Loader2 } from 'lucide-react';
import {
    getTableBalance, addTablePayment, voidTablePayment, settleTable,
    TableBalance, TablePayment
} from '../services/supabaseService';

type Modo = 'ESCOLHA' | 'VALOR' | 'PRODUTO';
type FormaPagamento = 'Dinheiro' | 'Cartão' | 'PIX';

/** Item da mesa, já com a origem (order_id) para travar pagamento duplicado. */
export interface ItemDaMesa {
    order_id: string;
    cart_id: string;
    name: string;
    unit_price: number;   // preço unitário JÁ com adicionais
    quantity: number;
    line_total: number;   // unit_price * quantity
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    storeId: string;
    tableNumber: number;
    rotulo?: string; // "Comanda" (Balcão V2) ou "Mesa" (V1)
    itens: ItemDaMesa[];
    operatorName?: string;
    /** chamado quando a mesa é fechada de vez */
    onSettled: () => void;
}

const brl = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const SplitBillModal: React.FC<Props> = ({
    isOpen, onClose, storeId, tableNumber, rotulo = 'Mesa', itens, operatorName, onSettled
}) => {
    const [modo, setModo] = useState<Modo>('ESCOLHA');
    const [saldo, setSaldo] = useState<TableBalance | null>(null);
    const [carregando, setCarregando] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string>('');

    // modo VALOR
    const [qtdPessoas, setQtdPessoas] = useState(2);

    // modo PRODUTO — chave "order_id|cart_id" -> divisor (1 = inteiro, 2 = metade...)
    const [selecionados, setSelecionados] = useState<Record<string, number>>({});

    // pagamento
    const [forma, setForma] = useState<FormaPagamento>('Dinheiro');
    const [recebido, setRecebido] = useState('');

    const chave = (i: ItemDaMesa) => `${i.order_id}|${i.cart_id}`;

    const recarregar = useCallback(async () => {
        setCarregando(true);
        const b = await getTableBalance(storeId, tableNumber);
        setSaldo(b);
        setCarregando(false);
        return b;
    }, [storeId, tableNumber]);

    useEffect(() => {
        if (isOpen) {
            setModo('ESCOLHA');
            setSelecionados({});
            setErro('');
            setRecebido('');
            recarregar();
        }
    }, [isOpen, recarregar]);

    // ESC fecha o modal -- pedido do Ikarus 01/10/2026: "tudo é atalho", todo
    // modal precisa de ESC pra sair sem mouse. Mesmo critério do
    // CheckoutModal: não fecha se estiver no meio de um envio (salvando).
    useEffect(() => {
        if (!isOpen) return;
        const aoTeclar = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !salvando) {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    }, [isOpen, salvando, onClose]);

    // ---- itens já pagos (para travar e esmaecer na lista) --------------------
    const fracaoPaga = useMemo(() => {
        const mapa: Record<string, number> = {};
        (saldo?.payments || []).forEach((p: TablePayment) => {
            (p.items_json || []).forEach((it: any) => {
                const k = `${it.order_id}|${it.cart_id}`;
                mapa[k] = (mapa[k] || 0) + (Number(it.fraction) || 1);
            });
        });
        return mapa;
    }, [saldo]);

    const jaQuitado = (i: ItemDaMesa) => (fracaoPaga[chave(i)] || 0) >= 0.999;

    // ---- modo VALOR ---------------------------------------------------------
    const pagamentosValor = (saldo?.payments || []).filter(p => p.split_mode === 'VALOR');
    const pagosIdx = new Set(pagamentosValor.map(p => p.split_index));

    // divide sem perder centavo: todos iguais, o RESTO vai na última pessoa
    const valorPorPessoa = useMemo(() => {
        const total = Number(saldo?.total || 0);
        if (!qtdPessoas) return [] as number[];
        const centavos = Math.round(total * 100);
        const base = Math.floor(centavos / qtdPessoas);
        const resto = centavos - base * qtdPessoas;
        return Array.from({ length: qtdPessoas }, (_, i) =>
            (base + (i === qtdPessoas - 1 ? resto : 0)) / 100
        );
    }, [saldo?.total, qtdPessoas]);

    // ---- modo PRODUTO -------------------------------------------------------
    const totalSelecionado = useMemo(() => {
        return itens.reduce((acc, i) => {
            const div = selecionados[chave(i)];
            if (!div) return acc;
            return acc + i.line_total / div;
        }, 0);
    }, [itens, selecionados]);

    const alternarItem = (i: ItemDaMesa) => {
        if (jaQuitado(i)) return;
        const k = chave(i);
        setSelecionados(prev => {
            const novo = { ...prev };
            if (novo[k]) delete novo[k]; else novo[k] = 1;
            return novo;
        });
    };

    const mudarDivisor = (i: ItemDaMesa, div: number) => {
        if (jaQuitado(i)) return;
        setSelecionados(prev => ({ ...prev, [chave(i)]: div }));
    };

    // ---- registrar pagamento ------------------------------------------------
    const registrar = async (valor: number, opts: {
        splitMode: 'VALOR' | 'PRODUTO';
        payerLabel: string;
        splitTotal?: number;
        splitIndex?: number;
        itemsJson?: any[];
    }) => {
        if (valor <= 0) return;
        setErro('');

        let troco: number | null = null;
        if (forma === 'Dinheiro' && recebido) {
            const r = parseFloat(recebido.replace(',', '.'));
            if (!isNaN(r)) {
                if (r < valor) { setErro(`Recebido (${brl(r)}) é menor que ${brl(valor)}.`); return; }
                troco = r;
            }
        }

        setSalvando(true);
        const res = await addTablePayment({
            storeId, tableNumber, amount: valor, paymentMethod: forma,
            splitMode: opts.splitMode, payerLabel: opts.payerLabel,
            splitTotal: opts.splitTotal, splitIndex: opts.splitIndex,
            itemsJson: opts.itemsJson || null, changeFor: troco, waiterName: operatorName
        });
        setSalvando(false);

        if (!res.success) { setErro(res.error || 'Falha ao registrar pagamento.'); return; }

        setSelecionados({});
        setRecebido('');
        await recarregar();
    };

    const estornar = async (p: TablePayment) => {
        setSalvando(true);
        await voidTablePayment(p.id, 'Estornado pelo operador');
        setSalvando(false);
        recarregar();
    };

    const fecharMesa = async (force = false) => {
        setSalvando(true);
        const res = await settleTable(storeId, tableNumber, force, operatorName);
        setSalvando(false);
        if (!res.success) { setErro(res.error || 'Não foi possível fechar.'); return; }
        onSettled();
        onClose();
    };

    if (!isOpen) return null;

    const total = Number(saldo?.total || 0);
    const pago = Number(saldo?.paid || 0);
    const falta = Number(saldo?.balance || 0);
    const quitado = falta <= 0.01 && (saldo?.open_orders || 0) > 0;
    // "Fechar com diferença" é pra PERDOAR troco residual (cliente já foi
    // embora faltando centavos), não pra encerrar a mesa com metade da conta
    // faltando -- pedido do Ikarus 02/10/2026: "Pessoa 1 paga a parte dela e
    // vai embora, a mesa TEM que continuar aberta esperando o resto do
    // pessoal pagar depois, não pode ter um botão ali perto que feche tudo
    // com R$7,50 de diferença por engano". Mesmo critério já usado no
    // fechamento de caixa: só conta como "diferença pequena" até R$5 OU 10%
    // do total, o que for menor.
    const limiarDiferencaPequena = Math.min(5, total * 0.1);
    const diferencaEhPequena = falta > 0.01 && falta <= limiarDiferencaPequena;

    const Cabecalho = (
        <div className="flex justify-between items-start mb-4">
            <div>
                <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase">{rotulo} {tableNumber}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    {modo === 'ESCOLHA' ? 'Como vai fechar?' : modo === 'VALOR' ? 'Dividir por pessoa' : 'Pagar por produto'}
                </p>
                {/* Legenda -- pedido do Ikarus 02/10/2026: "dentro da tela do
                    fracionado, bota uma legenda SEM ATALHOS, aí ele sabe que
                    tem que usar o mouse". Só ESC funciona de teclado aqui; o
                    resto da tela é por clique mesmo (herdado do Papaleguas,
                    pensado pra toque/mouse). */}
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/15 border border-amber-500/30 rounded-full">
                        <kbd className="px-1.5 py-0.5 bg-amber-500/25 rounded text-[10px] font-black uppercase text-gray-900 dark:text-white">ESC</kbd>
                        <span className="text-[10px] font-black uppercase text-gray-900 dark:text-white">CANCELA</span>
                    </span>
                    <span className="text-[10px] font-black uppercase text-gray-400">SEM OUTROS ATALHOS · USE O MOUSE</span>
                </div>
            </div>
            <button onClick={onClose} className="p-2 -m-2 text-gray-400" aria-label="Fechar">
                <X size={24} />
            </button>
        </div>
    );

    const Resumo = (
        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-xl py-2">
                <p className="text-[10px] text-gray-500 uppercase font-bold">Total</p>
                <p className="text-sm font-black text-gray-900 dark:text-white">{brl(total)}</p>
            </div>
            <div className="bg-green-50 dark:bg-green-950/30 rounded-xl py-2">
                <p className="text-[10px] text-green-700 dark:text-green-500 uppercase font-bold">Pago</p>
                <p className="text-sm font-black text-green-700 dark:text-green-500">{brl(pago)}</p>
            </div>
            <div className={`rounded-xl py-2 ${falta > 0.01 ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-green-50 dark:bg-green-950/30'}`}>
                <p className={`text-[10px] uppercase font-bold ${falta > 0.01 ? 'text-amber-700 dark:text-amber-500' : 'text-green-700 dark:text-green-500'}`}>Falta</p>
                <p className={`text-sm font-black ${falta > 0.01 ? 'text-amber-700 dark:text-amber-500' : 'text-green-700 dark:text-green-500'}`}>{brl(Math.max(0, falta))}</p>
            </div>
        </div>
    );

    const SeletorPagamento = (
        <div className="mb-3">
            <div className="grid grid-cols-3 gap-2">
                {(['Dinheiro', 'Cartão', 'PIX'] as FormaPagamento[]).map(f => (
                    <button key={f} onClick={() => setForma(f)}
                        className={`py-3 rounded-xl font-bold text-xs uppercase border-2 transition-all ${
                            forma === f
                                ? 'bg-orange-600 border-orange-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-800 border-transparent text-gray-600 dark:text-gray-400'
                        }`}>
                        {f}
                    </button>
                ))}
            </div>
            {forma === 'Dinheiro' && (
                <input
                    type="number" inputMode="decimal" value={recebido}
                    onChange={e => setRecebido(e.target.value)}
                    placeholder="Recebeu quanto? (opcional, p/ troco)"
                    className="mt-2 w-full px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white text-sm border border-gray-200 dark:border-gray-700"
                />
            )}
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/70 z-[70] flex items-end sm:items-center justify-center backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl max-h-[92vh] flex flex-col">

                <div className="p-5 pb-3 shrink-0">
                    {Cabecalho}
                    {carregando ? (
                        <div className="flex justify-center py-6"><Loader2 className="animate-spin text-orange-600" /></div>
                    ) : Resumo}

                    {erro && (
                        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 rounded-xl p-3 mb-3 text-xs">
                            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                            <span>{erro}</span>
                        </div>
                    )}
                </div>

                <div className="px-5 overflow-y-auto flex-1">

                    {/* ---------- ESCOLHA DO MODO ---------- */}
                    {modo === 'ESCOLHA' && (
                        <div className="space-y-3 pb-4">
                            <button onClick={() => fecharMesa(false)} disabled={!quitado && pago > 0}
                                className="w-full p-4 rounded-2xl bg-orange-600 text-white font-black uppercase text-sm disabled:opacity-40">
                                Conta inteira — {brl(falta)}
                            </button>

                            <button onClick={() => setModo('VALOR')}
                                className="w-full p-4 rounded-2xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center gap-3 text-left">
                                <Users size={22} className="text-orange-600 shrink-0" />
                                <div>
                                    <p className="font-black text-sm text-gray-900 dark:text-white uppercase">Dividir por pessoa</p>
                                    <p className="text-[11px] text-gray-500">Racha o total em partes iguais</p>
                                </div>
                            </button>

                            <button onClick={() => setModo('PRODUTO')}
                                className="w-full p-4 rounded-2xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center gap-3 text-left">
                                <ShoppingBag size={22} className="text-orange-600 shrink-0" />
                                <div>
                                    <p className="font-black text-sm text-gray-900 dark:text-white uppercase">Por produto</p>
                                    <p className="text-[11px] text-gray-500">Cada um paga o que consumiu</p>
                                </div>
                            </button>

                            {(saldo?.payments?.length || 0) > 0 && (
                                <div className="pt-2">
                                    <p className="text-[10px] uppercase font-black text-gray-400 mb-2">Já recebido</p>
                                    <div className="space-y-2">
                                        {saldo!.payments.map(p => (
                                            <div key={p.id} className="flex items-center justify-between bg-green-50 dark:bg-green-950/20 rounded-xl px-3 py-2">
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                                                        {p.payer_label || 'Pagamento'} · {brl(p.amount)}
                                                    </p>
                                                    <p className="text-[10px] text-gray-500">{p.payment_method}</p>
                                                </div>
                                                <button onClick={() => estornar(p)} disabled={salvando}
                                                    className="p-2 text-gray-400 shrink-0" aria-label="Estornar">
                                                    <Undo2 size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ---------- MODO VALOR ---------- */}
                    {modo === 'VALOR' && (
                        <div className="pb-4">
                            <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800 rounded-2xl p-3 mb-3">
                                <span className="text-xs font-black uppercase text-gray-600 dark:text-gray-400">Pessoas</span>
                                <div className="flex items-center gap-4">
                                    <button onClick={() => setQtdPessoas(n => Math.max(2, n - 1))}
                                        className="w-11 h-11 rounded-xl bg-white dark:bg-gray-900 text-xl font-black text-gray-900 dark:text-white">−</button>
                                    <span className="text-2xl font-black w-8 text-center text-gray-900 dark:text-white">{qtdPessoas}</span>
                                    <button onClick={() => setQtdPessoas(n => Math.min(20, n + 1))}
                                        className="w-11 h-11 rounded-xl bg-white dark:bg-gray-900 text-xl font-black text-gray-900 dark:text-white">+</button>
                                </div>
                            </div>

                            <p className="text-center text-sm text-gray-500 mb-3">
                                {brl(total)} ÷ {qtdPessoas} = <span className="font-black text-orange-600">{brl(valorPorPessoa[0] || 0)}</span> cada
                            </p>

                            {SeletorPagamento}

                            <div className="space-y-2">
                                {valorPorPessoa.map((v, idx) => {
                                    const pago1 = pagosIdx.has(idx + 1);
                                    return (
                                        <button key={idx}
                                            disabled={pago1 || salvando}
                                            onClick={() => registrar(v, {
                                                splitMode: 'VALOR',
                                                payerLabel: `Pessoa ${idx + 1}`,
                                                splitTotal: qtdPessoas,
                                                splitIndex: idx + 1
                                            })}
                                            className={`w-full flex items-center justify-between px-4 py-4 rounded-2xl border-2 transition-all ${
                                                pago1
                                                    ? 'bg-green-50 dark:bg-green-950/30 border-green-500/40'
                                                    : 'bg-gray-100 dark:bg-gray-800 border-transparent active:scale-[0.98]'
                                            }`}>
                                            <span className="flex items-center gap-3">
                                                <span className={`w-6 h-6 rounded-md flex items-center justify-center border-2 ${
                                                    pago1 ? 'bg-green-500 border-green-500' : 'border-gray-400'
                                                }`}>
                                                    {pago1 && <Check size={14} className="text-white" />}
                                                </span>
                                                <span className={`font-bold text-sm ${pago1 ? 'text-green-700 dark:text-green-500' : 'text-gray-900 dark:text-white'}`}>
                                                    Pessoa {idx + 1}
                                                </span>
                                            </span>
                                            <span className={`font-black text-sm ${pago1 ? 'text-green-700 dark:text-green-500' : 'text-gray-900 dark:text-white'}`}>
                                                {brl(v)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ---------- MODO PRODUTO ---------- */}
                    {modo === 'PRODUTO' && (
                        <div className="pb-4">
                            <div className="space-y-2 mb-3">
                                {itens.map((i, idx) => {
                                    const k = chave(i);
                                    const div = selecionados[k];
                                    const quit = jaQuitado(i);
                                    return (
                                        <div key={`${k}-${idx}`}
                                            className={`rounded-2xl border-2 px-3 py-3 ${
                                                quit ? 'bg-gray-100 dark:bg-gray-800/40 border-transparent opacity-50'
                                                     : div ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-500'
                                                     : 'bg-gray-100 dark:bg-gray-800 border-transparent'
                                            }`}>
                                            <button onClick={() => alternarItem(i)} disabled={quit}
                                                className="w-full flex items-center justify-between gap-3 text-left">
                                                <span className="flex items-center gap-3 min-w-0">
                                                    <span className={`w-6 h-6 rounded-md shrink-0 flex items-center justify-center border-2 ${
                                                        div ? 'bg-orange-600 border-orange-600' : 'border-gray-400'
                                                    }`}>
                                                        {div && <Check size={14} className="text-white" />}
                                                    </span>
                                                    <span className="min-w-0">
                                                        <span className="block font-bold text-sm text-gray-900 dark:text-white truncate">
                                                            {i.quantity > 1 ? `${i.quantity}x ` : ''}{i.name}
                                                        </span>
                                                        {quit && <span className="block text-[10px] text-green-600 font-bold uppercase">Já pago</span>}
                                                    </span>
                                                </span>
                                                <span className="font-black text-sm text-gray-900 dark:text-white shrink-0">
                                                    {brl(div ? i.line_total / div : i.line_total)}
                                                </span>
                                            </button>

                                            {div && !quit && (
                                                <div className="flex items-center gap-2 mt-3 pl-9">
                                                    <span className="text-[10px] uppercase font-black text-gray-500">Dividir</span>
                                                    {[1, 2, 3, 4].map(d => (
                                                        <button key={d} onClick={() => mudarDivisor(i, d)}
                                                            className={`w-9 h-9 rounded-lg text-xs font-black ${
                                                                div === d ? 'bg-orange-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-500'
                                                            }`}>
                                                            {d === 1 ? '1' : `÷${d}`}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {totalSelecionado > 0 && SeletorPagamento}
                        </div>
                    )}
                </div>

                {/* ---------- RODAPÉ ---------- */}
                <div className="p-5 pt-3 border-t border-gray-200 dark:border-gray-800 shrink-0 space-y-2">
                    {modo === 'PRODUTO' && totalSelecionado > 0 && (
                        <button disabled={salvando}
                            onClick={() => {
                                const escolhidos = itens.filter(i => selecionados[chave(i)]);
                                registrar(totalSelecionado, {
                                    splitMode: 'PRODUTO',
                                    payerLabel: `${escolhidos.length} item(ns)`,
                                    itemsJson: escolhidos.map(i => ({
                                        order_id: i.order_id,
                                        cart_id: i.cart_id,
                                        name: i.name,
                                        fraction: 1 / selecionados[chave(i)],
                                        amount: Number((i.line_total / selecionados[chave(i)]).toFixed(2))
                                    }))
                                });
                            }}
                            className="w-full py-4 rounded-2xl bg-orange-600 text-white font-black uppercase text-sm">
                            {salvando ? 'Registrando…' : `Receber ${brl(totalSelecionado)}`}
                        </button>
                    )}

                    {quitado && (
                        <button onClick={() => fecharMesa(false)} disabled={salvando}
                            className="w-full py-4 rounded-2xl bg-green-600 text-white font-black uppercase text-sm flex items-center justify-center gap-2">
                            <Check size={18} /> Fechar {rotulo.toLowerCase()} {tableNumber}
                        </button>
                    )}

                    {diferencaEhPequena && modo !== 'ESCOLHA' && (
                        <button onClick={() => {
                                if (confirm(`Ainda faltam ${brl(falta)} (troco residual). Fechar perdoando essa diferença?`)) fecharMesa(true);
                            }}
                            disabled={salvando}
                            className="w-full py-3 rounded-2xl bg-transparent border border-amber-500/40 text-amber-600 dark:text-amber-500 font-bold uppercase text-[11px]">
                            Fechar perdoando diferença de {brl(falta)}
                        </button>
                    )}

                    {modo !== 'ESCOLHA' && (
                        <button onClick={() => { setModo('ESCOLHA'); setSelecionados({}); setErro(''); }}
                            className="w-full py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-500 font-bold uppercase text-[11px]">
                            Voltar
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
