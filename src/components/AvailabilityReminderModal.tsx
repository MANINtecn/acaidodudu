import React from 'react';
import { Monitor } from 'lucide-react';

interface AvailabilityReminderModalProps {
    isOpen: boolean;
    onClose: () => void;
    unavailableCount: number;
    onGoToMenu: () => void;
}

export const AvailabilityReminderModal: React.FC<AvailabilityReminderModalProps> = ({ isOpen, onClose, unavailableCount, onGoToMenu }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl border-2 border-orange-500">
                <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mb-4">
                        <Monitor className="text-orange-600 dark:text-orange-400 w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Atenção! 📢</h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-6 font-medium">
                        Existem <span className="text-orange-600 dark:text-orange-400 px-1">{unavailableCount} {unavailableCount === 1 ? 'item' : 'itens'}</span> marcados como indisponíveis/esgotados no cardápio.
                        <br /><span className="text-sm font-normal">Deseja conferir se já pode ativá-los?</span>
                    </p>
                    <div className="flex flex-col w-full gap-3">
                        <button
                            onClick={() => { onGoToMenu(); onClose(); }}
                            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all shadow-lg"
                        >
                            Conferir Itens
                        </button>
                        <button
                            onClick={onClose}
                            className="w-full py-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-sm font-medium"
                        >
                            Lembrar mais tarde
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
