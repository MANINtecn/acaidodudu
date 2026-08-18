import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { DeliveryZone } from '../types';
import { fetchDeliveryZones, createDeliveryZone, updateDeliveryZone, deleteDeliveryZone } from '../services/supabaseService';

interface Props {
    storeId: string;
}

export const DeliveryZonesManager: React.FC<Props> = ({ storeId }) => {
    const [zones, setZones] = useState<DeliveryZone[]>([]);
    const [loading, setLoading] = useState(true);
    const [newName, setNewName] = useState('');
    const [newFee, setNewFee] = useState('');
    
    useEffect(() => {
        loadZones();
    }, [storeId]);

    const loadZones = async () => {
        setLoading(true);
        const data = await fetchDeliveryZones(storeId);
        setZones(data);
        setLoading(false);
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim() || !newFee) return;
        
        try {
            const added = await createDeliveryZone({
                store_id: storeId,
                neighborhood_name: newName.trim(),
                fee: parseFloat(newFee),
                is_active: true
            });
            if (added) {
                setZones([...zones, added].sort((a,b) => a.neighborhood_name.localeCompare(b.neighborhood_name)));
                setNewName('');
                setNewFee('');
            }
        } catch (error) {
            console.error(error);
            alert('Erro ao adicionar bairro');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Excluir este bairro?')) return;
        try {
            await deleteDeliveryZone(id);
            setZones(zones.filter(z => z.id !== id));
        } catch (error) {
            console.error(error);
            alert('Erro ao excluir bairro');
        }
    };

    const toggleActive = async (zone: DeliveryZone) => {
        try {
            await updateDeliveryZone(zone.id, { is_active: !zone.is_active });
            setZones(zones.map(z => z.id === zone.id ? { ...z, is_active: !z.is_active } : z));
        } catch (error) {
            console.error(error);
            alert('Erro ao atualizar status');
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mt-6">
            <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100 border-b border-gray-100 dark:border-gray-700 pb-2">
                Bairros e Taxas de Entrega
            </h3>
            
            <form onSubmit={handleAdd} className="flex gap-4 mb-6 items-end">
                <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Nome do Bairro</label>
                    <input 
                        type="text" 
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Ex: Centro"
                        className="w-full px-3 py-2 border rounded focus:ring-1 focus:ring-red-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        required
                    />
                </div>
                <div className="w-32">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Taxa (R$)</label>
                    <input 
                        type="number" 
                        step="0.50"
                        min="0"
                        value={newFee}
                        onChange={e => setNewFee(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-2 border rounded focus:ring-1 focus:ring-red-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        required
                    />
                </div>
                <button type="submit" className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded font-bold flex items-center gap-2 h-[42px]">
                    <Plus size={18} /> Adicionar
                </button>
            </form>

            {loading ? (
                <div className="text-gray-500 text-sm">Carregando bairros...</div>
            ) : zones.length === 0 ? (
                <div className="text-gray-500 text-sm italic">Nenhum bairro cadastrado.</div>
            ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                    {zones.map(zone => (
                        <div key={zone.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded border border-gray-100 dark:border-gray-600">
                            <div>
                                <div className="font-bold text-gray-800 dark:text-gray-200">{zone.neighborhood_name}</div>
                                <div className="text-sm text-red-600 dark:text-red-400 font-medium">R$ {Number(zone.fee).toFixed(2)}</div>
                            </div>
                            <div className="flex items-center gap-3">
                                <button 
                                    type="button"
                                    onClick={() => toggleActive(zone)}
                                    className={`text-xs font-bold px-2 py-1 rounded ${zone.is_active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-500 dark:bg-gray-600 dark:text-gray-400"}`}
                                >
                                    {zone.is_active ? 'Ativo' : 'Inativo'}
                                </button>
                                <button type="button" onClick={() => handleDelete(zone.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <p className="text-xs text-gray-500 mt-4 italic">
                * Apenas bairros cadastrados aqui aparecerão na opção de entrega para o cliente. O campo de taxa fixa não será mais usado.
            </p>
        </div>
    );
};

