import { useEffect, useState } from 'react';
import { FileText, Save, Lock, AlertCircle } from 'lucide-react';
import type { FiscalConfig } from '../types';
import { fetchFiscalConfig, saveFiscalConfig } from '../services/supabaseService';

interface FiscalTabProps {
    storeId: string;
}

/**
 * Aba "Nota Fiscal" — cadastro dos dados fiscais da loja (Fase 1 do plano
 * de NFC-e, ver claude-acai.md "ARQUITETURA TECNICA DA NFC-e"). Pedido do
 * Ikarus, 22/09/2026: ele quer VER onde vai cadastrar CNPJ e onde vai
 * emitir, mesmo antes de escolhermos a API fiscal.
 *
 * Por isso a tela tem 2 blocos:
 * 1. Cadastro — funciona hoje, salva em `fiscal_config`.
 * 2. Emissao — visivel mas BLOQUEADA, com aviso do motivo. So liga na
 *    Fase 2, depois de contratada a API (Focus NFe / TecnoSpeed / Webmania
 *    — comparativo no diario) e criada a Edge Function que guarda o token.
 *
 * O CSC (Codigo de Seguranca do Contribuinte) e tratado como campo de senha
 * que so envia ao salvar SE foi digitado de novo — nunca mostra o valor
 * salvo de volta na tela, mesmo padrao de "nao expor segredo que ja foi
 * gravado".
 */
export default function FiscalTab({ storeId }: FiscalTabProps) {
    const [config, setConfig] = useState<Partial<FiscalConfig>>({
        ambiente: 'homologacao',
        cfop_padrao: '5101',
        csosn_padrao: '102',
        pis_cst: '07',
        cofins_cst: '07',
        carga_tributaria_aprox: 4.00,
        regime_tributario: 1,
        uf: 'TO',
    });
    const [cscToken, setCscToken] = useState(''); // nunca pre-preenchido
    const [temCscSalvo, setTemCscSalvo] = useState(false);
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [salvo, setSalvo] = useState(false);

    useEffect(() => {
        let cancelado = false;
        (async () => {
            try {
                const existente = await fetchFiscalConfig(storeId);
                if (cancelado) return;
                if (existente) {
                    setConfig(existente);
                    setTemCscSalvo(!!existente.csc_token);
                }
            } catch (err) {
                console.error('[Fiscal] erro ao carregar configuracao:', err);
            } finally {
                if (!cancelado) setCarregando(false);
            }
        })();
        return () => { cancelado = true; };
    }, [storeId]);

    const atualizar = (campo: keyof FiscalConfig, valor: string | number) => {
        setConfig(prev => ({ ...prev, [campo]: valor }));
        setSalvo(false);
    };

    const handleSalvar = async () => {
        setSalvando(true);
        try {
            const payload: Partial<FiscalConfig> = { ...config };
            // So envia o CSC se o usuario digitou algo agora — campo vazio
            // significa "nao mexer", nunca "apagar o que ja tinha".
            if (cscToken.trim()) {
                payload.csc_token = cscToken.trim();
            } else {
                delete payload.csc_token;
            }
            const salvo = await saveFiscalConfig(storeId, payload);
            setConfig(salvo);
            setTemCscSalvo(!!salvo.csc_token);
            setCscToken('');
            setSalvo(true);
            setTimeout(() => setSalvo(false), 2500);
        } catch (err) {
            console.error('[Fiscal] erro ao salvar configuracao:', err);
            alert('Não foi possível salvar a configuração fiscal. Tente novamente.');
        } finally {
            setSalvando(false);
        }
    };

    const campoTexto = (label: string, campo: keyof FiscalConfig, placeholder?: string, largura = '') => (
        <div className={largura}>
            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">{label}</label>
            <input
                type="text"
                value={(config[campo] as string) || ''}
                onChange={e => atualizar(campo, e.target.value)}
                placeholder={placeholder}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-purple-500"
            />
        </div>
    );

    if (carregando) {
        return <div className="max-w-4xl mx-auto"><p className="text-sm text-gray-400">Carregando...</p></div>;
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Nota Fiscal</h2>

            {/* Bloco 1: Cadastro — funciona hoje */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-bold mb-1 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                    <FileText size={20} className="text-purple-600" /> Dados da Empresa
                </h3>
                <p className="text-[11px] text-gray-500 mb-4">
                    Usados para emitir a NFC-e junto da SEFAZ-TO. Confirme com seu contador antes de salvar.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    {campoTexto('CNPJ', 'cnpj', '00.000.000/0000-00')}
                    {campoTexto('Inscrição Estadual', 'inscricao_estadual')}
                    {campoTexto('Razão Social', 'razao_social', undefined, 'sm:col-span-2')}
                    {campoTexto('Nome Fantasia', 'nome_fantasia', undefined, 'sm:col-span-2')}
                </div>

                <div className="border-t border-gray-100 dark:border-gray-700 pt-4 mb-4">
                    <p className="text-xs font-bold text-gray-600 dark:text-gray-400 mb-3 uppercase tracking-wide">Endereço</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {campoTexto('Logradouro', 'logradouro', undefined, 'sm:col-span-2')}
                        {campoTexto('Número', 'numero')}
                        {campoTexto('Bairro', 'bairro')}
                        {campoTexto('Município', 'municipio')}
                        {campoTexto('CEP', 'cep')}
                        {campoTexto('Código IBGE do Município', 'cod_ibge_municipio')}
                        <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">UF</label>
                            <input
                                type="text"
                                value={config.uf || 'TO'}
                                onChange={e => atualizar('uf', e.target.value.toUpperCase().slice(0, 2))}
                                maxLength={2}
                                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-purple-500"
                            />
                        </div>
                    </div>
                </div>

                <div className="border-t border-gray-100 dark:border-gray-700 pt-4 mb-4">
                    <p className="text-xs font-bold text-gray-600 dark:text-gray-400 mb-3 uppercase tracking-wide">
                        Tributação (já preenchido com o que foi levantado com o contador)
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {campoTexto('CFOP Padrão', 'cfop_padrao')}
                        {campoTexto('CSOSN', 'csosn_padrao')}
                        {campoTexto('PIS/COFINS CST', 'pis_cst')}
                        <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Carga Trib. Aprox. (%)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={config.carga_tributaria_aprox ?? ''}
                                onChange={e => atualizar('carga_tributaria_aprox', parseFloat(e.target.value) || 0)}
                                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-purple-500"
                            />
                        </div>
                    </div>
                </div>

                <div className="border-t border-gray-100 dark:border-gray-700 pt-4 mb-4">
                    <p className="text-xs font-bold text-gray-600 dark:text-gray-400 mb-3 uppercase tracking-wide">SEFAZ-TO</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {campoTexto('ID do CSC', 'csc_id', 'Ex: 000001')}
                        <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">
                                CSC (Código de Segurança do Contribuinte)
                            </label>
                            <input
                                type="password"
                                value={cscToken}
                                onChange={e => setCscToken(e.target.value)}
                                placeholder={temCscSalvo ? '•••••••• (já salvo — digite para trocar)' : 'Ainda não configurado'}
                                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-purple-500"
                            />
                        </div>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-2">
                        O CSC é gerado no portal da SEFAZ-TO com o acesso da própria empresa — é diferente do
                        certificado digital. Se já existir um (o Multipedidos pode ter gerado), é possível reutilizar
                        ou gerar um novo, os dois convivem.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={handleSalvar}
                        disabled={salvando}
                        className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white rounded-lg font-bold text-sm transition-all active:scale-95 flex items-center gap-2"
                    >
                        <Save size={16} />
                        {salvando ? 'Salvando...' : 'Salvar dados fiscais'}
                    </button>
                    {salvo && (
                        <span className="text-sm font-bold text-green-600 dark:text-green-400">Salvo! ✅</span>
                    )}
                </div>
            </div>

            {/* Bloco 2: Emissao — visivel, bloqueada */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 relative overflow-hidden">
                <div className="absolute inset-0 bg-gray-50/80 dark:bg-gray-900/60 backdrop-blur-[1px] z-10 flex items-center justify-center">
                    <div className="bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-700 rounded-xl px-6 py-4 shadow-lg max-w-sm text-center">
                        <Lock size={24} className="text-amber-500 mx-auto mb-2" />
                        <p className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-1">
                            Disponível após contratar a API fiscal
                        </p>
                        <p className="text-[11px] text-gray-500">
                            A emissão de NFC-e depende de um provedor (Focus NFe, TecnoSpeed ou Webmania) ainda não
                            contratado. O cadastro acima já fica pronto para quando isso acontecer.
                        </p>
                    </div>
                </div>

                <h3 className="text-lg font-bold mb-1 flex items-center gap-2 text-gray-900 dark:text-gray-100 opacity-40">
                    <AlertCircle size={20} /> Emissão de Notas
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 opacity-40 pointer-events-none">
                    <button className="p-4 bg-gray-100 dark:bg-gray-900 rounded-lg text-center">
                        <span className="block text-2xl font-black text-gray-400">0</span>
                        <span className="text-[11px] text-gray-500">Notas este mês</span>
                    </button>
                    <button className="p-4 bg-gray-100 dark:bg-gray-900 rounded-lg text-center">
                        <span className="block text-2xl font-black text-gray-400">—</span>
                        <span className="text-[11px] text-gray-500">Último número emitido</span>
                    </button>
                    <button className="p-4 bg-purple-600 rounded-lg text-center text-white">
                        <span className="block text-sm font-bold">Baixar XMLs do mês</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
