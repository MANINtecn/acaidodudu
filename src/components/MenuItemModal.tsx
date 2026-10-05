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
            [name]: name === 'price' ? parseFloat(value)
                  : name === 'categoryId' ? parseInt(value)
                  // codigo vazio = sem codigo (undefined, nao NaN nem 0)
                  : name === 'codigo' ? (value === '' ? undefined : parseInt(value))
                  : value
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

        // Trava na origem: 1..30 sao mesas no atalho do balcao.
        const cod = (formData as any).codigo;
        if (cod !== undefined && cod !== null && cod !== '' && Number(cod) < 100) {
            alert('O código do produto deve ser 100 ou maior.\n\nOs números de 1 a 30 são usados para as mesas no atalho do balcão.');
            return;
        }

        // NCM errado faz a SEFAZ rejeitar a nota: confere na origem.
        const ncmDigitos = String(formData.ncm ?? '').replace(/\D/g, '');
        if (ncmDigitos && ncmDigitos.length !== 8) {
            alert('O NCM precisa ter exatamente 8 dígitos (ou ficar em branco).');
            return;
        }

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
                // Campos fiscais vazios viram null (limpam o valor antigo no banco).
                ncm: (ncmDigitos || null) as any,
                cest: (String(formData.cest ?? '').replace(/\D/g, '') || null) as any,
                cfopFiscal: (String(formData.cfopFiscal ?? '').replace(/\D/g, '') || null) as any,
                csosnFiscal: (String(formData.csosnFiscal ?? '').replace(/\D/g, '') || null) as any,
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
        // O fundo rola (overflow-y-auto) e o painel NÃO é centralizado na vertical:
        // com `flex items-center` um modal mais alto que a janela tinha o TOPO cortado
        // e inalcançável (os campos de dados fiscais deixaram o modal mais alto que a
        // tela -- print do Ikarus, 05/10/2026). Agora começa no topo e rola inteiro.
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
            <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-2xl lg:max-w-5xl p-6 relative mx-auto my-6">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                    <X size={24} />
                </button>
                <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{initialData ? 'Editar Item' : 'Novo Item'}</h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Desktop: 2 colunas (dados do produto | adicionais + dados fiscais) -- o modal cresce na HORIZONTAL em vez de ficar alto demais. Celular/janela estreita: uma coluna. */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
                    <div className="space-y-4">
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

                    {/* Código para lançamento rápido por teclado no balcão.
                        Mínimo 100: 1..30 são números de MESA no atalho. */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Código do Produto <span className="text-gray-400 font-normal">(atalho do balcão)</span>
                        </label>
                        <input
                            type="number"
                            name="codigo"
                            value={(formData as any).codigo ?? ''}
                            onChange={handleChange}
                            min={100}
                            step={1}
                            placeholder="Ex.: 101"
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                        <p className="text-[11px] text-gray-500 mt-1">
                            Opcional. No balcão, digitar este código e apertar ENTER adiciona o produto direto.
                            <strong> Use 100 ou mais</strong> — os números de 1 a 30 são as mesas.
                        </p>
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

                    <div className="flex items-start">
                        <input
                            type="checkbox"
                            id="somenteBalcao"
                            name="somenteBalcao"
                            checked={!!formData.somenteBalcao}
                            onChange={(e) => setFormData(prev => ({ ...prev, somenteBalcao: e.target.checked }))}
                            className="mt-0.5 h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                        />
                        <label htmlFor="somenteBalcao" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                            Só balcão/salão
                            <span className="block text-xs text-gray-500">Não aparece no cardápio do site (ex.: ADD3, ADD5).</span>
                        </label>
                    </div>

                    <div className="flex items-start">
                        <input
                            type="checkbox"
                            id="saboresComQuantidade"
                            name="saboresComQuantidade"
                            checked={!!formData.saboresComQuantidade}
                            onChange={(e) => setFormData(prev => ({ ...prev, saboresComQuantidade: e.target.checked }))}
                            className="mt-0.5 h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                        />
                        <label htmlFor="saboresComQuantidade" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                            Sabores com quantidade
                            <span className="block text-xs text-gray-500">No site, o cliente escolhe a quantidade de cada sabor (ex.: picolés).</span>
                        </label>
                    </div>
                    </div>
                    <div className="space-y-4">

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Adicionais Permitidos</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 lg:max-h-80 overflow-y-auto p-2 border rounded-lg dark:border-gray-600">
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

                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                        <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-1">Dados fiscais (NFC-e)</p>
                        <p className="text-xs text-gray-500 mb-3">
                            O <strong>NCM é obrigatório para emitir nota</strong>: sem ele a nota é rejeitada. CFOP e CSOSN em branco usam o padrão da loja.
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">NCM (8 dígitos)</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={8}
                                    value={formData.ncm ?? ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, ncm: e.target.value.replace(/\D/g, '').slice(0, 8) }))}
                                    placeholder="Ex: 21050010"
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">CEST (opcional)</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={7}
                                    value={formData.cest ?? ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, cest: e.target.value.replace(/\D/g, '').slice(0, 7) }))}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Unidade</label>
                                <select
                                    value={formData.unidadeFiscal ?? 'UN'}
                                    onChange={(e) => setFormData(prev => ({ ...prev, unidadeFiscal: e.target.value }))}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                >
                                    <option value="UN">UN (unidade)</option>
                                    <option value="KG">KG (peso)</option>
                                    <option value="L">L (litro)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">CFOP (opcional)</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={4}
                                    value={formData.cfopFiscal ?? ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, cfopFiscal: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                                    placeholder="Ex: 5102"
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">CSOSN (opcional)</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={3}
                                    value={formData.csosnFiscal ?? ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, csosnFiscal: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
                                    placeholder="Ex: 102"
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Origem</label>
                                <select
                                    value={formData.origemFiscal ?? 0}
                                    onChange={(e) => setFormData(prev => ({ ...prev, origemFiscal: parseInt(e.target.value) }))}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                >
                                    <option value={0}>0 — Nacional</option>
                                    <option value={1}>1 — Estrangeira (importação direta)</option>
                                    <option value={2}>2 — Estrangeira (mercado interno)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    </div>
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
