import { useState } from 'react';
import { QrCode, MessageCircle, Eye, RotateCcw } from 'lucide-react';
import type { Settings } from '../types';
import {
    gerarResumo,
    MODELO_PADRAO,
    MARCAS_DISPONIVEIS,
    EXEMPLO_RESUMO,
} from '../services/resumoPedidoService';

interface Props {
    formData: Settings;
    setFormData: React.Dispatch<React.SetStateAction<Settings>>;
}

const TIPOS_CHAVE = ['CNPJ', 'CPF', 'Celular', 'E-mail', 'Aleatória'];

/**
 * Configuração do PIX e do envio de comprovante pelo WhatsApp.
 * O que o cliente vê ao fechar um pedido no PIX: a chave, o aviso de que o
 * pedido entrou em produção, e o botão que abre a conversa com o resumo pronto.
 */
export const PixWhatsappConfig = ({ formData, setFormData }: Props) => {
    const [verPreview, setVerPreview] = useState(false);

    const alterar = (campo: keyof Settings, valor: any) =>
        setFormData(prev => ({ ...prev, [campo]: valor }));

    const modelo = formData.pixResumoTemplate || MODELO_PADRAO;

    const preview = gerarResumo({
        ...EXEMPLO_RESUMO,
        pixKey: formData.pixKey || EXEMPLO_RESUMO.pixKey,
        pixKeyType: formData.pixKeyType || EXEMPLO_RESUMO.pixKeyType,
        pixBeneficiary: formData.pixBeneficiary || EXEMPLO_RESUMO.pixBeneficiary,
    }, modelo);

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-teal-200 dark:border-teal-900/30">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                <div>
                    <h3 className="text-lg font-bold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                        <QrCode size={20} className="text-teal-600 dark:text-teal-400" />
                        PIX e Comprovante no WhatsApp
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        Ao fechar um pedido no PIX, o cliente vê a chave e um botão que abre
                        o WhatsApp da loja com o resumo já escrito — ele só anexa o comprovante.
                    </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer shrink-0">
                    <input
                        type="checkbox"
                        checked={!!formData.pixEnabled}
                        onChange={e => alterar('pixEnabled', e.target.checked)}
                        className="h-5 w-5 rounded text-teal-600 focus:ring-teal-500 border-gray-300 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Ativar</span>
                </label>
            </div>

            {!formData.pixEnabled ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/40 rounded-lg p-3">
                    Desativado: o cliente finaliza o pedido normalmente, sem a tela de PIX.
                </p>
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Chave PIX
                            </label>
                            <input
                                type="text"
                                value={formData.pixKey || ''}
                                onChange={e => alterar('pixKey', e.target.value)}
                                placeholder="Ex.: 44344954000197"
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Tipo
                            </label>
                            <select
                                value={formData.pixKeyType || 'CNPJ'}
                                onChange={e => alterar('pixKeyType', e.target.value)}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                            >
                                {TIPOS_CHAVE.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Beneficiário
                            </label>
                            <input
                                type="text"
                                value={formData.pixBeneficiary || ''}
                                onChange={e => alterar('pixBeneficiary', e.target.value)}
                                placeholder="Nome que aparece para o cliente conferir"
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1.5">
                                <MessageCircle size={15} /> WhatsApp da loja
                            </label>
                            <input
                                type="text"
                                value={formData.storeWhatsapp || ''}
                                onChange={e => alterar('storeWhatsapp', e.target.value.replace(/\D/g, ''))}
                                placeholder="63999998888 (com DDD)"
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                            />
                            <p className="text-[11px] text-gray-500 mt-1">
                                É o número que recebe o comprovante.
                            </p>
                        </div>
                    </div>

                    {/* Modelo do resumo */}
                    <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Modelo do resumo enviado
                            </label>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setVerPreview(v => !v)}
                                    className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all"
                                >
                                    <Eye size={13} /> {verPreview ? 'Editar' : 'Ver como fica'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => alterar('pixResumoTemplate', MODELO_PADRAO)}
                                    className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-700 dark:text-gray-300 rounded-lg text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all"
                                >
                                    <RotateCcw size={13} /> Restaurar padrão
                                </button>
                            </div>
                        </div>

                        {verPreview ? (
                            <pre className="w-full p-4 bg-[#e5ddd5] dark:bg-gray-900 rounded-lg text-[12px] font-mono whitespace-pre-wrap text-gray-900 dark:text-gray-200 max-h-80 overflow-y-auto border border-gray-200 dark:border-gray-700">
                                {preview}
                            </pre>
                        ) : (
                            <>
                                <textarea
                                    value={modelo}
                                    onChange={e => alterar('pixResumoTemplate', e.target.value)}
                                    rows={12}
                                    className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-teal-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 font-mono text-[12px]"
                                />
                                <div className="mt-2">
                                    <p className="text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-1">
                                        Marcas disponíveis (clique para inserir):
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                        {MARCAS_DISPONIVEIS.map(m => (
                                            <button
                                                key={m.marca}
                                                type="button"
                                                title={m.descricao}
                                                onClick={() => alterar('pixResumoTemplate', modelo + m.marca)}
                                                className="px-2 py-0.5 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 rounded text-[10px] font-mono hover:bg-teal-100"
                                            >
                                                {m.marca}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PixWhatsappConfig;
