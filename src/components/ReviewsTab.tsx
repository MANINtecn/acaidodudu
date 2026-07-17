import React, { useState, useEffect, useMemo } from 'react';
import { supabase, mapOrderFromDB } from '../services/supabaseService';
import { Star, User, Calendar, Clock, MessageSquare, Filter } from 'lucide-react';
import { Order } from '../types';

interface ReviewsTabProps {
    storeId: string;
}

export const ReviewsTab: React.FC<ReviewsTabProps> = ({ storeId }) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [ratingFilter, setRatingFilter] = useState<number | 'all'>('all');

    useEffect(() => {
        const fetchReviews = async () => {
            setLoading(true);
            try {
                // Fetch orders that have a rating
                const { data, error } = await supabase
                    .from('orders')
                    .select('*')
                    .eq('store_id', storeId)
                    .not('rating', 'is', null) // Only orders with ratings
                    .order('timestamp', { ascending: false })
                    .limit(100); // Limit to last 100 reviews for performance

                if (error) throw error;
                // Standardize data mapping
                const mappedData = (data || []).map(dbOrder => mapOrderFromDB(dbOrder)) as Order[];
                
                // Sort by:
                // 1. Has written feedback (comments) first
                // 2. Timestamp (newest first)
                const sortedData = [...mappedData].sort((a, b) => {
                    const hasA = a.feedback && a.feedback.trim().length > 0 ? 1 : 0;
                    const hasB = b.feedback && b.feedback.trim().length > 0 ? 1 : 0;
                    
                    if (hasA !== hasB) {
                        return hasB - hasA; // Has feedback (1) comes before No feedback (0)
                    }
                    
                    // Secondary sort: timestamp descending
                    const dateA = new Date(a.timestamp || 0).getTime();
                    const dateB = new Date(b.timestamp || 0).getTime();
                    return dateB - dateA;
                });

                setOrders(sortedData);
            } catch (err) {
                console.error("Error fetching reviews:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchReviews();
    }, [storeId]);

    const filteredOrders = useMemo(() => {
        if (ratingFilter === 'all') return orders;
        return orders.filter(o => o.rating === ratingFilter);
    }, [orders, ratingFilter]);

    const averageRating = useMemo(() => {
        const validOrders = orders.filter(o => o.rating && Number(o.rating) >= 1 && Number(o.rating) <= 5);
        if (validOrders.length === 0) return 0;
        const total = validOrders.reduce((sum, order) => sum + (Number(order.rating) || 0), 0);
        return Number(total / validOrders.length).toFixed(1);
    }, [orders]);



    if (loading) {
        return <div className="p-8 text-center text-gray-500">Carregando avaliações...</div>;
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
            {/* Header / Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total de Avaliações</p>
                        <h3 className="text-3xl font-bold text-gray-900 dark:text-white">{orders.length}</h3>
                    </div>
                    <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-full">
                        <MessageSquare className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Média de Satisfação</p>
                        <div className="flex items-center gap-2">
                            <h3 className="text-3xl font-bold text-gray-900 dark:text-white">{averageRating}</h3>
                            <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                        </div>
                    </div>
                    <div className="bg-yellow-100 dark:bg-yellow-900/30 p-3 rounded-full">
                        <Star className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                    </div>
                </div>
            </div>

            {/* Filter */}
            <div className="flex justify-end items-center gap-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <select
                    value={ratingFilter}
                    onChange={(e) => setRatingFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md p-1.5 text-sm"
                >
                    <option value="all">Todas as Estrelas</option>
                    <option value="5">5 Estrelas</option>
                    <option value="4">4 Estrelas</option>
                    <option value="3">3 Estrelas</option>
                    <option value="2">2 Estrelas</option>
                    <option value="1">1 Estrela</option>
                </select>
            </div>

            {/* Reviews Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredOrders.length === 0 ? (
                    <div className="col-span-full text-center py-12 text-gray-500 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                        Nenhuma avaliação encontrada com estes filtros.
                    </div>
                ) : (
                    filteredOrders.map(order => (
                        <div key={order.id} className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 transition-all hover:shadow-md">
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-1">
                                    {[1, 2, 3, 4, 5].map(s => (
                                        <Star
                                            key={s}
                                            className={`w-4 h-4 ${s <= (order.rating || 0) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 dark:text-gray-600'}`}
                                        />
                                    ))}
                                </div>
                                <span className={`text-xs px-2 py-1 rounded-full font-bold
                                    ${Number(order.rating) >= 4 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                        Number(order.rating) === 3 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                            'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                    {Number(order.rating || 0).toFixed(1)}
                                </span>
                            </div>

                            {order.feedback ? (
                                <p className="text-gray-700 dark:text-gray-300 text-sm mb-4 leading-relaxed bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg italic">
                                    "{order.feedback}"
                                </p>
                            ) : (
                                <p className="text-gray-400 dark:text-gray-500 text-xs italic mb-4">Sem comentário escrito</p>
                            )}

                            <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
                                <div className="flex items-center gap-2">
                                    <User className="w-3 h-3" />
                                    <span className="font-medium truncate max-w-[120px]">{order.customerName}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        <span>{order.timestamp ? new Date(order.timestamp).toLocaleDateString() : '-'}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        <span>{order.timestamp ? new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
