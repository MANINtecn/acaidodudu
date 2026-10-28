import React, { useEffect, useState } from 'react';
import { WifiOff, AlertTriangle, RefreshCw, Copy, X, Loader2 } from 'lucide-react';
import { offlineDisponivel, vendasNaFila, identificadorMaquina } from '../offline/armazemBalcao';
import { estadoDaConexao, tentarAgora } from '../offline/sincronizadorBalcao';
import { diagnosticarRede, type EstadoConexao, type MotivoConexao } from '../offline/estadoConexao';
import { nomeDaLoja } from '../services/marcaService';

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
const hm = (ms: number | null) => (ms ? new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-');
const hms = (ms: number | null) => (ms ? new Date(ms).toLocaleTimeString('pt-BR') : '-');
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const duracao = (ms: number) => {
    const min = Math.max(1, Math.round(ms / 60000));
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
};

const DIAGNOSTICO: Record<MotivoConexao, { titulo: string; dica: (desde: string) => string }> = {
    'sem-rede': {
        titulo: 'O computador está sem rede.',
        dica: () => 'Confira o cabo de rede ou o Wi-Fi deste computador.',
    },
    'sem-internet': {
        titulo: 'O computador tem rede, mas a internet não está chegando.',
        dica: desde => `O roteador ou o provedor está com problema. Se não voltar logo, ligue para o seu provedor de internet e diga: sem acesso à internet desde ${desde}.`,
    },
    'servidor': {
        titulo: 'A internet funciona, mas o sistema não está respondendo.',
        dica: () => 'Isso costuma passar sozinho. Se durar muito, avise o suporte.',
    },
    'desconhecido': {
        titulo: 'O sistema não está respondendo.',
        dica: () => 'O computador tenta de novo a cada 20 segundos.',
    },
};

/**
 * Aviso de conexão do Balcão. Fica no canto, PULSA para chamar atenção e NÃO cobre a tela nem trava
 * o lançamento de vendas: o dono vende normalmente enquanto ele está lá.
 * Só aparece quando há problema: amarelo (instável), vermelho (venda presa só neste computador).
 */
export const AvisoConexaoBalcao: React.FC = () => {
    const [estado, setEstado] = useState<EstadoConexao>(() => estadoDaConexao());
    const [aberto, setAberto] = useState(false);
    const [tentando, setTentando] = useState(false);
    const [copiado, setCopiado] = useState(false);

    useEffect(() => {
        const t = setInterval(() => setEstado(estadoDaConexao()), 3000);
        return () => clearInterval(t);
    }, []);

    // Enquanto está falhando, descobre o motivo (rede, internet ou sistema) de tempos em tempos.
    useEffect(() => {
        if (estado.desde === null) return;
        let vivo = true;
        const rodar = () => { diagnosticarRede().then(() => { if (vivo) setEstado(estadoDaConexao()); }); };
        rodar();
        const t = setInterval(rodar, 30000);
        return () => { vivo = false; clearInterval(t); };
    }, [estado.desde === null]);

    if (!offlineDisponivel() || estado.nivel === 'ok') return null;

    const critico = estado.nivel === 'critico';
    const atencao = estado.nivel === 'atencao';
    const enviando = estado.nivel === 'enviando';
    const diag = DIAGNOSTICO[estado.motivo];
    const desdeTxt = hm(estado.desde);

    const cor = critico ? 'bg-red-600 text-white' : atencao ? 'bg-amber-500 text-slate-950' : 'bg-sky-600 text-white';
    const brilho = critico ? 'bg-red-500/50' : 'bg-amber-400/50';

    let titulo: string;
    let sub: string;
    if (enviando) {
        titulo = `Enviando ${plural(estado.naFila, 'venda', 'vendas')} para a nuvem...`;
        sub = 'Isso costuma levar poucos segundos.';
    } else if (critico) {
        titulo = `Sem conexão com o sistema há ${duracao(estado.duracaoMs)}`;
        sub = estado.naFila > 0
            ? `${plural(estado.naFila, 'venda', 'vendas')} (${brl(estado.valorNaFila)}) salva${estado.naFila === 1 ? '' : 's'} só neste computador. Mantenha o PC ligado.`
            : 'Continue vendendo normalmente. Mantenha o PC ligado.';
    } else {
        titulo = `Internet instável há ${duracao(estado.duracaoMs)}`;
        sub = 'Continue vendendo normalmente.';
    }

    const copiar = async () => {
        const fila = vendasNaFila();
        const texto = [
            'Pede Aqui - relatório de conexão',
            `Loja: ${nomeDaLoja()}`,
            `Computador: ${identificadorMaquina()}`,
            `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
            `Sem conexão desde: ${estado.desde ? new Date(estado.desde).toLocaleString('pt-BR') : 'não está sem conexão'}`,
            `Diagnóstico: ${diag.titulo}`,
            `Vendas ainda não enviadas: ${estado.naFila} (${brl(estado.valorNaFila)})`,
            `Venda mais antiga na fila: ${estado.maisAntigaEm ? new Date(estado.maisAntigaEm).toLocaleString('pt-BR') : '-'}`,
            `Última tentativa: ${estado.ultimaTentativaEm ? new Date(estado.ultimaTentativaEm).toLocaleString('pt-BR') : '-'}`,
            `Último envio com sucesso: ${estado.ultimoSucessoEm ? new Date(estado.ultimoSucessoEm).toLocaleString('pt-BR') : '-'}`,
            `Último erro: ${estado.ultimoErro || '-'}`,
            `Tentativas da venda mais antiga: ${fila[0]?.tentativas ?? '-'}`,
        ].join('\n');
        try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch (_) { /* sem permissão de área de transferência */ }
    };

    const tentar = async () => {
        setTentando(true);
        try { await tentarAgora(); } finally { setTentando(false); setEstado(estadoDaConexao()); }
    };

    const fila = vendasNaFila().slice(0, 8);

    return (
        <div className="fixed bottom-4 left-4 z-[70] max-w-sm">
            {aberto && (
                <div className="mb-2 w-[22rem] max-w-[92vw] rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-2xl border border-gray-200 dark:border-gray-700 p-4 text-sm">
                    <div className="flex items-start justify-between gap-2">
                        <p className="font-black">{diag.titulo}</p>
                        <button onClick={() => setAberto(false)} aria-label="Fechar" className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"><X size={18} /></button>
                    </div>
                    <p className="mt-1 text-gray-600 dark:text-gray-300">{diag.dica(desdeTxt)}</p>
                    <p className="mt-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 px-3 py-2 text-xs font-medium">
                        Você pode continuar vendendo normalmente. Cada venda fica salva neste computador e sobe sozinha quando a internet voltar. Mantenha o computador ligado e este programa aberto.
                    </p>
                    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                        <dt className="text-gray-500">Sem conexão desde</dt><dd className="font-semibold">{estado.desde ? `${hm(estado.desde)} (${duracao(estado.duracaoMs)})` : '-'}</dd>
                        <dt className="text-gray-500">Última tentativa</dt><dd className="font-semibold">{hms(estado.ultimaTentativaEm)}</dd>
                        <dt className="text-gray-500">Último envio ok</dt><dd className="font-semibold">{hms(estado.ultimoSucessoEm)}</dd>
                    </dl>
                    {fila.length > 0 && (
                        <div className="mt-3">
                            <p className="text-xs font-bold text-gray-700 dark:text-gray-200">Vendas só neste computador ({estado.naFila}, {brl(estado.valorNaFila)})</p>
                            <ul className="mt-1 max-h-28 overflow-y-auto text-xs divide-y divide-gray-100 dark:divide-gray-700">
                                {fila.map(v => (
                                    <li key={v.id} className="py-1 flex justify-between gap-2">
                                        <span>Comanda {v.comanda} &middot; {new Date(v.fechadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                        <span className="font-semibold">{brl(v.total)}</span>
                                    </li>
                                ))}
                            </ul>
                            {estado.naFila > fila.length && <p className="text-[11px] text-gray-500 mt-1">e mais {estado.naFila - fila.length}...</p>}
                        </div>
                    )}
                    <div className="mt-3 flex gap-2">
                        <button onClick={tentar} disabled={tentando} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold px-3 py-2 text-xs">
                            {tentando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Tentar agora
                        </button>
                        <button onClick={copiar} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 font-bold px-3 py-2 text-xs">
                            <Copy size={14} /> {copiado ? 'Copiado' : 'Copiar para o suporte'}
                        </button>
                    </div>
                </div>
            )}

            <button type="button" onClick={() => setAberto(v => !v)} className={`relative block w-full text-left rounded-xl px-4 py-2.5 shadow-xl ${cor}`} aria-live="polite">
                {(critico || atencao) && <span className={`pointer-events-none absolute -inset-1 rounded-2xl animate-pulse ${brilho}`} aria-hidden="true" />}
                <span className="relative flex items-start gap-3">
                    {enviando ? <RefreshCw size={20} className="mt-0.5 shrink-0 animate-spin" /> : critico ? <WifiOff size={20} className="mt-0.5 shrink-0" /> : <AlertTriangle size={20} className="mt-0.5 shrink-0" />}
                    <span className="min-w-0">
                        <span className="block text-sm font-black leading-tight">{titulo}</span>
                        <span className="block text-xs font-semibold leading-snug opacity-95">{sub}</span>
                        <span className="block text-[10px] font-bold uppercase tracking-wide opacity-80 mt-0.5">{aberto ? 'Toque para fechar' : 'Toque para ver detalhes'}</span>
                    </span>
                </span>
            </button>
        </div>
    );
};
