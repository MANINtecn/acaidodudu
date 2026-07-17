import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { MenuItem, Category, Addon } from '../types';
import { uploadMenuImage } from '../services/supabaseService';

interface MenuItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (item: Partial<MenuItem>) => Promise<void>;
    initialData?: MenuItem;
    categories: Category[];
    storeId: string;
    addons: Addon[];
    defaultCategoryId?: number;
}

export const MenuItemModal: React.FC<MenuItemModalProps> = ({
    isOpen,
    onClose,
    onSave,
    initialData,
    categories,
    storeId,
    addons,
    defaultCategoryId
}) => {
    const [formData, setFormData] = useState<Partial<MenuItem>>({
        name: '',
        description: '',
        price: 0,
        categoryId: 0,
        isAvailable: true,
        image: '',
        allowedAddons: []
    });
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen) return; // Só processa se o modal estiver abrindo

        if (initialData) {
            setFormData({
                ...initialData,
                allowedAddons: initialData.allowedAddons || []
            });
        } else {
            setFormData({
                name: '',
                description: '',
                price: 0,
                categoryId: defaultCategoryId ?? (categories.length > 0 ? categories[0].id : 0),
                isAvailable: true,
                image: '',
                allowedAddons: []
            });
        }
    }, [initialData, isOpen, defaultCategoryId]); // Removi 'categories' da dependência para evitar reset no polling

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'price' ? parseFloat(value) : name === 'categoryId' ? parseInt(value) : value
        }));
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setImageFile(e.target.files[0]);
        }
    };

    const handleAddonToggle = (addonId: string) => {
        setFormData(prev => {
            const currentAddons = prev.allowedAddons || [];
            if (currentAddons.includes(addonId)) {
                return { ...prev, allowedAddons: currentAddons.filter(id => id !== addonId) };
            } else {
                return { ...prev, allowedAddons: [...currentAddons, addonId] };
            }
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            let imageUrl = formData.image;

            if (imageFile) {
                const uploadedUrl = await uploadMenuImage(imageFile, storeId);
                if (uploadedUrl) {
                    imageUrl = uploadedUrl;
                }
            }

            await onSave({
                ...formData,
                image: imageUrl,
                store_id: storeId
            });
            onClose();
        } catch (error) {
            console.error("Error saving item:", error);
            alert("Erro ao salvar item");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
            <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-2xl p-6 relative my-8">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                    <X size={24} />
                </button>
                <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{initialData ? 'Editar Item' : 'Novo Item'}</h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome</label>
                            <input
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
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
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição</label>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            rows={3}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Categoria</label>
                            <select
                                name="categoryId"
                                value={formData.categoryId}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                required
                            >
                                <option value="">Selecione uma categoria</option>
                                {categories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Imagem</label>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageChange}
                                className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100 dark:file:bg-red-900/30 dark:file:text-red-400"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Adicionais Permitidos</label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-2 border rounded-lg dark:border-gray-600">
                            {addons.map(addon => (
                                <label key={addon.id} className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={(formData.allowedAddons || []).includes(addon.id)}
                                        onChange={() => handleAddonToggle(addon.id)}
                                        className="rounded text-red-600 focus:ring-red-500 dark:bg-gray-700 dark:border-gray-600"
                                    />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">{addon.name} (+R$ {addon.price.toFixed(2)})</span>
                                </label>
                            ))}
                            {addons.length === 0 && <span className="text-sm text-gray-500">Nenhum adicional cadastrado.</span>}
                        </div>
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
                            Disponível para venda
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
