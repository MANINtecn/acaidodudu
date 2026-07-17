import React, { useState } from 'react';
import { Gift, Calendar, Search, Users, Trophy, Clock } from 'lucide-react';
import { fetchEligibleCustomersForRaffle, updateSettings, fetchAllBolaoGuesses, fetchCustomerByPhone } from '../services/supabaseService';
import { Settings } from '../types';

interface RaffleTabProps {
    storeId: string;
    settings: Settings;
    onUpdate: () => void;
}

const RaffleTab: React.FC<RaffleTabProps> = ({ storeId, settings, onUpdate }) => {
    const [startDate, setStartDate] = useState(() => {
        const date = new Date();
        date.setDate(date.getDate() - 7);
        return date.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [eligibleCustomers, setEligibleCustomers] = useState<{ name: string, phone: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [raffleWinner, setRaffleWinner] = useState<{ name: string, phone: string } | null>(null);
    const [isRaffling, setIsRaffling] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [activeView, setActiveView] = useState<'raffle' | 'bolao'>('raffle');
    const [bolaoGuesses, setBolaoGuesses] = useState<any[]>([]);
    const [bolaoLoading, setBolaoLoading] = useState(false);

    // Sync local state with settings prop
    React.useEffect(() => {
        setLocalSettings({
            raffleDrawDate: settings.raffleDrawDate || '',
            rafflePrizeValue: settings.rafflePrizeValue || 0,
            isRaffleEnabled: settings.isRaffleEnabled || false,
            bolaoStartTime: settings.bolaoStartTime || '',
            bolaoEndTime: settings.bolaoEndTime || ''
        });
    }, [settings]);

    React.useEffect(() => {
        if (activeView === 'bolao') {
            loadBolaoGuesses();
        }
    }, [activeView, storeId]);

    const loadBolaoGuesses = async () => {
        setBolaoLoading(true);
        try {
            const guesses = await fetchAllBolaoGuesses(storeId);
            
            // Enrich with customer names
            const enrichedGuesses = await Promise.all(guesses.map(async (g: any) => {
                try {
                    const customer = await fetchCustomerByPhone(g.phone, storeId);
                    return { ...g, customerName: customer?.name || 'Desconhecido' };
                } catch (e) {
                    return { ...g, customerName: 'Desconhecido' };
                }
            }));
            
            setBolaoGuesses(enrichedGuesses);
        } catch (error) {
            console.error("Error loading bolao guesses:", error);
        } finally {
            setBolaoLoading(false);
        }
    };

    // Local state for settings form
    const [localSettings, setLocalSettings] = useState({
        raffleDrawDate: settings.raffleDrawDate || '',
        rafflePrizeValue: settings.rafflePrizeValue || 0,
        isRaffleEnabled: settings.isRaffleEnabled || false,
        bolaoStartTime: settings.bolaoStartTime || '',
        bolaoEndTime: settings.bolaoEndTime || ''
    });

    const [bolaoResult, setBolaoResult] = useState({ brazil: '', opponent: '' });
    const [bolaoWinner, setBolaoWinner] = useState<any | null>(null);
    const [bolaoWinnerStatus, setBolaoWinnerStatus] = useState<string>('');

    const handleApurarVencedor = () => {
        setBolaoWinnerStatus('');
        setBolaoWinner(null);
        if (bolaoResult.brazil === '' || bolaoResult.opponent === '') {
            alert('Preencha os dois placares.');
            return;
        }

        const bScore = parseInt(bolaoResult.brazil);
        const oScore = parseInt(bolaoResult.opponent);

        // Find exact matches
        const matches = bolaoGuesses.filter(g => g.brazil_score === bScore && g.opponent_score === oScore);

        if (matches.length === 0) {
            setBolaoWinnerStatus('Nenhum cliente acertou esse placar.');
        } else {
            // Sort by created_at ascending (the first one)
            matches.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            const winner = matches[0];
            setBolaoWinner(winner);
            setBolaoWinnerStatus('Temos um vencedor!');
        }
    };

    const handleNotificarVencedor = () => {
        if (!bolaoWinner) return;
        const message = `🎉 🏆 GOLAAÇOOOO! Parabéns, ${bolaoWinner.customerName}!\nVocê foi o PRIMEIRO cliente a acertar na mosca o placar de Brasil ${bolaoResult.brazil} x ${bolaoResult.opponent} Marrocos no nosso Bolão da Copa!\n\nVocê acaba de ganhar uma *Batata Grande com Cheddar e Bacon*! 🍟🥓\n\nPara resgatar, basta apresentar esta mensagem no balcão juntamente com o número do seu celular. O nosso atendente vai verificar no sistema para validar seu prêmio.\n\n⚠️ *IMPORTANTE*: O prêmio é EXCLUSIVO para consumo no local (na mesa). Não é válido para retirada nem para entrega.\n\nObrigado por participar e ser um cliente fiel do Papaléguas!`;
        const phone = bolaoWinner.phone.replace(/\D/g, '');
        const whatsappUrl = `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
    };

    const handleSaveSettings = async () => {
        setLoading(true);
        try {
            const settingsToUpdate: any = { ...localSettings };

            // If the date has changed, clear the last winner to reset the cycle
            if (localSettings.raffleDrawDate !== settings.raffleDrawDate) {
                settingsToUpdate.lastRaffleWinner = null;
            }

            await updateSettings(storeId, settingsToUpdate);
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);

            // Notify parent to reload data
            onUpdate();
        } catch (error: any) {
            console.error("Error saving raffle settings:", error);
            alert(`Erro ao salvar: ${error.message || JSON.stringify(error)}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async () => {
        setLoading(true);
        try {
            const customers = await fetchEligibleCustomersForRaffle(storeId, startDate, endDate);
            setEligibleCustomers(customers);
            setRaffleWinner(null);
        } catch (error) {
            console.error("Error fetching eligible customers:", error);
            alert("Erro ao buscar participantes.");
        } finally {
            setLoading(false);
        }
    };

    const executeRaffle = () => {
        if (eligibleCustomers.length === 0) return;
        setIsRaffling(true);
        setRaffleWinner(null);

        let counter = 0;
        const interval = setInterval(() => {
            const randomIndex = Math.floor(Math.random() * eligibleCustomers.length);
            setRaffleWinner(eligibleCustomers[randomIndex]);
            counter++;

            if (counter > 40) { // Longer animation
                clearInterval(interval);
                setIsRaffling(false);
                // Save winner to settings
                const winner = eligibleCustomers[randomIndex];
                updateSettings(storeId, { lastRaffleWinner: winner.name })
                    .then(() => console.log("Winner saved:", winner.name))
                    .catch(err => console.error("Error saving winner:", err));
            }
        }, 100);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">
                <div className="flex space-x-4">
                    <button
                        onClick={() => setActiveView('raffle')}
                        className={`flex items-center gap-2 px-4 py-2 font-bold rounded-lg transition-colors ${activeView === 'raffle' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                    >
                        <Gift size={20} />
                        Sorteio Semanal
                    </button>
                    <button
                        onClick={() => setActiveView('bolao')}
                        className={`flex items-center gap-2 px-4 py-2 font-bold rounded-lg transition-colors ${activeView === 'bolao' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                    >
                        <Trophy size={20} />
                        Bolão da Copa
                    </button>
                </div>
            </div>

            {activeView === 'raffle' && (
                <>

            {/* Configuration Card */}
            {/* Configuration Card */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                            <Calendar size={20} className="text-gray-500" />
                            Configuração do Sorteio
                        </h3>
                        <button
                            onClick={handleSaveSettings}
                            disabled={loading}
                            className={`px-4 py-1.5 text-sm font-bold rounded-lg transition-colors disabled:opacity-50 ${showSuccess ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
                        >
                            {loading ? 'Salvando...' : showSuccess ? 'Salvo Sucesso!' : 'Salvar Config'}
                        </button>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data e Hora do Sorteio</label>
                            <input
                                type="datetime-local"
                                value={localSettings.raffleDrawDate}
                                onChange={(e) => setLocalSettings(prev => ({ ...prev, raffleDrawDate: e.target.value }))}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                            />
                        </div>
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor do Prêmio (R$)</label>
                                <input
                                    type="number"
                                    value={localSettings.rafflePrizeValue}
                                    onChange={(e) => setLocalSettings(prev => ({ ...prev, rafflePrizeValue: parseFloat(e.target.value) }))}
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                                />
                            </div>
                            <div className="flex items-end pb-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={localSettings.isRaffleEnabled}
                                        onChange={(e) => setLocalSettings(prev => ({ ...prev, isRaffleEnabled: e.target.checked }))}
                                        className="h-5 w-5 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                                    />
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Ativar Sorteio</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
                        <Search size={20} className="text-gray-500" />
                        Buscar Participantes (Manual)
                    </h3>
                    <div className="flex flex-col gap-4">
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">De</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={e => setStartDate(e.target.value)}
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Até</label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={e => setEndDate(e.target.value)}
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                                />
                            </div>
                        </div>
                        <button
                            onClick={handleSearch}
                            disabled={loading || isRaffling}
                            className="w-full px-6 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
                        >
                            <Search size={20} />
                            Buscar Participantes
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Action Area */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Participants List */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 h-96 flex flex-col">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
                        <Users size={20} className="text-blue-500" />
                        Participantes ({eligibleCustomers.length})
                    </h3>
                    <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {eligibleCustomers.length > 0 ? (
                            eligibleCustomers.map((customer, index) => (
                                <div key={index} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                    <span className="font-medium text-gray-700 dark:text-gray-200">{customer.name}</span>
                                    <span className="text-sm text-gray-500 dark:text-gray-400">{customer.phone}</span>
                                </div>
                            ))
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                <Users size={48} className="mb-2 opacity-20" />
                                <p>Nenhum participante encontrado.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Draw Area */}
                <div className="bg-gradient-to-br from-purple-600 to-indigo-700 p-8 rounded-xl shadow-lg text-white flex flex-col items-center justify-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>

                    <div className="z-10 text-center w-full">
                        <div className="w-24 h-24 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl">
                            <Gift size={48} className="text-white" />
                        </div>

                        {raffleWinner ? (
                            <div className="animate-in zoom-in duration-500 mb-8">
                                <p className="text-purple-200 text-sm font-bold uppercase tracking-wider mb-2">Vencedor(a)</p>
                                <h3 className="text-3xl font-bold mb-1">{raffleWinner.name}</h3>
                                <p className="text-purple-200">{raffleWinner.phone}</p>
                            </div>
                        ) : (
                            <div className="mb-8 min-h-[100px] flex items-center justify-center">
                                <p className="text-purple-200 text-lg">
                                    {eligibleCustomers.length > 0
                                        ? "Pronto para sortear!"
                                        : "Busque participantes para começar."}
                                </p>
                            </div>
                        )}

                        <button
                            onClick={executeRaffle}
                            disabled={isRaffling || eligibleCustomers.length === 0}
                            className="w-full py-4 bg-white text-purple-600 rounded-xl font-bold text-xl hover:bg-purple-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                        >
                            {isRaffling ? 'Sorteando...' : 'Realizar Sorteio'}
                        </button>

                        {settings.rafflePrizeValue && (
                            <p className="mt-4 text-sm text-purple-200">
                                Prêmio: Vale Compras de R$ {settings.rafflePrizeValue.toFixed(2)}
                            </p>
                        )}
                    </div>
                </div>
            </div>
            </>
            )}

            {activeView === 'bolao' && (
                <div className="space-y-6">
                    {/* Settings and Apurar Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Configuração do Bolão */}
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                                    <Clock size={20} className="text-gray-500" />
                                    Horários do Bolão
                                </h3>
                                <button
                                    onClick={handleSaveSettings}
                                    disabled={loading}
                                    className={`px-4 py-1.5 text-sm font-bold rounded-lg transition-colors disabled:opacity-50 ${showSuccess ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-yellow-500 text-white hover:bg-yellow-600'}`}
                                >
                                    {loading ? 'Salvando...' : showSuccess ? 'Salvo Sucesso!' : 'Salvar Horários'}
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Abre para palpites</label>
                                        <input
                                            type="datetime-local"
                                            value={localSettings.bolaoStartTime}
                                            onChange={(e) => setLocalSettings(prev => ({ ...prev, bolaoStartTime: e.target.value }))}
                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-yellow-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Encerra os palpites</label>
                                        <input
                                            type="datetime-local"
                                            value={localSettings.bolaoEndTime}
                                            onChange={(e) => setLocalSettings(prev => ({ ...prev, bolaoEndTime: e.target.value }))}
                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-yellow-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                                        />
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Dica: Defina o encerramento para 1 hora antes do início do jogo.</p>
                            </div>
                        </div>

                        {/* Apurar Vencedor */}
                        <div className="bg-gradient-to-br from-green-700 to-yellow-600 p-6 rounded-xl shadow-sm border border-yellow-500 text-white relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-400/20 rounded-full filter blur-[30px]"></div>
                            <h3 className="text-lg font-bold mb-4 relative z-10 flex items-center gap-2 drop-shadow-md">
                                <Trophy size={20} />
                                Encerrar Bolão e Apurar Vencedor
                            </h3>
                            
                            <div className="flex items-center gap-4 relative z-10 mb-4">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold uppercase tracking-wider mb-1">Brasil 🇧🇷</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={bolaoResult.brazil}
                                        onChange={e => setBolaoResult({...bolaoResult, brazil: e.target.value})}
                                        className="w-full text-center text-xl font-bold bg-black/40 border border-white/30 rounded-lg py-2 focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                                    />
                                </div>
                                <span className="text-xl font-black text-white/50 pt-5">X</span>
                                <div className="flex-1">
                                    <label className="block text-xs font-bold uppercase tracking-wider mb-1">Marrocos 🇲🇦</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={bolaoResult.opponent}
                                        onChange={e => setBolaoResult({...bolaoResult, opponent: e.target.value})}
                                        className="w-full text-center text-xl font-bold bg-black/40 border border-white/30 rounded-lg py-2 focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                                    />
                                </div>
                            </div>
                            
                            <button
                                onClick={handleApurarVencedor}
                                className="w-full py-2 bg-yellow-400 hover:bg-yellow-300 text-black font-bold rounded-lg uppercase tracking-wider transition-colors relative z-10"
                            >
                                Apurar Vencedor
                            </button>

                            {bolaoWinnerStatus && (
                                <div className="mt-4 p-3 bg-black/30 rounded-lg border border-white/20 relative z-10 animate-fade-in text-center">
                                    <p className="text-sm font-medium">{bolaoWinnerStatus}</p>
                                    {bolaoWinner && (
                                        <div className="mt-2">
                                            <p className="text-xl font-bold text-yellow-300">{bolaoWinner.customerName}</p>
                                            <p className="text-sm">{bolaoWinner.phone}</p>
                                            <button
                                                onClick={handleNotificarVencedor}
                                                className="mt-3 w-full py-2 bg-green-500 hover:bg-green-400 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                                            >
                                                Notificar no WhatsApp
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Table */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                                <Trophy className="text-yellow-500" />
                                Palpites Registrados ({bolaoGuesses.length})
                            </h3>
                            <button
                                onClick={loadBolaoGuesses}
                                disabled={bolaoLoading}
                                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                {bolaoLoading ? 'Atualizando...' : 'Atualizar Lista'}
                            </button>
                        </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
                                    <th className="py-3 px-4 font-semibold">Cliente</th>
                                    <th className="py-3 px-4 font-semibold">Telefone</th>
                                    <th className="py-3 px-4 font-semibold text-center">Palpite</th>
                                    <th className="py-3 px-4 font-semibold text-right">Data/Hora</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bolaoGuesses.length > 0 ? (
                                    bolaoGuesses.map((guess, idx) => (
                                        <tr key={idx} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                            <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">
                                                {guess.customerName}
                                            </td>
                                            <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                                                {guess.phone}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <span className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 rounded-full font-bold text-lg">
                                                    🇧🇷 {guess.brazil_score} x {guess.opponent_score} 🇲🇦
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-right text-sm text-gray-500 dark:text-gray-400 flex items-center justify-end gap-1">
                                                <Clock size={14} />
                                                {new Date(guess.created_at).toLocaleString('pt-BR')}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={4} className="py-8 text-center text-gray-500">
                                            {bolaoLoading ? 'Carregando palpites...' : 'Nenhum palpite registrado ainda.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                </div>
            )}
        </div>
    );
};

export default RaffleTab;
