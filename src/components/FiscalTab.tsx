import { useEffect, useState } from 'react';
import { FileText, Save, AlertCircle, Upload, CheckCircle2, RefreshCw, Zap } from 'lucide-react';
import type { FiscalConfig, NotaFiscal } from '../types';
import { fetchFiscalConfig, saveFiscalConfig, uploadCertificadoFiscal, fetchNotasFiscais, emitirNotaFiscalAgora } from '../services/supabaseService';

interface FiscalTabProps {
    storeId: string;
}

/** Provedores de API fiscal conhecidos -- plug-and-play (Ikarus, 28/09/2026):
 * cada copia do app/cliente escolhe o seu aqui, a Edge Function `emitir-nfce`
 * roteia pelo valor salvo. Adicionar um provedor novo = so mexer nesta
 * lista + criar o adaptador correspondente na Edge Function, nunca mexer
 * nesta tela de novo. */
const PROVEDORES_API = [
    { value: '', label: 'Nenhum contratado ainda' },
    { value: 'brasil_nfe', label: 'Brasil NFe' },
    { value: 'focus_nfe', label: 'Focus NFe' },
    { value: 'enotas', label: 'eNotas' },
];

/**
 * Aba "Nota Fiscal" — cadastro + emissao da loja (NFC-e). Ver
 * claude-acai.md, "ARQUITETURA TECNICA DA NFC-e".
 *
 * Blocos:
 * 1. Dados da Empresa — cadastro basico (CNPJ, endereco, CSC).
 * 2. Provedor + Numeracao + Certificado — plug-and-play por loja: cada
 *    cliente escolhe seu provedor de API fiscal e configura serie/numero
 *    inicial sem precisar mexer em codigo (Fase 2, 28/09/2026).
 * 3. Emissao — mostra estatisticas reais (notas do mes, ultimo numero) a
 *    partir de `notas_fiscais`. So fica "ativa de verdade" quando houver
 *    provedor configurado; sem provedor, mostra o aviso de bloqueio.
 * 4. Relatorio — lista as notas emitidas/pendentes/rejeitadas.
 *
 * O CSC (Codigo de Seguranca do Contribuinte) e' tratado como campo de senha
 * que so envia ao salvar SE foi digitado de novo — nunca mostra o valor
 * salvo de volta na tela.
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
        serie_padrao: 1,
    });
    const [cscToken, setCscToken] = useState(''); // nunca pre-preenchido
    const [temCscSalvo, setTemCscSalvo] = useState(false);
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [salvo, setSalvo] = useState(false);
    const [enviandoCertificado, setEnviandoCertificado] = useState(false);

    const [notas, setNotas] = useState<NotaFiscal[]>([]);
    const [carregandoNotas, setCarregandoNotas] = useState(false);
    const [mostrarRelatorio, setMostrarRelatorio] = useState(false);
    const [emitindo, setEmitindo] = useState(false);
    const [resultadoEmissao, setResultadoEmissao] = useState<{ ok: boolean; mensagem: string } | null>(null);

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

    const carregarNotas = async () => {
        setCarregandoNotas(true);
        try {
            const lista = await fetchNotasFiscais(storeId);
            setNotas(lista);
        } catch (err) {
            console.error('[Fiscal] erro ao carregar notas:', err);
        } finally {
            setCarregandoNotas(false);
        }
    };

    useEffect(() => {
        if (mostrarRelatorio) carregarNotas();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mostrarRelatorio]);

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

    const handleUploadCertificado = async (file: File) => {
        if (!/\.(pfx|p12)$/i.test(file.name)) {
            alert('O certificado A1 deve ser um arquivo .pfx ou .p12.');
            return;
        }
        setEnviandoCertificado(true);
        try {
            const { path, nomeArquivo } = await uploadCertificadoFiscal(file, storeId);
            const salvo = await saveFiscalConfig(storeId, {
                certificado_nome_arquivo: nomeArquivo,
                certificado_storage_path: path,
                certificado_enviado_em: new Date().toISOString(),
            });
            setConfig(salvo);
            alert('Certificado enviado. A senha dele deve ser passada separadamente para configurar na Edge Function (nunca aqui na tela).');
        } catch (err) {
            console.error('[Fiscal] erro ao enviar certificado:', err);
            alert('Não foi possível enviar o certificado. Tente novamente.');
        } finally {
            setEnviandoCertificado(false);
        }
    };

    /**
     * Botao "Gerar Nota Fiscal (teste)" -- pedido explicito do Ikarus
     * (28/09/2026): o botao deve EXISTIR e ser CLICAVEL mesmo sem provedor
     * contratado ainda. Chama a mesma Edge Function que o checkout real usa
     * (`emitirNotaFiscalAgora`), so que sem pedido vinculado (nota avulsa,
     * so para validar a integracao). Sem provedor configurado, o resultado
     * vem com sucesso=false e motivo explicito -- mostrado na tela como
     * "Contingência", nao como bug.
     */
    const handleGerarNotaTeste = async () => {
        setEmitindo(true);
        setResultadoEmissao(null);
        try {
            const { nota, resultado } = await emitirNotaFiscalAgora(storeId, 0.01, undefined, config as FiscalConfig);
            if (resultado?.sucesso) {
                setResultadoEmissao({ ok: true, mensagem: `Nota ${nota.serie}/${nota.numero} autorizada! Protocolo: ${resultado.protocoloAutorizacao}` });
            } else {
                setResultadoEmissao({
                    ok: false,
                    mensagem: `Nota ${nota.serie}/${nota.numero} não saiu: ${resultado?.motivoRejeicao || 'motivo desconhecido'}`,
                });
            }
            carregarNotas();
        } catch (err: any) {
            console.error('[Fiscal] erro ao gerar nota de teste:', err);
            setResultadoEmissao({ ok: false, mensagem: err?.message || 'Falha ao chamar a emissão. Veja o console.' });
        } finally {
            setEmitindo(false);
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

    const provedorConfigurado = !!config.provedor_api;
    const notasDoMes = notas.filter(n => {
        const d = new Date(n.data_emissao);
        const hoje = new Date();
        return d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear();
    });
    const ultimaNota = [...notas].sort((a, b) => b.numero - a.numero)[0];

    const corStatus = (status: NotaFiscal['status']) => ({
        pendente: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20',
        autorizada: 'text-green-600 bg-green-50 dark:bg-green-900/20',
        rejeitada: 'text-red-600 bg-red-50 dark:bg-red-900/20',
        cancelada: 'text-gray-500 bg-gray-100 dark:bg-gray-800',
        contingencia: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20',
    }[status]);

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

            {/* Bloco 2: Provedor + Numeracao + Certificado — plug-and-play por loja */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-bold mb-1 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                    <FileText size={20} className="text-purple-600" /> Provedor, Numeração e Certificado
                </h3>
                <p className="text-[11px] text-gray-500 mb-4">
                    Estes campos são desta loja específica — trocar o provedor de API fiscal ou os dados abaixo
                    não exige mexer em código, só preencher aqui.
                </p>

                <div className="border-b border-gray-100 dark:border-gray-700 pb-4 mb-4">
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">
                        Provedor de API Fiscal
                    </label>
                    <select
                        value={config.provedor_api || ''}
                        onChange={e => atualizar('provedor_api', e.target.value)}
                        className="w-full sm:w-72 px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-purple-500"
                    >
                        {PROVEDORES_API.map(p => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                    </select>
                    <p className="text-[11px] text-gray-500 mt-2">
                        O token de acesso do provedor NUNCA é digitado aqui — fica configurado direto no servidor
                        (Edge Function), fora do alcance do aplicativo instalado no computador da loja.
                    </p>
                </div>

                <div className="border-b border-gray-100 dark:border-gray-700 pb-4 mb-4">
                    <p className="text-xs font-bold text-gray-600 dark:text-gray-400 mb-3 uppercase tracking-wide">
                        Numeração da NFC-e
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Série</label>
                            <input
                                type="number"
                                value={config.serie_padrao ?? 1}
                                onChange={e => atualizar('serie_padrao', parseInt(e.target.value) || 1)}
                                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-purple-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">
                                Número inicial (próximo a emitir)
                            </label>
                            <input
                                type="number"
                                value={config.numero_inicial ?? ''}
                                onChange={e => atualizar('numero_inicial', parseInt(e.target.value) || 0)}
                                placeholder="Ex: 25881"
                                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-purple-500"
                            />
                        </div>
                    </div>
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2 font-bold">
                        ⚠️ Preencha com o ÚLTIMO número emitido pelo sistema anterior + 1. Um número errado aqui
                        pode colidir com uma nota já emitida e causar rejeição na SEFAZ.
                    </p>
                </div>

                <div>
                    <p className="text-xs font-bold text-gray-600 dark:text-gray-400 mb-3 uppercase tracking-wide">
                        Certificado Digital A1
                    </p>
                    {config.certificado_nome_arquivo ? (
                        <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2 mb-2">
                            <CheckCircle2 size={16} />
                            <span>{config.certificado_nome_arquivo} — enviado</span>
                        </div>
                    ) : (
                        <p className="text-[11px] text-gray-500 mb-2">Nenhum certificado enviado ainda.</p>
                    )}
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-900 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-bold cursor-pointer transition-all">
                        <Upload size={16} />
                        {enviandoCertificado ? 'Enviando...' : 'Enviar arquivo .pfx/.p12'}
                        <input
                            type="file"
                            accept=".pfx,.p12"
                            className="hidden"
                            disabled={enviandoCertificado}
                            onChange={e => e.target.files?.[0] && handleUploadCertificado(e.target.files[0])}
                        />
                    </label>
                    <p className="text-[11px] text-gray-500 mt-2">
                        O arquivo fica guardado de forma privada, sem acesso pelo aplicativo instalado na loja.
                        A senha do certificado deve ser passada separadamente (nunca digitada aqui).
                    </p>
                </div>

                <div className="flex items-center gap-3 mt-4">
                    <button
                        type="button"
                        onClick={handleSalvar}
                        disabled={salvando}
                        className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white rounded-lg font-bold text-sm transition-all active:scale-95 flex items-center gap-2"
                    >
                        <Save size={16} />
                        {salvando ? 'Salvando...' : 'Salvar'}
                    </button>
                </div>
            </div>

            {/* Bloco 3: Emissao — botao SEMPRE ativo, mesmo sem provedor (pedido
                explicito do Ikarus, 28/09/2026: o front tem que estar pronto
                para quando o provedor for escolhido, sem eu precisar voltar
                a mexer em tela. Sem provedor, o clique mostra o motivo real
                em vez de fingir que nao existe.) */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-bold mb-1 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                    <AlertCircle size={20} /> Emissão de Notas
                </h3>
                {!provedorConfigurado && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 font-bold mb-3">
                        ⚠️ Nenhum provedor de API fiscal contratado ainda — o botão abaixo funciona
                        (grava a nota e chama o sistema), mas a nota vai ficar em "Contingência" até
                        escolher um provedor no bloco acima e configurar o acesso dele.
                    </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                    <div className="p-4 bg-gray-100 dark:bg-gray-900 rounded-lg text-center">
                        <span className="block text-2xl font-black text-gray-700 dark:text-gray-200">{notasDoMes.length}</span>
                        <span className="text-[11px] text-gray-500">Notas este mês</span>
                    </div>
                    <div className="p-4 bg-gray-100 dark:bg-gray-900 rounded-lg text-center">
                        <span className="block text-2xl font-black text-gray-700 dark:text-gray-200">{ultimaNota?.numero ?? '—'}</span>
                        <span className="text-[11px] text-gray-500">Último número emitido</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setMostrarRelatorio(v => !v)}
                        className="p-4 bg-purple-600 hover:bg-purple-700 rounded-lg text-center text-white transition-all"
                    >
                        <span className="block text-sm font-bold">{mostrarRelatorio ? 'Ocultar relatório' : 'Ver relatório de notas'}</span>
                    </button>
                </div>

                <div className="border-t border-gray-100 dark:border-gray-700 mt-4 pt-4">
                    <button
                        type="button"
                        onClick={handleGerarNotaTeste}
                        disabled={emitindo || !config.cnpj}
                        title={!config.cnpj ? 'Preencha e salve os Dados da Empresa primeiro' : undefined}
                        className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                        <Zap size={16} className={emitindo ? 'animate-pulse' : ''} />
                        {emitindo ? 'Gerando...' : 'Gerar Nota Fiscal (teste)'}
                    </button>
                    <p className="text-[11px] text-gray-500 mt-2">
                        Gera uma nota avulsa de R$ 0,01 só para testar a integração de ponta a ponta —
                        não vincula a nenhum pedido real.
                    </p>

                    {resultadoEmissao && (
                        <div className={`mt-3 rounded-lg px-4 py-3 text-sm font-bold ${
                            resultadoEmissao.ok
                                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                                : 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400'
                        }`}>
                            {resultadoEmissao.mensagem}
                        </div>
                    )}
                </div>
            </div>

            {/* Bloco 4: Relatorio de notas */}
            {mostrarRelatorio && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Notas Fiscais</h3>
                        <button
                            type="button"
                            onClick={carregarNotas}
                            disabled={carregandoNotas}
                            className="text-sm text-purple-600 hover:text-purple-700 font-bold flex items-center gap-1"
                        >
                            <RefreshCw size={14} className={carregandoNotas ? 'animate-spin' : ''} />
                            Atualizar
                        </button>
                    </div>

                    {notas.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-6">
                            {carregandoNotas ? 'Carregando...' : 'Nenhuma nota registrada ainda.'}
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-[11px] uppercase text-gray-500 border-b border-gray-100 dark:border-gray-700">
                                        <th className="py-2 pr-3">Série/Número</th>
                                        <th className="py-2 pr-3">Status</th>
                                        <th className="py-2 pr-3">Valor</th>
                                        <th className="py-2 pr-3">Data</th>
                                        <th className="py-2 pr-3">Detalhe</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {notas.map(nota => (
                                        <tr key={nota.id} className="border-b border-gray-50 dark:border-gray-800">
                                            <td className="py-2 pr-3 font-mono">{nota.serie}/{nota.numero}</td>
                                            <td className="py-2 pr-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${corStatus(nota.status)}`}>
                                                    {nota.status}
                                                </span>
                                            </td>
                                            <td className="py-2 pr-3">R$ {nota.valor_total.toFixed(2)}</td>
                                            <td className="py-2 pr-3">{new Date(nota.data_emissao).toLocaleString('pt-BR')}</td>
                                            <td className="py-2 pr-3 text-[11px] text-gray-500">
                                                {nota.motivo_rejeicao || (nota.status === 'autorizada' ? nota.protocolo_autorizacao : '—')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
