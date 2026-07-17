import React, { useEffect } from 'react';
import { Printer } from 'lucide-react';

interface PrintStatusSplashProps {
    show: boolean;
    onClose: () => void;
    duration?: number;
}

export const PrintStatusSplash: React.FC<PrintStatusSplashProps> = ({ 
    show, 
    onClose, 
    duration = 2000 
}) => {
    useEffect(() => {
        if (show) {
            const timer = setTimeout(() => {
                onClose();
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [show, duration, onClose]);

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)] border border-gray-100 dark:border-gray-700 overflow-hidden animate-splash-in max-w-sm w-full pointer-events-auto">
                <div className="relative p-8 flex flex-col items-center text-center gap-6">
                    {/* Background Decorative Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-br from-red-600/5 to-transparent dark:from-red-600/10 -z-10" />
                    
                    {/* Icon Container */}
                    <div className="w-20 h-20 bg-gradient-to-tr from-red-600 to-red-500 rounded-3xl flex items-center justify-center shadow-lg shadow-red-500/30 animate-bounce-subtle">
                        <Printer size={40} className="text-white" />
                    </div>

                    <div className="space-y-2">
                        <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight leading-none">
                            IMPRESSÃO
                        </h3>
                        <p className="text-lg font-bold text-red-600 dark:text-red-400 leading-tight uppercase tracking-widest">
                            Comando Enviado
                        </p>
                        <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">
                            Aguarde a saída na impressora...
                        </p>
                    </div>

                    {/* Timer Line Container */}
                    <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mt-2">
                        <div 
                            className="h-full bg-red-600 rounded-full animate-splash-progress"
                            style={{ animationDuration: `${duration}ms` }}
                        />
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes splash-in {
                    0% { transform: scale(0.9); opacity: 0; }
                    100% { transform: scale(1); opacity: 1; }
                }
                @keyframes splash-progress {
                    0% { width: 100%; }
                    100% { width: 0%; }
                }
                @keyframes bounce-subtle {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-5px); }
                }
                .animate-splash-in {
                    animation: splash-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                }
                .animate-splash-progress {
                    animation: splash-progress linear forwards;
                }
                .animate-bounce-subtle {
                    animation: bounce-subtle 2s ease-in-out infinite;
                }
            `}</style>
        </div>
    );
};
