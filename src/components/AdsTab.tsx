import React, { useState, useEffect } from 'react';
import { TvAd } from '../types';
import { fetchTvAds, createTvAd, updateTvAd, deleteTvAd, uploadMenuImage } from '../services/supabaseService';
import { useStore } from '../contexts/StoreContext';
import { Plus, Edit, Trash2, Image as ImageIcon, CheckCircle, XCircle, Play } from 'lucide-react';
import { supabase } from '../services/supabaseService';

export const AdsTab: React.FC = () => {
    const { currentStore } = useStore();
    const [ads, setAds] = useState<TvAd[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAd, setEditingAd] = useState<Partial<TvAd> | null>(null);
    const [uploading, setUploading] = useState(false);
    const [liveVideoUrl, setLiveVideoUrl] = useState('');

    const loadAds = async () => {
        if (!currentStore) return;
        setLoading(true);
        try {
            const data = await fetchTvAds(currentStore.id);
            setAds(data as TvAd[]);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAds();
    }, [currentStore]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentStore || !editingAd?.title || !editingAd?.image_url) return;

        try {
            if (editingAd.id) {
                await updateTvAd(editingAd.id, { title: editingAd.title, image_url: editingAd.image_url, is_active: editingAd.is_active });
            } else {
                await createTvAd({ ...editingAd, store_id: currentStore.id });
            }
            setIsModalOpen(false);
            setEditingAd(null);
            loadAds();
        } catch (err) {
            console.error('Error saving ad', err);
            alert('Erro ao salvar propaganda');
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Tem certeza que deseja excluir esta propaganda?')) return;
        try {
            await deleteTvAd(id);
            loadAds();
        } catch (err) {
            console.error(err);
            alert('Erro ao excluir propaganda');
        }
    };

    const handleToggleStatus = async (ad: TvAd) => {
        try {
            await updateTvAd(ad.id!, { is_active: !ad.is_active });
            loadAds();
        } catch (err) {
            console.error(err);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentStore) return;

        setUploading(true);
        try {
            const url = await uploadMenuImage(file, currentStore.id);
            if (url) {
                setEditingAd(prev => ({ ...prev, image_url: url }));
            }
        } catch (err) {
            console.error('Error uploading image:', err);
            alert('Erro ao fazer upload da imagem no Firebase');
        } finally {
            setUploading(false);
        }
    };

    const handleSetLiveVideo = () => {
        if (!liveVideoUrl) {
            alert('Por favor, insira o link do YouTube.');
            return;
        }
        supabase.channel('tv_overlay_events').send({
            type: 'broadcast',
            event: 'set_live_video',
            payload: { url: liveVideoUrl }
        });
        alert('Sinal enviado! A TV deve começar a transmitir o jogo em instantes.');
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Carregando propagandas...</div>;

    return (
        <div className="p-6">
            <div className="bg-gradient-to-r from-red-600 to-red-800 rounded-xl p-6 mb-8 text-white shadow-lg">
                <h3 className="text-xl font-bold mb-2">Transmissão do Jogo na TV</h3>
                <p className="text-white/80 mb-4 text-sm">Cole o link da live do YouTube (Ex: CazéTV) para o vídeo rodar no fundo da tela da TV, por trás dos sorteios!</p>
                <div className="flex gap-3">
                    <input 
                        type="text" 
                        placeholder="Link do YouTube (https://youtu.be/...)"
                        className="flex-1 px-4 py-2 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-300"
                        value={liveVideoUrl}
                        onChange={(e) => setLiveVideoUrl(e.target.value)}
                    />
                    <button 
                        onClick={handleSetLiveVideo}
                        className="bg-white text-red-700 px-6 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-gray-100 transition-colors"
                    >
                        <Play size={18} fill="currentColor" />
                        Transmitir na TV
                    </button>
                </div>
            </div>

            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Propagandas da TV</h2>
                    <p className="text-gray-500 dark:text-gray-400">Gerencie os criativos dos parceiros que aparecem na TV Box a cada 5 minutos.</p>
                </div>
                <button
                    onClick={() => {
                        setEditingAd({ title: '', image_url: '', is_active: true });
                        setIsModalOpen(true);
                    }}
                    className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-red-700 transition"
                >
                    <Plus size={20} /> Nova Propaganda
                </button>
            </div>

            {ads.length === 0 ? (
                <div className="text-center p-12 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700">
                    <ImageIcon size={48} className="mx-auto text-gray-400 mb-4" />
                    <h3 className="text-xl font-bold text-gray-600 dark:text-gray-300">Nenhuma propaganda ativa</h3>
                    <p className="text-gray-500 mt-2">Clique no botão acima para adicionar o primeiro banner de parceiro.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {ads.map(ad => (
                        <div key={ad.id} className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border ${ad.is_active ? 'border-gray-200 dark:border-gray-700' : 'border-red-200 opacity-75'} overflow-hidden flex flex-col`}>
                            <div className="h-48 relative bg-gray-100 dark:bg-gray-900">
                                <img src={ad.image_url} alt={ad.title} className="w-full h-full object-contain" />
                                {!ad.is_active && (
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                        <span className="bg-red-600 text-white font-bold px-3 py-1 rounded-full">INATIVA</span>
                                    </div>
                                )}
                            </div>
                            <div className="p-4 flex-1 flex flex-col justify-between">
                                <h3 className="font-bold text-lg text-gray-800 dark:text-white mb-4">{ad.title}</h3>
                                <div className="flex justify-between items-center">
                                    <button 
                                        onClick={() => handleToggleStatus(ad)}
                                        className={`flex items-center gap-1 text-sm ${ad.is_active ? 'text-green-600 hover:text-green-700' : 'text-gray-500 hover:text-gray-600'}`}
                                    >
                                        {ad.is_active ? <CheckCircle size={18} /> : <XCircle size={18} />}
                                        {ad.is_active ? 'Ativa' : 'Ativar'}
                                    </button>
                                    <div className="flex gap-2">
                                        <button onClick={() => { setEditingAd(ad); setIsModalOpen(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg">
                                            <Edit size={20} />
                                        </button>
                                        <button onClick={() => handleDelete(ad.id!)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                                            <Trash2 size={20} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {isModalOpen && editingAd && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
                        <h2 className="text-xl font-bold mb-4 dark:text-white">
                            {editingAd.id ? 'Editar Propaganda' : 'Nova Propaganda'}
                        </h2>
                        
                        <form onSubmit={handleSave} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Título do Parceiro</label>
                                <input
                                    type="text"
                                    required
                                    value={editingAd.title || ''}
                                    onChange={e => setEditingAd({ ...editingAd, title: e.target.value })}
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                                    placeholder="Ex: Barbearia do Zé"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Imagem do Banner</label>
                                {editingAd.image_url ? (
                                    <div className="relative h-40 bg-gray-100 rounded-lg overflow-hidden border border-gray-300 mb-2">
                                        <img src={editingAd.image_url} alt="Preview" className="w-full h-full object-contain" />
                                        <button
                                            type="button"
                                            onClick={() => setEditingAd({ ...editingAd, image_url: '' })}
                                            className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full shadow hover:bg-red-700"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                                        {uploading ? (
                                            <div className="flex items-center justify-center gap-2 text-gray-500">
                                                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                                                Fazendo upload no Firebase...
                                            </div>
                                        ) : (
                                            <label className="cursor-pointer flex flex-col items-center justify-center">
                                                <ImageIcon size={32} className="text-gray-400 mb-2" />
                                                <span className="text-sm text-gray-500">Clique para enviar a imagem</span>
                                                <span className="text-xs text-gray-400 mt-1">(Recomendado: Retrato/Vertical para a TV)</span>
                                                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                                            </label>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center mt-4">
                                <input
                                    type="checkbox"
                                    id="is_active"
                                    checked={editingAd.is_active}
                                    onChange={e => setEditingAd({ ...editingAd, is_active: e.target.checked })}
                                    className="w-4 h-4 text-red-600 bg-gray-100 border-gray-300 rounded focus:ring-red-500"
                                />
                                <label htmlFor="is_active" className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">
                                    Propaganda Ativa
                                </label>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg dark:text-gray-300 dark:hover:bg-gray-700"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={!editingAd.title || !editingAd.image_url || uploading}
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-bold"
                                >
                                    Salvar Propaganda
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
