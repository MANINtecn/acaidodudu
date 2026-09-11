import { useState } from 'react';
import { Check, Copy, MessageCircle, ChefHat } from 'lucide-react';
import { gerarResumo, linkWhatsapp, type DadosResumo } from '../services/resumoPedidoService';

interface Props {
    aberto: boolean;
    onFechar: () => void;
    dados: DadosResumo;
    modeloResumo?: string;
    whatsappLoja?: string;
}

/**
 * Tela que o cliente vê logo após fechar um pedido no PIX.
 *
 * O tom importa: o pedido JÁ está em produção. Pedimos o comprovante para
 * "agilizar a entrega", não para "liberar" — enquadrar como desbloqueio soa
 * como desconfiança e aumenta o abandono.
 */
export const PixPosPedido = ({ aberto, onFechar, dados, modeloResumo, whatsappLoja }: Props) => {
    const [copiado, setCopiado] = useState(false);

    if (!aberto) return null;

    const forma = (dados.formaPagamento || '').toUpperCase();
    const ehPix = forma === 'PIX';
    const ehDinheiro = forma.includes('DINHEIRO');
    const ehRetirada = dados.tipoPedido === 'Retirada' || dados.tipoPedido === 'Balcão';

    const resumo = gerarResumo(dados, modeloResumo);
    const link = linkWhatsapp(whatsappLoja || '', resumo);

    const copiarChave = async () => {
        try {
            await navigator.clipboard.writeText(dados.pixKey || '');
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2500);
        } catch {
            // Alguns navegadores bloqueiam a área de transferência: o cliente
            // ainda consegue selecionar a chave na tela.
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">

                {/* Confirmação */}
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 text-white p-6 sm:rounded-t-2xl text-center">
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-sm">
                        <ChefHat size={32} />
                    </div>
                    <h2 className="text-2xl font-black">Pedido confirmado!</h2>
                    <p className="text-white/90 text-sm mt-1">
                        Já estamos preparando o seu pedido 🎉
                    </p>
                </div>

                <div className="p-6 space-y-5">
                    {/* Valor */}
                    <div className="text-center">
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Valor a pagar</p>
                        <p className="text-4xl font-black text-gray-900 dark:text-white mt-1">
                            R$ {(Number(dados.total) || 0).toFixed(2).replace('.', ',')}
                        </p>
                    </div>

                    {/* Chave PIX — so no pagamento em PIX */}
                    {ehPix && (
                    <div className="bg-teal-50 dark:bg-teal-900/20 border-2 border-teal-200 dark:border-teal-800 rounded-xl p-4">
                        <p className="text-[11px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-400 mb-2">
                            Chave PIX {dados.pixKeyType ? `· ${dados.pixKeyType}` : ''}
                        </p>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 text-base font-bold text-gray-900 dark:text-white break-all select-all">
                                {dados.pixKey}
                            </code>
                            <button
                                type="button"
                                onClick={copiarChave}
                                className={`shrink-0 px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 ${
                                    copiado
                                        ? 'bg-green-600 text-white'
                                        : 'bg-teal-600 hover:bg-teal-700 text-white'
                                }`}
                            >
                                {copiado ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}
                            </button>
                        </div>
                        {dados.pixBeneficiary && (
                            <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-2">
                                Beneficiário: <strong>{dados.pixBeneficiary}</strong>
                            </p>
                        )}
                    </div>
                    )}

                    {/* O aviso muda com a forma de pagamento. No PIX pedimos o
                        comprovante com tom de "agilizar", nunca de "liberar". */}
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                        <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
                            {ehPix ? (
                                <>Depois de pagar, <strong>envie o comprovante no nosso WhatsApp</strong> —
                                assim confirmamos na hora e seu pedido sai mais rápido. 😊</>
                            ) : ehDinheiro ? (
                                <>O pagamento é <strong>na entrega, em dinheiro</strong>.
                                {dados.trocoPara ? <> Vamos levar troco para {dados.trocoPara}.</> : null}
                                {' '}Qualquer dúvida, é só chamar no WhatsApp. 😊</>
                            ) : ehRetirada ? (
                                <>O pagamento é <strong>no balcão</strong>, na hora de retirar.
                                {' '}Qualquer dúvida, é só chamar no WhatsApp. 😊</>
                            ) : (
                                <>O pagamento é <strong>na entrega</strong> — o entregador leva a maquininha.
                                {' '}Qualquer dúvida, é só chamar no WhatsApp. 😊</>
                            )}
                        </p>
                    </div>

                    {/* Ação principal */}
                    <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-2 px-5 py-4 bg-[#25D366] hover:brightness-110 text-white rounded-xl font-black text-base shadow-lg shadow-green-500/25 active:scale-95 transition-all"
                    >
                        <MessageCircle size={22} /> {ehPix ? 'Enviar comprovante' : 'Falar no WhatsApp'}
                    </a>
                    <p className="text-[11px] text-center text-gray-500 dark:text-gray-400 -mt-2">
                        {ehPix
                            ? 'O resumo do pedido já vai escrito. É só anexar o comprovante.'
                            : 'O resumo do pedido já vai escrito.'}
                    </p>

                    <button
                        type="button"
                        onClick={onFechar}
                        className="w-full py-3 text-gray-500 dark:text-gray-400 font-bold text-sm hover:text-gray-700"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PixPosPedido;
