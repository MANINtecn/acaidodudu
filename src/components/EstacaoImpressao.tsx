import { useEffect, useState } from 'react';
import { Monitor, Check } from 'lucide-react';
import {
    carregarConfigEstacao,
    salvarConfigEstacao,
    CONFIG_PADRAO,
    type ConfigEstacao,
    type EscopoImpressao,
} from '../services/estacaoService';

interface Props {
    /** Impressoras que ESTA máquina enxerga (vem do SettingsTab). */
    impressorasDisponiveis: string[];
}

const ESCOPOS: { valor: EscopoImpressao; titulo: string; ajuda: string }[] = [
    { valor: 'tudo',  titulo: 'Todos os pedidos',      ajuda: 'Imprime tudo que entrar.' },
    { valor: 'app',   titulo: 'Só pedidos do app',     ajuda: 'Site, cardápio digital e WhatsApp. Ideal para a cozinha.' },
    { valor: 'local', titulo: 'Só lançados aqui',      ajuda: 'Balcão e garçom. Ideal para o caixa do salão.' },
    { valor: 'nada',  titulo: 'Não imprimir',          ajuda: 'Esta máquina não imprime nada.' },
];

/**
 * Configuração de impressão DESTA máquina.
 * Fica no disco local (electron-store), não no banco — assim o PC do salão e o
 * da cozinha têm cada um a sua impressora, sem um sobrescrever o outro.
 */
export const EstacaoImpressao = ({ impressorasDisponiveis }: Props) => {
    const [cfg, setCfg] = useState<ConfigEstacao>(CONFIG_PADRAO);
    const [salvando, setSalvando] = useState(false);
    const [salvo, setSalvo] = useState(false);

    useEffect(() => {
        carregarConfigEstacao().then(setCfg);
    }, []);

    const alterar = (campo: keyof ConfigEstacao, valor: any) => {
        setCfg(prev => ({ ...prev, [campo]: valor }));
        setSalvo(false);
    };

    const salvar = async () => {
        setSalvando(true);
        try {
            await salvarConfigEstacao(cfg);
            setSalvo(true);
            setTimeout(() => setSalvo(false), 2500);
        } catch {
            alert('Não foi possível salvar a configuração desta máquina.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border-2 border-blue-300 dark:border-blue-800">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                <div>
                    <h3 className="text-lg font-bold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                        <Monitor size={20} className="text-blue-600 dark:text-blue-400" />
                        Esta Máquina
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        Vale <strong>só neste computador</strong>. Use quando salão e cozinha têm
                        PCs e impressoras diferentes — um não altera a configuração do outro.
                    </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer shrink-0">
                    <input
                        type="checkbox"
                        checked={cfg.ativo}
                        onChange={e => alterar('ativo', e.target.checked)}
                        className="h-5 w-5 rounded text-blue-600 focus:ring-blue-500 border-gray-300 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Ativar</span>
                </label>
            </div>

            {!cfg.ativo ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/40 rounded-lg p-3">
                    Desativado: esta máquina usa a configuração de impressão da loja (a mesma para
                    todos os computadores).
                </p>
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Nome desta máquina
                            </label>
                            <input
                                type="text"
                                value={cfg.nome}
                                onChange={e => alterar('nome', e.target.value)}
                                placeholder="Ex.: Cozinha"
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Impressora principal
                            </label>
                            <select
                                value={cfg.impressora}
                                onChange={e => alterar('impressora', e.target.value)}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                            >
                                <option value="">Nenhuma</option>
                                {impressorasDisponiveis.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Impressora de produção
                            </label>
                            <select
                                value={cfg.impressoraCozinha}
                                onChange={e => alterar('impressoraCozinha', e.target.value)}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                            >
                                <option value="">Nenhuma</option>
                                {impressorasDisponiveis.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            O que esta máquina imprime
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                            {ESCOPOS.map(op => (
                                <button
                                    key={op.valor}
                                    type="button"
                                    onClick={() => alterar('escopo', op.valor)}
                                    className={`text-left p-3 rounded-lg border-2 transition-all ${
                                        cfg.escopo === op.valor
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
                                    }`}
                                >
                                    <span className={`block text-sm font-bold ${
                                        cfg.escopo === op.valor
                                            ? 'text-blue-700 dark:text-blue-300'
                                            : 'text-gray-900 dark:text-gray-100'
                                    }`}>{op.titulo}</span>
                                    <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                        {op.ajuda}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={salvar}
                            disabled={salvando}
                            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg font-bold text-sm transition-all active:scale-95"
                        >
                            {salvando ? 'Salvando...' : 'Salvar nesta máquina'}
                        </button>
                        {salvo && (
                            <span className="text-sm font-bold text-green-600 dark:text-green-400 flex items-center gap-1">
                                <Check size={16} /> Salvo neste computador
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default EstacaoImpressao;
