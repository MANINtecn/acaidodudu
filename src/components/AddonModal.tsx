import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Addon, Category } from '../types';

interface AddonModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (addon: Partial<Addon>) => Promise<void>;
    initialData?: Addon;
    storeId: string;
    categories: Category[];
}

export const AddonModal: React.FC<AddonModalProps> = ({
    isOpen,
    onClose,
    onSave,
    initialData,
    storeId,
    categories
}) => {
    const [formData, setFormData] = useState<Partial<Addon>>({
        name: '',
        price: 0,
        isAvailable: true,
        categoryId: undefined
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        if (initialData) {
            setFormData(initialData);
        } else {
            setFormData({
                name: '',
                price: 0,
                isAvailable: true,
                categoryId: undefined
            });
        }
    }, [initialData, isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'price' ? parseFloat(value) : name === 'categoryId' ? parseInt(value) : value
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSave({
                ...formData,
                store_id: storeId
            });
            onClose();
        } catch (error) {
            console.error("Error saving addon:", error);
            alert("Erro ao salvar adicional");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
            <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md p-6 relative my-8">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                    <X size={24} />
                </button>
                <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{initialData ? 'Editar Adicional' : 'Novo Adicional'}</h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome</label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            placeholder="Ex: Limão, Gelo, Bacon Extra"
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Preço (R$)</label>
                        <input
                            type="number"
                            name="price"
                            value={formData.price}
                            onChange={handleChange}
                            step="0.01"
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Categoria (Opcional)</label>
                        <select
                            name="categoryId"
                            value={formData.categoryId || ''}
                            onChange={(e) => setFormData(prev => ({ ...prev, categoryId: e.target.value ? parseInt(e.target.value) : undefined }))}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        >
                            <option value="">Todas as categorias</option>
                            {categories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Se selecionado, aparecerá apenas para itens desta categoria.</p>
                    </div>

                    <div className="flex items-center">
                        <input
                            type="checkbox"
                            id="isAvailable"
                            name="isAvailable"
                            checked={formData.isAvailable}
                            onChange={(e) => setFormData(prev => ({ ...prev, isAvailable: e.target.checked }))}
                            className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                        />
                        <label htmlFor="isAvailable" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                            Disponível
                        </label>
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg dark:text-gray-300 dark:hover:bg-gray-700">Cancelar</button>
                        <button type="submit" disabled={loading} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                            {loading ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
