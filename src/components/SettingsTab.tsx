import React, { useState, useEffect } from 'react';
import {
    ImageIcon,
    Smartphone,
    Plus,
    Clock,
    Monitor,
    UtensilsCrossed,
    DollarSign,
    MessageSquare,
    Link,
    Settings as SettingsIcon,
    ExternalLink,
    Upload,
    CheckCheck
} from 'lucide-react';
import { Settings } from '../types';
import { uploadMenuImage } from '../services/supabaseService';
import { printOrder, generateReceiptText } from '../services/printerService';
import { UpdateManager } from './UpdateManager';

interface SettingsTabProps {
    settings: Settings;
    onSave: (s: Partial<Settings>) => Promise<void>;
    installPrompt: any;
    onInstall: () => void;
}



export const SettingsTab: React.FC<SettingsTabProps> = ({ settings, onSave, installPrompt, onInstall }) => {
    const [formData, setFormData] = useState(settings);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setFormData(settings);
    }, [settings]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'comboPrice' || name === 'appDiscountPercentage' || name === 'deliveryFee' ? parseFloat(value) : value
        }));
    };

    const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);

    useEffect(() => {
        const fetchPrinters = async () => {
            try {
                const res = await fetch('http://127.0.0.1:5050/printers');
                if (res.ok) {
                    const data = await res.json();
                    setAvailablePrinters(data.map((p: any) => p.Name));
                }
            } catch (error) {
                console.warn("Could not fetch printer list:", error);
            }
        };
        fetchPrinters();
    }, []);

    const handleTestPrint = async () => {
        const testOrder: any = {
            dailyOrderNumber: 0,
            customerName: "TESTE DE IMPRESSAO",
            phone: "(00) 00000-0000",
            address: "RUA DE TESTE, 123",
            orderType: "Entrega",
            paymentMethod: "PIX",
            status: "Novo",
            items: [{
                name: "PRODUTO DE TESTE",
                quantity: 1,
                price: 10.50,
                selectedAddons: [],
                notes: "OBSERVACAO DE TESTE"
            }],
            total: 10.50,
            timestamp: new Date().toISOString(),
            settings: formData
        };
        await onSave(formData); // Save first to ensure settings are current
        await printOrder(testOrder, true);
    };

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: checked
        }));
    };

    const toggleDay = (dayIndex: number) => {
        setFormData(prev => {
            const currentDays = prev.daysOfWeek || [];
            const newDays = currentDays.includes(dayIndex.toString())
                ? currentDays.filter(d => d !== dayIndex.toString())
                : [...currentDays, dayIndex.toString()];
            return { ...prev, daysOfWeek: newDays };
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        await onSave(formData);
        setLoading(false);
    };

    return (
        <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">Configurações da Loja</h2>
            <form onSubmit={handleSubmit} className="space-y-6">


                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                        <ImageIcon size={20} className="text-red-600 dark:text-red-500" /> Identidade Visual
                    </h3>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Logo da Loja</label>
                        <div className="flex items-center gap-4">
                            {formData.logoUrl && (
                                <img src={formData.logoUrl} alt="Logo" className="w-16 h-16 object-contain rounded-lg bg-gray-100" />
                            )}
                            <label className="cursor-pointer bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
                                <Upload size={20} />
                                {loading ? 'Enviando...' : 'Escolher Logo'}
                                <input type="file" accept="image/*" onChange={async (e) => {
                                    if (e.target.files && e.target.files[0]) {
                                        setLoading(true);
                                        try {
                                            const url = await uploadMenuImage(e.target.files[0], settings.store_id || 'general');
                                            if (url) setFormData(prev => ({ ...prev, logoUrl: url }));
                                        } catch (error) {
                                            console.error(error);
                                            alert('Erro ao enviar logo');
                                        } finally {
                                            setLoading(false);
                                        }
                                    }
                                }} className="hidden" disabled={loading} />
                            </label>
                        </div>
                    </div>
                </div>

                {/* PWA Installation */}
                <div className="bg-gradient-to-r from-orange-500 to-red-600 p-6 rounded-lg shadow-md text-white">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
                                <Smartphone size={32} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold">Instalar Aplicativo</h3>
                                <p className="text-white/80 text-sm max-w-sm">
                                    Adicione o Açaí do Dudu à sua tela de início para acesso rápido e uma experiência em tela cheia (estilo App).
                                </p>
                            </div>
                        </div>
                        {installPrompt ? (
                            <button
                                type="button"
                                onClick={onInstall}
                                className="px-8 py-4 bg-white text-orange-600 rounded-xl font-black shadow-lg hover:bg-orange-50 transition-all transform hover:scale-105 flex items-center gap-2 whitespace-nowrap"
                            >
                                <Plus size={20} /> INSTALAR AGORA
                            </button>
                        ) : (
                            <div className="px-6 py-3 bg-white/10 rounded-lg text-sm font-medium border border-white/20 italic">
                                Aplicativo já instalado ou não suportado neste navegador.
                            </div>
                        )}
                    </div>
                </div>

                {/* Atualização de Software */}
                <UpdateManager />

                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                        <Monitor size={20} className="text-purple-600 dark:text-purple-500" /> Interface do Cliente (Cardápio)
                    </h3>
                    
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wider text-[10px] font-black">Versão do Cardápio</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, storefrontTheme: 'classic' })}
                                className={`relative p-4 rounded-xl border-2 text-left transition-all overflow-hidden ${
                                    (!formData.storefrontTheme || formData.storefrontTheme === 'classic')
                                    ? 'bg-purple-50 border-purple-600 dark:bg-purple-900/20 shadow-md' 
                                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                }`}
                            >
                                <div className="font-bold text-gray-900 dark:text-gray-100 mb-1">Versão Clássica</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">O layout original com carrossel superior e lista de produtos abaixo.</div>
                                {(!formData.storefrontTheme || formData.storefrontTheme === 'classic') && (
                                    <div className="absolute top-3 right-3 text-purple-600 dark:text-purple-400">
                                        <CheckCheck size={20} />
                                    </div>
                                )}
                            </button>
                            
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, storefrontTheme: 'modern' })}
                                className={`relative p-4 rounded-xl border-2 text-left transition-all overflow-hidden ${
                                    formData.storefrontTheme === 'modern'
                                    ? 'bg-purple-50 border-purple-600 dark:bg-purple-900/20 shadow-md' 
                                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                }`}
                            >
                                <div className="absolute top-0 right-0 bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-bl-lg">NOVO</div>
                                <div className="font-bold text-gray-900 dark:text-gray-100 mb-1">Versão Moderna</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Novo layout focado em mobile, imagens grandes e navegação aprimorada.</div>
                                {formData.storefrontTheme === 'modern' && (
                                    <div className="absolute top-3 right-3 text-purple-600 dark:text-purple-400 mt-2">
                                        <CheckCheck size={20} />
                                    </div>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                        <Clock size={20} className="text-red-600 dark:text-red-500" /> Horário e Dias de Funcionamento
                    </h3>
                    
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wider text-[10px] font-black">Dias de Funcionamento</label>
                        <div className="flex flex-wrap gap-2">
                            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map((day, idx) => {
                                const isSelected = formData.daysOfWeek?.includes(idx.toString());
                                return (
                                    <button
                                        key={day}
                                        type="button"
                                        onClick={() => toggleDay(idx)}
                                        className={`flex-1 min-w-[60px] py-3 rounded-xl border-2 font-black text-xs transition-all ${
                                            isSelected 
                                            ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-600/20 active:scale-95' 
                                            : 'bg-gray-100 dark:bg-gray-700 border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300'
                                        }`}
                                    >
                                        {day.toUpperCase()}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-[10px] text-gray-500 mt-2 italic">* Apenas os dias selecionados permitirão pedidos no cardápio.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Abertura</label>
                            <input
                                type="time"
                                name="openingTime"
                                value={formData.openingTime}
                                onChange={handleChange}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 font-bold"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fechamento</label>
                            <input
                                type="time"
                                name="closingTime"
                                value={formData.closingTime}
                                onChange={handleChange}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 font-bold"
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-orange-200 dark:border-orange-900/30">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                        <Monitor size={20} className="text-orange-600 dark:text-orange-500" /> Configurações de Impressão
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Impressora Preferencial</label>
                            <select
                                name="preferredPrinter"
                                value={formData.preferredPrinter || ''}
                                onChange={handleChange}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                            >
                                <option value="">Automático (Detectar)</option>
                                {availablePrinters.map(printer => (
                                    <option key={printer} value={printer}>{printer}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Largura do Papel</label>
                            <select
                                name="printerPaperWidth"
                                value={formData.printerPaperWidth || '58mm'}
                                onChange={handleChange}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                            >
                                <option value="58mm">58mm (Cupom Estreito)</option>
                                <option value="80mm">80mm (Cupom Largo)</option>
                            </select>
                        </div>
                        <div className="md:col-span-2 pt-2">
                            <button
                                type="button"
                                onClick={handleTestPrint}
                                className="flex items-center justify-center gap-2 w-full py-2 bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 font-bold rounded-lg border border-orange-200 dark:border-orange-900/40 hover:bg-orange-200 dark:hover:bg-orange-900/40 transition-colors"
                            >
                                <div className="p-1 bg-white dark:bg-gray-800 rounded shadow-sm">
                                    <UtensilsCrossed size={14} />
                                </div>
                                TESTE DE IMPRESSÃO
                            </button>
                            <p className="text-[10px] text-gray-500 mt-2 text-center">
                                * Certifique-se de que o Servidor de Impressão (Electron) está aberto.
                            </p>
                        </div>

                        {/* Live Receipt Preview */}
                        <div className="md:col-span-1">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                                <Monitor size={14} /> Prévia da Comanda (Tempo Real)
                            </label>
                            <div className="relative group">
                                <div className="absolute inset-0 bg-gray-900/10 dark:bg-black/20 rounded-lg blur-sm group-hover:blur-md transition-all"></div>
                                <div 
                                    className={`relative bg-[#fdfdfd] dark:bg-gray-950 p-4 border border-gray-200 dark:border-gray-800 shadow-inner overflow-hidden mx-auto transition-all`}
                                    style={{ 
                                        width: formData.printerPaperWidth === '80mm' ? '100%' : '85%',
                                        maxWidth: formData.printerPaperWidth === '80mm' ? '380px' : '280px',
                                        minHeight: '400px'
                                    }}
                                >
                                    {/* Paper Texture/Edge Effect */}
                                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-b from-gray-200/50 to-transparent"></div>
                                    <div className="absolute bottom-0 left-0 right-0 h-4 bg-[radial-gradient(circle,transparent_40%,#eee_41%,#eee_100%)] bg-[length:12px_8px] repeat-x"></div>
                                    
                                    <pre className="text-[11px] leading-[1.2] font-mono whitespace-pre text-gray-800 dark:text-gray-300 overflow-x-auto scrollbar-hide">
                                        {(() => {
                                            const testOrder: any = {
                                                dailyOrderNumber: 123,
                                                customerName: "CLIENTE EXEMPLO",
                                                phone: "(11) 98765-4321",
                                                address: "RUA DAS PALMEIRAS, 100 - CENTRO",
                                                orderType: "Entrega",
                                                paymentMethod: "PIX",
                                                status: "Novo",
                                                items: [{
                                                    name: "X-BURGER ARTESANAL",
                                                    quantity: 2,
                                                    price: 25.00,
                                                    selectedAddons: [{ name: "BACON EXTRA" }],
                                                    notes: "SEM CEBOLA POR FAVOR"
                                                }],
                                                total: 50.00,
                                                timestamp: new Date().toISOString()
                                            };
                                            try {
                                                const previewSettings = {
                                                    ...formData,
                                                    // Pass the actual width from the dropdown to the generator
                                                    printerPaperWidth: formData.printerPaperWidth || '58mm'
                                                };
                                                return generateReceiptText(testOrder, previewSettings);
                                            } catch (e) {
                                                return "ERRO AO GERAR PRÉVIA";
                                            }
                                        })()}
                                    </pre>
                                </div>
                            </div>
                        </div>
                        <div className="md:col-span-2 pt-2 border-t border-gray-100 dark:border-gray-700 mt-2">
                             <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    name="printerCompatibilityMode"
                                    id="printerCompatibilityMode"
                                    checked={formData.printerCompatibilityMode || false}
                                    onChange={handleCheckboxChange}
                                    className="h-5 w-5 rounded text-orange-600 focus:ring-orange-500 border-gray-300 dark:bg-gray-700 dark:border-gray-600"
                                />
                                <div>
                                    <label htmlFor="printerCompatibilityMode" className="text-sm font-bold text-gray-900 dark:text-gray-100 cursor-pointer">
                                        Modo de Compatibilidade (Ligar se houver erro no Windows)
                                    </label>
                                    <p className="text-[10px] text-gray-500">
                                        Simplifica os comandos de impressão para evitar conflitos com drivers manuais ou impressoras bluetooth.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Kitchen Printer Section */}
                        <div className="md:col-span-2 pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
                            <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                                <span className="p-1 bg-orange-100 dark:bg-orange-900/40 rounded text-orange-600 dark:text-orange-400">
                                    <UtensilsCrossed size={14} />
                                </span>
                                Impressora Secundária (Cozinha)
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Impressora da Cozinha</label>
                                    <select
                                        name="kitchenPrinter"
                                        value={formData.kitchenPrinter || ''}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                                    >
                                        <option value="">Nenhuma (Desativado)</option>
                                        {availablePrinters.map(printer => (
                                            <option key={printer} value={printer}>{printer}</option>
                                        ))}
                                    </select>
                                    <p className="text-[10px] text-gray-500 mt-1">
                                        Selecione a impressora da cozinha (ex: Diebold de Rede). Ela deve estar instalada no Windows.
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Largura do Papel (Cozinha)</label>
                                    <select
                                        name="kitchenPrinterPaperWidth"
                                        value={formData.kitchenPrinterPaperWidth || '58mm'}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                                    >
                                        <option value="58mm">58mm</option>
                                        <option value="80mm">80mm</option>
                                    </select>
                                </div>
                                </div>
                        </div>

                        {/* Bar Printer Section */}
                        <div className="md:col-span-2 pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
                            <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                                <span className="p-1 bg-orange-100 dark:bg-orange-900/40 rounded text-orange-600 dark:text-orange-400">
                                    <UtensilsCrossed size={14} />
                                </span>
                                Impressora do Bar / Balcão
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Impressora do Bar / Balcão</label>
                                    <select
                                        name="barPrinter"
                                        value={formData.barPrinter || ''}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                                    >
                                        <option value="">Nenhuma (Desativado)</option>
                                        {availablePrinters.map(printer => (
                                            <option key={printer} value={printer}>{printer}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Largura do Papel (Bar)</label>
                                    <select
                                        name="barPrinterPaperWidth"
                                        value={formData.barPrinterPaperWidth || '58mm'}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                                    >
                                        <option value="58mm">58mm</option>
                                        <option value="80mm">80mm</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                         {/* Courier Printer Section */}
                         <div className="md:col-span-2 pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
                            <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                                <span className="p-1 bg-orange-100 dark:bg-orange-900/40 rounded text-orange-600 dark:text-orange-400">
                                    <Smartphone size={14} />
                                </span>
                                Impressora de Motoboys (Entrega)
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Impressora de Motoboys</label>
                                    <select
                                        name="courierPrinter"
                                        value={formData.courierPrinter || ''}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                                    >
                                        <option value="">Nenhuma (Desativado)</option>
                                        {availablePrinters.map(printer => (
                                            <option key={printer} value={printer}>{printer}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Largura do Papel (Motoboy)</label>
                                    <select
                                        name="courierPrinterPaperWidth"
                                        value={formData.courierPrinterPaperWidth || '58mm'}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                                    >
                                        <option value="58mm">58mm</option>
                                        <option value="80mm">80mm</option>
                                    </select>
                                </div>
                                </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                        <DollarSign size={20} className="text-red-600 dark:text-red-500" /> Preços e Descontos
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Preço do Combo (R$)</label>
                            <input
                                type="number"
                                name="comboPrice"
                                value={formData.comboPrice}
                                onChange={handleChange}
                                step="0.01"
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Taxa de Entrega (R$)</label>
                            <input
                                type="number"
                                name="deliveryFee"
                                value={formData.deliveryFee || 0}
                                onChange={handleChange}
                                step="0.50"
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Código de Segurança (Entregadores)</label>
                            <input
                                type="text"
                                name="courier_access_code"
                                value={formData.courier_access_code || ''}
                                onChange={handleChange}
                                placeholder="Ex: 123456"
                                maxLength={6}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Desconto App (%)</label>
                            <input
                                type="number"
                                name="appDiscountPercentage"
                                value={formData.appDiscountPercentage || 0}
                                onChange={handleChange}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    name="isAppDiscountEnabled"
                                    checked={formData.isAppDiscountEnabled || false}
                                    onChange={handleCheckboxChange}
                                    className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                                />
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Ativar Desconto no App</span>
                            </label>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                        <MessageSquare size={20} className="text-red-600 dark:text-red-500" /> Avaliações de Clientes
                    </h3>
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            name="isRatingEnabled"
                            checked={formData.isRatingEnabled || false}
                            onChange={handleCheckboxChange}
                            className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Habilitar coleta de avaliações após o pedido</span>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                        <Link size={20} className="text-red-600 dark:text-red-500" /> Links Úteis
                    </h3>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Módulo Garçom</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                readOnly
                                value={`${window.location.origin}/waiter`}
                                className="w-full px-4 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600"
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    navigator.clipboard.writeText(`${window.location.origin}/waiter`);
                                    alert('Link copiado!');
                                }}
                                className="bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-100 px-4 py-2 rounded-lg font-bold transition-colors"
                            >
                                Copiar
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Envie este link para seus garçons acessarem o módulo de pedidos.</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                        <SettingsIcon size={20} className="text-red-600 dark:text-red-500" /> Status da Loja
                    </h3>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Controle Manual (Loja Aberta/Fechada)</label>
                        <select
                            name="manualStatus"
                            value={formData.manualStatus}
                            onChange={handleChange}
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                        >
                            <option value="auto">Automático (Baseado no Horário)</option>
                            <option value="open">Sempre Aberto</option>
                            <option value="closed">Sempre Fechado</option>
                        </select>
                    </div>
                </div>



                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                        <ExternalLink size={20} className="text-red-600 dark:text-red-500" /> Webhooks
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Novo Pedido</label>
                            <input
                                type="url"
                                name="webhookNewOrderUrl"
                                value={formData.webhookNewOrderUrl || ''}
                                onChange={handleChange}
                                placeholder="https://..."
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Em Produção</label>
                            <input
                                type="url"
                                name="webhookInProductionUrl"
                                value={formData.webhookInProductionUrl || ''}
                                onChange={handleChange}
                                placeholder="https://..."
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Saiu para Entrega</label>
                            <input
                                type="url"
                                name="webhookOutForDeliveryUrl"
                                value={formData.webhookOutForDeliveryUrl || ''}
                                onChange={handleChange}
                                placeholder="https://..."
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Entregue</label>
                            <input
                                type="url"
                                name="webhookArrivedAtDoorUrl"
                                value={formData.webhookArrivedAtDoorUrl || ''}
                                onChange={handleChange}
                                placeholder="https://..."
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={loading}
                        className="px-6 py-3 bg-red-600 dark:bg-red-700 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-800 font-bold disabled:opacity-50 transition-colors"
                    >
                        {loading ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                </div>
            </form>
        </div>
    );
};
