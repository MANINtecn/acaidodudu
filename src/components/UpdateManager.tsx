import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

export const UpdateManager: React.FC = () => {
    const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'>('idle');
    const [progress, setProgress] = useState(0);
    const [message, setMessage] = useState('');
    const [currentVersion, setCurrentVersion] = useState<string>('');

    useEffect(() => {
        const fetchVersion = async () => {
            if (window.electron?.getAppVersion) {
                const v = await window.electron.getAppVersion();
                setCurrentVersion(v);
            }
        };
        fetchVersion();

        // Only run in Electron environment
        if (!window.electron) return;

        // Listen for events
        window.electron.onUpdateAvailable((info: any) => {
            setStatus('available');
            setMessage(`Nova versão disponível: ${info.version}`);
        });

        window.electron.onUpdateNotAvailable(() => {
            setStatus('idle');
            setMessage('Você já está na versão mais recente.');
            setTimeout(() => setMessage(''), 3000);
        });

        window.electron.onUpdateDownloadProgress((prog: any) => {
            setStatus('downloading');
            setProgress(prog.percent);
        });

        window.electron.onUpdateDownloaded(() => {
            setStatus('ready');
            setMessage('Atualização ponta para instalar!');
        });

        window.electron.onUpdateError((err: string) => {
            setStatus('error');
            setMessage(`Erro: ${err}`);
        });

        // Get current version if possible (optional, usually from package.json or exposed main)
    }, []);

    const checkForUpdates = async () => {
        if (!window.electron) return;
        setStatus('checking');
        setMessage('Buscando atualizações...');
        try {
            await window.electron.checkForUpdate();
        } catch (e) {
            setStatus('error');
            setMessage('Falha ao buscar atualizações.');
        }
    };

    const downloadAndInstall = async () => {
        if (!window.electron) return;
        if (status === 'available') {
            await window.electron.downloadUpdate();
        } else if (status === 'ready') {
            await window.electron.quitAndInstall();
        }
    };

    // DEBUG: Always render checking logic
    const isElectron = !!window.electron;

    if (!isElectron) {
        return (
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 mb-4">
                <p className="text-yellow-800 text-sm font-bold flex items-center gap-2">
                    <AlertCircle size={16} />
                    Modo Web / Electron Inicializando...
                </p>
                <p className="text-xs text-yellow-600 mt-1">
                    O botão de atualização só aparece no App Desktop. Se você está no App Desktop, algo impediu o carregamento do 'preload'.
                </p>
                <p className="text-xs text-gray-400 mt-1">Status: {JSON.stringify({ isElectron, hasWindow: !!window })}</p>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-blue-200 dark:border-blue-900/30">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <RefreshCw size={20} className={`text-blue-600 dark:text-blue-500 ${status === 'checking' || status === 'downloading' ? 'animate-spin' : ''}`} /> 
                Atualização do Sistema
            </h3>
            
            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                    <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                            {message || 'Sistema atualizado.'}
                        </span>
                        {currentVersion && (
                            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                                Versão Atual: v{currentVersion}
                            </span>
                        )}
                    </div>
                    {status === 'downloading' && (
                        <span className="text-xs font-bold text-blue-600">{progress.toFixed(0)}%</span>
                    )}
                </div>

                {status === 'downloading' && (
                     <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                        <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                    </div>
                )}

                <div className="flex justify-end gap-2">
                    {status === 'idle' || status === 'error' || status === 'checking' ? (
                        <button 
                            onClick={checkForUpdates} 
                            disabled={status === 'checking'}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-wait"
                        >
                            <RefreshCw size={16} className={status === 'checking' ? 'animate-spin' : ''} />
                            {status === 'checking' ? 'Verificando...' : 'Verificar Agora'}
                        </button>
                    ) : (
                        <button 
                            onClick={downloadAndInstall}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-colors text-white
                                ${status === 'ready' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                        >
                            {status === 'ready' ? <CheckCircle size={16} /> : <Download size={16} />}
                            {status === 'ready' ? 'Reiniciar e Instalar' : (status === 'available' ? 'Baixar Atualização' : 'Aguarde...')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
