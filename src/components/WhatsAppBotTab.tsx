import { useState, useEffect, useRef } from 'react';
import { 
    MessageSquare, 
    CheckCircle2, 
    AlertCircle, 
    Loader2,
    Terminal,
    Settings as SettingsIcon,
    RefreshCw,
    ShieldCheck,
    Power,
    Save,
    Eye,
    EyeOff,
    Key,
    Cloud
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface WhatsAppBotTabProps {
    isBotEnabled?: boolean;
    onToggleBot?: () => void;
}

export const WhatsAppBotTab = ({ isBotEnabled, onToggleBot }: WhatsAppBotTabProps) => {
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [status, setStatus] = useState<{ connection: string; reconnecting?: boolean }>({ connection: 'connecting' });
    const [logs, setLogs] = useState<string[]>([]);
    const [isLocalEnabled, setIsLocalEnabled] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [activeTunnelUrl, setActiveTunnelUrl] = useState<string | null>(null);
    
    // Credentials
    const [openaiKey, setOpenaiKey] = useState('');
    const [supabaseKey, setSupabaseKey] = useState('');
    const [btzapToken, setBtzapToken] = useState('');
    const [instanceNumber, setInstanceNumber] = useState('');
    const [botPrompt, setBotPrompt] = useState('');
    const [bypassNumber, setBypassNumber] = useState('');
    const [showOpenaiKey, setShowOpenaiKey] = useState(false);
    const [showSupabaseKey, setShowSupabaseKey] = useState(false);
    const [showBtzapToken, setShowBtzapToken] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    const logContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const electron = (window as any).electron;
        if (!electron) return;

        // Load Initial Config
        const loadConfig = async () => {
            const storedEnabled = await electron.storage.getItem('isBotEnabled');
            const storedOpenai = await electron.storage.getItem('openaiKey');
            const storedSupabase = await electron.storage.getItem('supabaseKey');
            const storedBtzap = await electron.storage.getItem('btzapToken');
            const storedInstance = await electron.storage.getItem('instanceNumber');
            const storedPrompt = await electron.storage.getItem('botPrompt');
            const storedBypass = await electron.storage.getItem('bypassNumber');
            
            if (storedEnabled !== undefined) setIsLocalEnabled(storedEnabled !== false);
            if (storedOpenai) setOpenaiKey(storedOpenai);
            if (storedSupabase) setSupabaseKey(storedSupabase);
            if (storedBtzap) setBtzapToken(storedBtzap);
            if (storedInstance) setInstanceNumber(storedInstance);
            if (storedBypass) setBypassNumber(storedBypass);
            if (storedPrompt) setBotPrompt(storedPrompt);
            else {
                setBotPrompt(`Você é PAPALEGUAS MASCOTE o atendente da lanchonete "Papaléguas Lanches". 
Sua função é atender clientes no WhatsApp, tirar dúvidas e coletar pedidos de entrega.
Fechamos às 23:30.

IMPORTANTE: Use APENAS as informações do Cardápio para vender.
DICA: Agilize seu pedido no nosso APP e participe do SELO DE FIDELIDADE: https://papaleguastocmg.vercel.app/

### REGRAS DE TAXA:
- Colônia: R$ 7.00
- Vale do Ouro: R$ 4.00
- Zona Rural: R$ 6.00
- Centro/Cidade: R$ 2.00`);
            }
        };
        loadConfig();

        // Listeners for WhatsApp events from Main Process
        electron.onWhatsAppQR((qr: string) => {
            setQrCode(qr);
            setStatus({ connection: 'awaiting_scan' });
        });

        electron.onWhatsAppStatus((data: any) => {
            setStatus(data);
            if (data.connection === 'connected') {
                setQrCode(null);
            }
        });

        electron.onBotLog((msg: string) => {
            setLogs((prev: string[]) => [...prev.slice(-99), msg]); // Keep last 100 logs
        });

        electron.onTunnelUrl((url: string) => {
            setActiveTunnelUrl(url);
        });

        return () => {
            if (electron.removeAllListeners) {
                electron.removeAllListeners('whatsapp-qr');
                electron.removeAllListeners('whatsapp-status');
                electron.removeAllListeners('bot-log');
                electron.removeAllListeners('tunnel-url');
            }
        };
    }, []);

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    // Sincronizar com as configurações globais vindas do painel lateral
    useEffect(() => {
        if (isBotEnabled !== undefined) {
            setIsLocalEnabled(isBotEnabled);
        }
    }, [isBotEnabled]);

    const handleSaveConfig = async () => {
        const electron = (window as any).electron;
        if (!electron) return;

        setIsSaving(true);
        await electron.storage.setItem('openaiKey', openaiKey);
        await electron.storage.setItem('supabaseKey', supabaseKey);
        await electron.storage.setItem('btzapToken', btzapToken);
        await electron.storage.setItem('instanceNumber', instanceNumber);
        await electron.storage.setItem('botPrompt', botPrompt);
        await electron.storage.setItem('bypassNumber', bypassNumber);
        
        // Notify main process to restart bot with new keys
        electron.restartBot();
        
        setTimeout(() => setIsSaving(false), 1000);
    };

    const handleToggleLocalBot = () => {
        const electron = (window as any).electron;
        if (!electron) return;

        const newState = !isLocalEnabled;
        setIsLocalEnabled(newState);
        electron.toggleBot(newState);
        if (onToggleBot) onToggleBot(); // Atualiza a chave lateral e o banco de dados
    };

    const handleForceSync = async () => {
        const electron = (window as any).electron;
        if (!electron) return;
        setIsSyncing(true);
        try {
            const res = await electron.forceSyncWebhook();
            if (res.success) {
                alert("Sincronização enviada! Verifique o console.");
            } else {
                alert("Erro: " + res.message);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSyncing(false);
        }
    };

    const getStatusColor = () => {
        if (!isLocalEnabled) return 'text-gray-400';
        switch (status.connection) {
            case 'connected': return 'text-emerald-500';
            case 'awaiting_scan': return 'text-orange-500';
            case 'disconnected': return 'text-red-500';
            case 'disabled': return 'text-gray-400';
            default: return 'text-blue-500';
        }
    };

    const getStatusLabel = () => {
        if (!isLocalEnabled) return 'Robô Desligado';
        switch (status.connection) {
            case 'connected': return 'Conectado';
            case 'awaiting_scan': return 'Aguardando Scan';
            case 'disconnected': return status.reconnecting ? 'Reconectando...' : 'Desconectado';
            case 'disabled': return 'Robô Desligado';
            default: return 'Iniciando...';
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500 pb-10">
            {/* Header / Status Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                            <div className={`p-4 rounded-2xl transition-colors ${isLocalEnabled ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}>
                                <MessageSquare size={32} />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight">WhatsApp AI Agent (Local)</h2>
                                <button 
                                    onClick={handleToggleLocalBot}
                                    className="flex items-center gap-2 mt-1 hover:opacity-80 transition-opacity group"
                                    title={isLocalEnabled ? "Clique para Desativar" : "Clique para Ativar"}
                                >
                                    <div className={`w-3 h-3 rounded-full transition-all ${isLocalEnabled && status.connection === 'connected' ? 'bg-emerald-500 animate-pulse' : (isLocalEnabled ? 'bg-orange-500' : 'bg-gray-400')}`} />
                                    <span className={`font-bold uppercase text-xs tracking-wider ${getStatusColor()}`}>
                                        {getStatusLabel()}
                                        <RefreshCw size={10} className="inline ml-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </span>
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col items-end gap-3">
                            <button 
                                onClick={() => setShowSettings(!showSettings)}
                                className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${showSettings ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                            >
                                <SettingsIcon size={14} />
                                CONFIGURAÇÕES
                            </button>
                        </div>
                    </div>

                    {showSettings && (
                        <div className="mt-8 p-6 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 space-y-6 animate-in slide-in-from-top-4 duration-300">
                            <div className="flex items-center gap-2 mb-2">
                                <Key size={18} className="text-orange-500" />
                                <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">Credenciais de API</h3>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">OpenAI API Key</label>
                                    <div className="relative">
                                        <input 
                                            type={showOpenaiKey ? "text" : "password"}
                                            value={openaiKey}
                                            onChange={(e) => setOpenaiKey(e.target.value)}
                                            placeholder="sk-..."
                                            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all dark:text-white"
                                        />
                                        <button 
                                            onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            {showOpenaiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Supabase Service Key</label>
                                    <div className="relative">
                                        <input 
                                            type={showSupabaseKey ? "text" : "password"}
                                            value={supabaseKey}
                                            onChange={(e) => setSupabaseKey(e.target.value)}
                                            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all dark:text-white"
                                        />
                                        <button 
                                            onClick={() => setShowSupabaseKey(!showSupabaseKey)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            {showSupabaseKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>

                                <div className="md:col-span-2 space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">📍 Número de Teste (Bypass)</label>
                                    <input 
                                        type="text"
                                        value={bypassNumber}
                                        onChange={(e) => setBypassNumber(e.target.value)}
                                        placeholder="Ex: 31999999999"
                                        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm font-bold text-orange-600 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all dark:text-orange-400"
                                    />
                                    <p className="text-[10px] text-gray-500 italic ml-1">Mensagens deste número sempre serão respondidas, mesmo se o robô estiver "Desligado".</p>
                                </div>                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Token Instância (BTZAP)</label>
                                    <div className="relative group">
                                        <input 
                                            type={showBtzapToken ? "text" : "password"}
                                            value={btzapToken}
                                            onChange={(e) => setBtzapToken(e.target.value)}
                                            onFocus={(e) => e.target.select()}
                                            placeholder="Cole o token da instância aqui..."
                                            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all dark:text-white"
                                        />
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                            {btzapToken && (
                                                <button 
                                                    type="button"
                                                    onClick={() => setBtzapToken('')}
                                                    className="text-gray-300 hover:text-red-500 transition-colors p-1"
                                                    title="Limpar campo"
                                                >
                                                    <RefreshCw size={14} className="hover:rotate-180 transition-transform duration-500" />
                                                </button>
                                            )}
                                            <button 
                                                type="button"
                                                onClick={() => setShowBtzapToken(!showBtzapToken)}
                                                className="text-gray-400 hover:text-orange-500 transition-colors"
                                            >
                                                {showBtzapToken ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">📱 Número da Estância (Robô)</label>
                                    <div className="relative group">
                                        <input 
                                            type="text"
                                            value={instanceNumber}
                                            onChange={(e) => setInstanceNumber(e.target.value)}
                                            onFocus={(e) => e.target.select()}
                                            placeholder="Ex: 553199999999"
                                            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-bold text-emerald-600 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-emerald-400"
                                        />
                                        {instanceNumber && (
                                            <button 
                                                type="button"
                                                onClick={() => setInstanceNumber('')}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-red-500 transition-colors p-1"
                                                title="Limpar campo"
                                            >
                                                <RefreshCw size={14} className="hover:rotate-180 transition-transform duration-500" />
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-gray-500 italic ml-1">Usado para filtrar mensagens e ignorar outras instâncias.</p>
                                </div>

                                <div className="md:col-span-2 space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Instruções da IA (Prompt)</label>
                                    <textarea 
                                        value={botPrompt}
                                        onChange={(e) => setBotPrompt(e.target.value)}
                                        rows={8}
                                        placeholder="Digite aqui as regras de comportamento do robô..."
                                        className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all dark:text-white resize-none"
                                    />
                                    <p className="text-[10px] text-gray-500 italic ml-1">Dica: Descreva detalhadamente como o robô deve atender e quais links enviar.</p>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3">
                                <button 
                                    onClick={handleSaveConfig}
                                    disabled={isSaving}
                                    className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white font-black text-xs py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
                                >
                                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    SALVAR E REINICIAR ROBÔ
                                </button>

                                <button 
                                    type="button"
                                    onClick={handleForceSync}
                                    disabled={isSyncing || !activeTunnelUrl}
                                    className="flex items-center justify-center gap-2 bg-emerald-50 dark:bg-emerald-950/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 font-bold text-[10px] px-6 py-3 rounded-xl transition-all uppercase tracking-widest border border-emerald-200 dark:border-emerald-800 disabled:opacity-50"
                                >
                                    {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                    Sincronizar Webhook
                                </button>

                                <button 
                                    type="button"
                                    onClick={() => {
                                        if (window.confirm("⚠️ ATENÇÃO: Isso parará o robô, apagará a conexão atual (QR Code) e LIMPARÁ O HISTÓRICO de conversas do banco de dados. Use se o robô estiver travado ou se quiser começar do zero. Continuar?")) {
                                            setBtzapToken('');
                                            setInstanceNumber('');
                                            (window as any).electron.resetWhatsAppSession();
                                        }
                                    }}
                                    className="flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-800 hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 font-bold text-[10px] px-6 py-3 rounded-xl transition-all uppercase tracking-widest"
                                >
                                    <RefreshCw size={14} />
                                    Limpar WhatsApp
                                </button>
                            </div>
                        </div>
                    )}

                    {!showSettings && (
                        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800">
                                <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400 mb-2">
                                    <ShieldCheck size={18} />
                                    <span className="text-sm font-medium">Segurança</span>
                                </div>
                                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Criptografia Local Ponta-a-Ponta</p>
                            </div>
                            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400 mb-2">
                                        <Cloud size={18} className={activeTunnelUrl ? "text-emerald-500" : ""} />
                                        <span className="text-sm font-medium">Túnel BTZAP</span>
                                    </div>
                                    {activeTunnelUrl && (
                                        <button 
                                            onClick={handleForceSync}
                                            className="text-[10px] text-emerald-500 hover:text-emerald-400 font-bold flex items-center gap-1 mb-2 hover:bg-emerald-500/10 px-2 py-0.5 rounded transition-colors"
                                        >
                                            <RefreshCw size={10} className={isSyncing ? "animate-spin" : ""} />
                                            SYNC
                                        </button>
                                    )}
                                </div>
                                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                                    {activeTunnelUrl || "Iniciando..."}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* QR Code Section */}
                <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center text-center">
                    {!isLocalEnabled ? (
                        <div className="space-y-4 opacity-50">
                            <div className="w-24 h-24 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto text-gray-400">
                                <Power size={48} />
                            </div>
                            <p className="text-sm text-gray-500 font-bold uppercase tracking-widest">Robô Desligado</p>
                        </div>
                    ) : status.connection === 'connected' ? (
                        <div className="space-y-4 animate-in zoom-in duration-500">
                            <div className="w-32 h-32 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 size={64} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">WhatsApp Conectado</h3>
                                <p className="text-sm text-gray-500 mt-1">O robô está pronto para atender seus clientes.</p>
                            </div>
                        </div>
                    ) : qrCode ? (
                        <div className="space-y-6 animate-in zoom-in duration-500">
                            <div className="p-4 bg-white rounded-xl shadow-lg border-4 border-orange-500">
                                <QRCodeSVG value={qrCode} size={200} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">Escaneie o QR Code</h3>
                                <p className="text-sm text-gray-500 mt-1">Abra seu WhatsApp {">"} Dispositivos Conectados</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <Loader2 className="w-12 h-12 text-orange-500 animate-spin mx-auto" />
                            <p className="text-sm text-gray-500 font-medium">Iniciando servidor de WhatsApp...</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Console Log Area */}
            <div className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 overflow-hidden">
                <div className="bg-gray-800/50 px-6 py-3 flex items-center justify-between border-b border-gray-700">
                    <div className="flex items-center gap-3">
                        <Terminal size={18} className="text-orange-500" />
                        <span className="text-xs font-black text-gray-300 uppercase tracking-widest">WhatsApp Agent Console</span>
                    </div>
                    <div className="flex gap-1.5 cursor-pointer" onClick={() => setLogs([])} title="Limpar Console">
                        <RefreshCw size={12} className="text-gray-500 hover:text-white transition-colors" />
                    </div>
                </div>
                <div 
                    ref={logContainerRef}
                    className="p-6 h-[400px] overflow-y-auto font-mono text-sm space-y-1.5 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
                >
                    {!isLocalEnabled ? (
                        <div className="h-full flex items-center justify-center text-gray-700 font-bold uppercase tracking-widest">
                            [ SISTEMA OFFLINE ]
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-gray-600 italic">
                            Aguando primeira interação...
                        </div>
                    ) : (
                        logs.map((log: string, i: number) => (
                            <div key={i} className="flex gap-4 group">
                                <span className="text-gray-700 select-none">{(i + 1).toString().padStart(3, '0')}</span>
                                <span className={`break-all ${
                                    log.includes('[IA]') ? 'text-emerald-400' : 
                                    log.includes('[Msg]') ? 'text-blue-400' :
                                    log.includes('[Tool]') ? 'text-orange-400' :
                                    log.includes('ERROR') || log.includes('[Erro]') ? 'text-red-400 font-bold' :
                                    'text-gray-300'
                                }`}>
                                    {log}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Footer / Guide */}
            <div className="bg-orange-50 dark:bg-orange-950/20 p-6 rounded-2xl border border-orange-100 dark:border-orange-900/30 flex items-center gap-4">
                <AlertCircle className="text-orange-600 shrink-0" />
                <p className="text-sm text-orange-800 dark:text-orange-400 font-medium">
                    <span className="font-bold">Dica:</span> O robô funciona de forma independente. Você pode sair desta aba e usar o PDV normalmente que o atendimento continuará ativo em segundo plano.
                </p>
            </div>
        </div>
    );
};
