import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Trash2, Search, Plus } from 'lucide-react';
import { Order, MenuItem, Category } from '../types';
import { normalizeString } from '../utils/searchUtils';

interface EditOrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (order: Order) => Promise<void>;
    order: Order;
    menuItems: MenuItem[];
    categories: Category[];
}

export const EditOrderModal: React.FC<EditOrderModalProps> = ({ isOpen, onClose, onSave, order, menuItems, categories }) => {
    const [formData, setFormData] = useState<Order>(order);
    const [loading, setLoading] = useState(false);
    const [newItemName, setNewItemName] = useState('');
    const [newItemPrice, setNewItemPrice] = useState('');
    const [isAddingItem, setIsAddingItem] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearchingMenu, setIsSearchingMenu] = useState(false);

    useEffect(() => {
        setFormData(order);
    }, [order, isOpen]);

    const filteredMenuItems = useMemo(() => {
        if (!searchTerm) return [];
        const normalizedSearch = normalizeString(searchTerm);
        return menuItems.filter(item => 
            normalizeString(item.name).includes(normalizedSearch) ||
            normalizeString(categories.find(c => c.id === item.categoryId)?.name || '').includes(normalizedSearch)
        );
    }, [menuItems, categories, searchTerm]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleAddItem = (item?: MenuItem) => {
        let newItem: any;

        if (item) {
            // Adding from Menu
            newItem = {
                id: -Date.now(),
                cartId: `menu-${item.id}-${Date.now()}`,
                name: item.name,
                price: item.price,
                quantity: 1,
                notes: '',
                selectedAddons: [],
                isCombo: item.isCombo || false,
                categoryId: item.categoryId,
                store_id: order.store_id
            };
        } else {
            // Adding Custom Item
            if (!newItemName || !newItemPrice) return;
            const price = parseFloat(newItemPrice.replace(',', '.'));
            if (isNaN(price)) return;

            newItem = {
                id: -Date.now(),
                cartId: `custom-${Date.now()}`,
                name: newItemName,
                price: price,
                quantity: 1,
                notes: 'Item Avulso adicionado na edição',
                selectedAddons: [],
                isCombo: false,
                categoryId: -1,
                store_id: order.store_id
            };
        }

        setFormData((prev: Order) => {
            const newItems = [...(prev.items || []), newItem];
            const itemsTotal = newItems.reduce((sum: number, i: any) => {
                const addonsPrice = i.selectedAddons?.reduce((acc: number, a: any) => acc + (a.price || 0), 0) || 0;
                return sum + ((i.price + addonsPrice) * i.quantity);
            }, 0);
            const newTotal = itemsTotal + (prev.deliveryFee || 0);
            return {
                ...prev,
                items: newItems,
                total: newTotal
            };
        });

        if (!item) {
            setNewItemName('');
            setNewItemPrice('');
            setIsAddingItem(false);
        } else {
            setSearchTerm('');
            setIsSearchingMenu(false);
        }
    };

    const handleRemoveItem = (index: number) => {
        setFormData((prev: Order) => {
            const newItems = (prev.items || []).filter((_, i) => i !== index);
            const itemsTotal = newItems.reduce((sum: number, i: any) => {
                const addonsPrice = i.selectedAddons?.reduce((acc: number, a: any) => acc + (a.price || 0), 0) || 0;
                return sum + ((i.price + addonsPrice) * i.quantity);
            }, 0);
            const newTotal = itemsTotal + (prev.deliveryFee || 0);
            return {
                ...prev,
                items: newItems,
                total: newTotal
            };
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSave(formData);
            onClose();
        } catch (error) {
            console.error("Error updating order:", error);
            alert("Erro ao atualizar pedido");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                    <X size={24} />
                </button>
                <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Editar Pedido #{order.dailyOrderNumber}</h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cliente</label>
                            <input
                                type="text"
                                name="customerName"
                                value={formData.customerName}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Telefone</label>
                            <input
                                type="text"
                                name="phone"
                                value={formData.phone || ''}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            />
                        </div>
                    </div>

                    {/* Address (Conditional) */}
                    {formData.orderType === 'Entrega' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Endereço</label>
                                <input
                                    type="text"
                                    name="address"
                                    value={formData.address || ''}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ponto de Referência</label>
                                <input
                                    type="text"
                                    name="referencePoint"
                                    value={formData.referencePoint || ''}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                        </div>
                    )}

                    {/* Global Observation */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observação Geral do Pedido</label>
                        <textarea
                            name="observation"
                            value={formData.observation || ''}
                            onChange={handleChange}
                            rows={2}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                            placeholder="Ex: Entregar sem cebola, campainha estragada..."
                        />
                    </div>

                    {/* Items Section */}
                    <div className="border-t border-b border-gray-200 dark:border-gray-700 py-4 my-4">
                        <div className="flex justify-between items-center mb-2 gap-2">
                            <h3 className="font-bold text-gray-800 dark:text-gray-200">Itens do Pedido</h3>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => { setIsSearchingMenu(!isSearchingMenu); setIsAddingItem(false); }}
                                    className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-200 font-bold flex items-center gap-1"
                                >
                                    <Plus size={14} /> Cardápio
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setIsAddingItem(!isAddingItem); setIsSearchingMenu(false); }}
                                    className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-200 font-bold flex items-center gap-1"
                                >
                                    <Plus size={14} /> Avulso
                                </button>
                            </div>
                        </div>

                        {/* Search Menu Form */}
                        {isSearchingMenu && (
                            <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg mb-3">
                                <div className="relative mb-3">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Buscar no cardápio..."
                                        className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                                {searchTerm && (
                                    <div className="space-y-1 max-h-48 overflow-y-auto border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600">
                                        {filteredMenuItems.map(item => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => handleAddItem(item)}
                                                className="w-full text-left p-2 hover:bg-gray-50 dark:hover:bg-gray-700 border-b last:border-0 dark:border-gray-600 flex justify-between items-center"
                                            >
                                                <div>
                                                    <div className="text-sm font-bold text-gray-800 dark:text-gray-200">{item.name}</div>
                                                    <div className="text-xs text-gray-500">{categories.find(c => c.id === item.categoryId)?.name}</div>
                                                </div>
                                                <div className="text-sm font-bold text-red-600">R$ {item.price.toFixed(2)}</div>
                                            </button>
                                        ))}
                                        {filteredMenuItems.length === 0 && (
                                            <div className="p-4 text-center text-sm text-gray-500">Nenhum item encontrado</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Add Item Form */}
                        {isAddingItem && (
                            <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg mb-3 flex gap-2 items-end">
                                <div className="flex-1">
                                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Nome</label>
                                    <input
                                        type="text"
                                        value={newItemName}
                                        onChange={e => setNewItemName(e.target.value)}
                                        className="w-full p-2 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                        placeholder="Ex: Cigarro"
                                    />
                                </div>
                                <div className="w-24">
                                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Preço</label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={newItemPrice}
                                        onChange={e => setNewItemPrice(e.target.value)}
                                        className="w-full p-2 border rounded text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                        placeholder="0.00"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleAddItem()}
                                    className="p-2 bg-green-600 text-white rounded hover:bg-green-700"
                                >
                                    <Save size={18} />
                                </button>
                            </div>
                        )}

                        {/* List */}
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                            {formData.items.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 p-2 rounded">
                                    <div className="flex items-center gap-3 flex-1">
                                        <div className="text-sm">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-gray-800 dark:text-gray-200">{item.quantity}x {item.name}</span>
                                                {item.printed && (
                                                    <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">Impresso</span>
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-500">R$ {(item.price || 0).toFixed(2)}</div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveItem(idx)}
                                        className="text-red-500 hover:text-red-700 p-1"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="text-right mt-2 font-bold text-lg text-gray-800 dark:text-gray-100">
                            Total: R$ {formData.total ? formData.total.toFixed(2) : '0.00'}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                        <select
                            name="status"
                            value={formData.status}
                            onChange={handleChange}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        >
                            <option value="Novo">Novo</option>
                            <option value="Em Produção">Em Produção</option>
                            <option value="A Caminho">A Caminho</option>
                            <option value="No Portão">No Portão</option>
                            <option value="Entregue">Entregue</option>
                            <option value="Cancelado">Cancelado</option>
                            <option value="Conta Solicitada">Conta Solicitada</option>
                        </select>
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg dark:text-gray-300 dark:hover:bg-gray-700">Cancelar</button>
                        <button type="submit" disabled={loading} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                            <Save size={18} />
                            {loading ? 'Salvando...' : 'Salvar Alterações'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
