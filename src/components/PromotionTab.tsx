import React, { useState } from 'react';
import { Plus, Edit, Trash2, Eye, EyeOff, ImageIcon, X } from 'lucide-react';
import { Promotion } from '../types';

interface PromotionTabProps {
    promotions: Promotion[];
    onCreate: (p: Omit<Promotion, 'id'>) => Promise<void>;
    onUpdate: (id: string | number, p: Partial<Promotion>) => Promise<void>;
    onDelete: (id: string | number) => Promise<void>;
}

const EMPTY_FORM: Partial<Promotion> = { name: '', description: '', price: 0, image: '', isActive: true };

export const PromotionTab: React.FC<PromotionTabProps> = ({ promotions, onCreate, onUpdate, onDelete }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPromo, setEditingPromo] = useState<Promotion | undefined>(undefined);
    const [formData, setFormData] = useState<Partial<Promotion>>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editingPromo) {
                const { id, ...updates } = formData as any;
                await onUpdate(editingPromo.id, updates);
            } else {
                await onCreate(formData as Omit<Promotion, 'id'>);
            }
            closeModal();
        } finally {
            setSaving(false);
        }
    };

    const openModal = (promo?: Promotion) => {
        setEditingPromo(promo);
        setFormData(promo ? { ...promo } : { ...EMPTY_FORM });
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingPromo(undefined);
        setFormData({ ...EMPTY_FORM });
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
                    <div key={promo.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
                        {/* Image */}
                        {promo.image ? (
                            <div className="h-40 bg-gray-100 dark:bg-gray-700 overflow-hidden flex items-center justify-center">
                                <img src={promo.image} alt={promo.name} className="w-full h-full object-contain p-2" />
                            </div>
                        ) : (
                            <div className="h-28 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center">
                                <ImageIcon size={36} className="text-gray-300 dark:text-gray-500" />
                            </div>
                        )}

                        <div className="p-4 flex flex-col flex-1">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-bold text-base text-gray-900 dark:text-gray-100 leading-tight">{promo.name}</h3>
                                <div className="flex gap-1 shrink-0 ml-2">
                                    <button
                                        onClick={() => onUpdate(promo.id, { isActive: !promo.isActive })}
                                        className={`p-1.5 rounded transition-colors ${promo.isActive ? 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20' : 'text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                                        title={promo.isActive ? 'Desativar' : 'Ativar'}
                                    >
                                        {promo.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
                                    </button>
                                    <button onClick={() => openModal(promo)} className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded">
                                        <Edit size={16} />
                                    </button>
                                    <button onClick={() => onDelete(promo.id)} className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                            <p className="text-gray-500 dark:text-gray-400 text-sm mb-3 line-clamp-2 flex-1">{promo.description}</p>
                            <div className="flex justify-between items-center">
                                <span className="text-xl font-bold text-red-600 dark:text-red-500">R$ {promo.price.toFixed(2)}</span>
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${promo.isActive ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                                    {promo.isActive ? 'Ativa' : 'Inativa'}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                {editingPromo ? 'Editar Promoção' : 'Nova Promoção'}
                            </h3>
                            <button onClick={closeModal} className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Image Preview */}
                            {formData.image && (
                                <div className="w-full h-36 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center border border-gray-200 dark:border-gray-600">
                                    <img
                                        src={formData.image}
                                        alt="Preview"
                                        className="max-h-full max-w-full object-contain"
                                        onError={(e) => (e.currentTarget.style.display = 'none')}
                                    />
                                </div>
                            )}

                            {/* Image URL */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                                    <ImageIcon size={14} /> URL da Foto
                                </label>
                                <input
                                    type="url"
                                    value={formData.image || ''}
                                    onChange={e => setFormData({ ...formData, image: e.target.value })}
                                    placeholder="https://exemplo.com/foto-do-produto.jpg"
                                    className="w-full px-4 py-2 border rounded-lg text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-red-500 focus:outline-none"
                                />
                                <p className="text-xs text-gray-400 mt-1">Cole a URL direta da imagem (jpg, png, webp)</p>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Nome da Promoção *</label>
                                <input
                                    type="text"
                                    value={formData.name || ''}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-2 border rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-red-500 focus:outline-none"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Descrição</label>
                                <textarea
                                    value={formData.description || ''}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full px-4 py-2 border rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-red-500 focus:outline-none"
                                    rows={2}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Preço (R$) *</label>
                                <input
                                    type="number"
                                    value={formData.price ?? 0}
                                    onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                                    className="w-full px-4 py-2 border rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-red-500 focus:outline-none"
                                    step="0.01"
                                    required
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="isActive"
                                    checked={formData.isActive ?? true}
                                    onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                                    className="h-4 w-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                                />
                                <label htmlFor="isActive" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Promoção ativa (aparece no carrossel do cardápio)
                                </label>
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors font-medium">
                                    Cancelar
                                </button>
                                <button type="submit" disabled={saving} className="px-6 py-2 bg-red-600 dark:bg-red-700 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-800 transition-colors font-bold disabled:opacity-60">
                                    {saving ? 'Salvando...' : 'Salvar Promoção'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
