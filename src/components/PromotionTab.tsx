import React, { useState } from 'react';
import { Plus, Edit, Trash2, Eye, EyeOff } from 'lucide-react';
import { Promotion } from '../types';

interface PromotionTabProps {
    promotions: Promotion[];
    onCreate: (p: Omit<Promotion, 'id'>) => Promise<void>;
    onUpdate: (id: string | number, p: Partial<Promotion>) => Promise<void>;
    onDelete: (id: string | number) => Promise<void>;
}

export const PromotionTab: React.FC<PromotionTabProps> = ({ promotions, onCreate, onUpdate, onDelete }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPromo, setEditingPromo] = useState<Promotion | undefined>(undefined);
    const [formData, setFormData] = useState<Partial<Promotion>>({ name: '', description: '', price: 0, isActive: true });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (editingPromo) {
            const { id, ...updates } = formData as any;
            await onUpdate(editingPromo.id, updates);
        } else {
            await onCreate(formData as Omit<Promotion, 'id'>);
        }
        setIsModalOpen(false);
        setEditingPromo(undefined);
        setFormData({ name: '', description: '', price: 0, isActive: true });
    };

    const openModal = (promo?: Promotion) => {
        setEditingPromo(promo);
        setFormData(promo || { name: '', description: '', price: 0, isActive: true });
        setIsModalOpen(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Promoções</h2>
                <button onClick={() => openModal()} className="px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-800 font-medium flex items-center gap-2 transition-colors">
                    <Plus size={20} /> Nova Promoção
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {promotions.map(promo => (
                    <div key={promo.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">{promo.name}</h3>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => onUpdate(promo.id, { isActive: !promo.isActive })}
                                    className={`p-1 rounded transition-colors ${promo.isActive ? 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                                    title={promo.isActive ? "Desativar" : "Ativar"}
                                >
                                    {promo.isActive ? <Eye size={18} /> : <EyeOff size={18} />}
                                </button>
                                <button onClick={() => openModal(promo)} className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"><Edit size={18} /></button>
                                <button onClick={() => onDelete(promo.id)} className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"><Trash2 size={18} /></button>
                            </div>
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 mb-4 h-12 overflow-hidden">{promo.description}</p>
                        <div className="flex justify-between items-center">
                            <span className="text-2xl font-bold text-red-600 dark:text-red-500">R$ {promo.price.toFixed(2)}</span>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${promo.isActive ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'}`}>
                                {promo.isActive ? 'Ativa' : 'Inativa'}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full shadow-xl border border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">{editingPromo ? 'Editar Promoção' : 'Nova Promoção'}</h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome</label>
                                <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-2 border rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-red-500" required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição</label>
                                <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full px-4 py-2 border rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-red-500" rows={3} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Preço</label>
                                <input type="number" value={formData.price} onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) })} className="w-full px-4 py-2 border rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-red-500" step="0.01" required />
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="checkbox" checked={formData.isActive} onChange={e => setFormData({ ...formData, isActive: e.target.checked })} className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded" />
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Ativa</label>
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancelar</button>
                                <button type="submit" className="px-4 py-2 bg-red-600 dark:bg-red-700 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-800 transition-colors">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
