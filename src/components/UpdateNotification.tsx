import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, AlertCircle, CheckCircle, X } from 'lucide-react';
import packageJson from '../../package.json';

export const UpdateNotification: React.FC = () => {
    const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'no-update' | 'downloading' | 'ready' | 'error'>('idle');
    const [progress, setProgress] = useState(0);
    const [message, setMessage] = useState('');
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Only run in Electron
        if (!(window as any).electron) return;

        const electron = (window as any).electron;

        // Listeners
        electron.onUpdateAvailable(() => {
            setStatus('available');
            setMessage('Nova versão disponível');
            setVisible(true);
        });

        electron.onUpdateNotAvailable(() => {
            // calculated silently usually, but if manually triggered could show
            setStatus('no-update');
        });

        electron.onUpdateDownloadProgress((data: any) => {
            setStatus('downloading');
            setProgress(Math.round(data.percent));
            setVisible(true);
        });

        electron.onUpdateDownloaded(() => {
            setStatus('ready');
            setMessage('Pronto para instalar');
            setVisible(true);
        });

        electron.onUpdateError((err: string) => {
            setStatus('error');
            setMessage('Erro na atualização');
            // Silenced to prevent console pollution
            // console.error(err);
        });

        // Check on mount (double check, though main.js does it too)
        electron.checkForUpdate().catch(() => {
            // Silently fail update checks to avoid console pollution
        });

        return () => {
            // Cleanup listeners if possible/exposed (we exposed removeAllListeners)
            if (electron.removeAllListeners) {
                electron.removeAllListeners('update-available');
                electron.removeAllListeners('update-not-available');
                electron.removeAllListeners('update-download-progress');
                electron.removeAllListeners('update-downloaded');
                electron.removeAllListeners('update-error');
            }
        };
    }, []);

    const downloadUpdate = async () => {
        if ((window as any).electron) {
            await (window as any).electron.downloadUpdate();
        }
    };

    const quitAndInstall = () => {
        if ((window as any).electron) {
            (window as any).electron.quitAndInstall();
        }
    };

    const handleClose = () => {
        setVisible(false);
    };

    if (!visible || status === 'idle' || status === 'no-update') return null;

    return (
        <div className="fixed top-2 right-4 z-[9999] flex flex-col gap-2 pointer-events-auto">
             {/* Main Pill */}
            <div className={`
                flex items-center gap-3 px-4 py-2 rounded-full shadow-lg border backdrop-blur-md transition-all duration-300
                ${status === 'error' ? 'bg-red-900/90 border-red-700 text-white' : 
                  status === 'ready' ? 'bg-green-900/90 border-green-700 text-white' : 
                  'bg-gray-900/90 border-gray-700 text-white'}
            `}>
                
                {/* Icon */}
                <div className="shrink-0 animate-in zoom-in">
                    {status === 'checking' && <RefreshCw className="animate-spin" size={16} />}
                    {status === 'available' && <Download className="animate-bounce" size={16} />}
                    {status === 'downloading' && <RefreshCw className="animate-spin" size={16} />}
                    {status === 'ready' && <CheckCircle className="text-green-400" size={16} />}
                    {status === 'error' && <AlertCircle className="text-red-400" size={16} />}
                </div>

                {/* Content */}
                <div className="flex flex-col">
                    <span className="text-xs font-bold leading-none">{message}</span>
                    {status === 'downloading' && (
                        <div className="w-24 bg-gray-700 rounded-full h-1 mt-1">
                            <div className="bg-blue-500 h-1 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                        </div>
                    )}
                     {status === 'available' && (
                        <span className="text-[10px] text-gray-300">v{packageJson.version} → Nova</span>
                    )}
                </div>

                {/* Actions */}
                {status === 'available' && (
                    <button 
                        onClick={downloadUpdate}
                        className="ml-2 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-[10px] font-bold rounded-full transition-colors"
                    >
                        BAIXAR
                    </button>
                )}
                
                {status === 'ready' && (
                    <button 
                        onClick={quitAndInstall}
                        className="ml-2 px-3 py-1 bg-green-600 hover:bg-green-500 text-[10px] font-bold rounded-full transition-colors animate-pulse"
                    >
                        REINICIAR
                    </button>
                )}

                <button onClick={handleClose} className="ml-1 opacity-50 hover:opacity-100">
                    <X size={14} />
                </button>
            </div>
        </div>
    );
};
