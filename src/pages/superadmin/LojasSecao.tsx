import React, { useState } from 'react';
import { criarLojaCompleta, updateStoreSubscription, salvarFinanceiro } from '../../services/supabaseService';
import { tipoDaLoja, ROTULO_DO_TIPO, type TipoDeLoja } from '../../services/recursos';
import type { Store } from '../../types';
import { usePlataforma } from './dados';
import { CamposFinanceiros } from './CamposFinanceiros';
import { Janela, BotaoCancelar, BotaoPrincipal } from './Janela';
import { FIN_PADRAO, VALOR_PADRAO, CATEGORIAS_LOJA, SLUGS_RESERVADOS, limparSlug, brl, pct, type FormFinanceiro } from './util';

const PlusIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>;
const EditIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>;

const campoBase = 'w-full bg-gray-700 border-gray-600 rounded-lg p-2 text-white focus:ring-2 focus:ring-blue-500';

export const LojasSecao: React.FC = () => {
    const { stores, financeiros, padroes, cardapio, recarregar } = usePlataforma();
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingStore, setEditingStore] = useState<Store | null>(null);
    const [criada, setCriada] = useState<{ nome: string; slug: string; email: string; comLogin: boolean } | null>(null);

    const finPadroes = (): FormFinanceiro => ({ ...FIN_PADRAO, ...(padroes || {}) });
    const novoFormulario = (fin: FormFinanceiro = finPadroes()) => ({
        name: '', slug: '', owner_email: '', tipo: 'comissao' as TipoDeLoja, plan_value: VALOR_PADRAO.pdv_basico,
        categoria: '', cidade: '', aparecer_no_shopping: false, fin,
    });
    const [newStore, setNewStore] = useState(novoFormulario());
    const [editForm, setEditForm] = useState<{ tipo: TipoDeLoja; plan_value: number; subscription_end_date: string; is_active: boolean; categoria: string; cidade: string; aparecer_no_shopping: boolean; aceita_dinheiro: boolean; fin: FormFinanceiro }>({
        tipo: 'pdv_avancado', plan_value: 0, subscription_end_date: '', is_active: true, categoria: '', cidade: '', aparecer_no_shopping: false, aceita_dinheiro: true, fin: FIN_PADRAO,
    });

    const handleCreateStore = async () => {
        const slug = limparSlug(newStore.slug || newStore.name);
        const email = newStore.owner_email.trim().toLowerCase();
        if (!newStore.name.trim()) return alert('Informe o nome da loja.');
        if (!slug) return alert('Informe um link (slug) válido.');
        if (SLUGS_RESERVADOS.includes(slug)) return alert(`"${slug}" é um endereço reservado do sistema. Escolha outro.`);
        if (stores.some(s => s.slug === slug)) return alert(`Já existe uma loja com o link "${slug}".`);
        if (!email) return alert('Informe o e-mail do dono: é ele que dá acesso ao painel da loja.');
        const comissao = newStore.tipo === 'comissao';
        if (comissao && padroes === null) return alert('As condições de comissão ainda não existem no banco. Rode o SQL 4 no Supabase antes de criar lojas.');
        try {
            // PDV: 30 dias de teste. Comissão não tem mensalidade nem vencimento.
            const expirationDate = new Date();
            expirationDate.setDate(expirationDate.getDate() + 30);
            const { debito_dinheiro: _d, ...condicoes } = newStore.fin;

            const loja = await criarLojaCompleta({
                name: newStore.name.trim(),
                slug,
                owner_email: email,
                modelo: comissao ? 'comissao' : 'pdv',
                plan: comissao ? null : (newStore.tipo === 'pdv_basico' ? 'basico' : 'avancado'),
                plan_value: comissao ? 0 : (newStore.plan_value || 0),
                is_active: true,
                ...(comissao ? {} : { subscription_end_date: expirationDate.toISOString() }),
                ...(newStore.categoria ? { categoria: newStore.categoria } : {}),
                ...(newStore.cidade.trim() ? { cidade: newStore.cidade.trim() } : {}),
                ...(newStore.aparecer_no_shopping ? { aparecer_no_shopping: true } : {}),
            }, comissao ? condicoes : undefined);
            setShowCreateModal(false);
            // O banco liga o dono sozinho se a conta com esse e-mail já existe: aí não falta login nenhum.
            setCriada({ nome: newStore.name.trim(), slug, email, comLogin: !!loja.owner_id });
            setNewStore(novoFormulario());
            recarregar();
        } catch (error: any) {
            console.error(error);
            alert(`Erro ao criar loja: ${error?.message || error}`);
        }
    };

    const handleUpdateStore = async () => {
        if (!editingStore) return;
        const comissao = editForm.tipo === 'comissao';
        try {
            await updateStoreSubscription(editingStore.id, {
                modelo: comissao ? 'comissao' : 'pdv',
                plan: comissao ? null : (editForm.tipo === 'pdv_basico' ? 'basico' : 'avancado'),
                plan_value: comissao ? 0 : editForm.plan_value,
                is_active: editForm.is_active,
                categoria: editForm.categoria || null,
                cidade: editForm.cidade.trim() || null,
                aparecer_no_shopping: editForm.aparecer_no_shopping,
                aceita_dinheiro: comissao ? editForm.aceita_dinheiro : true,
                subscription_end_date: comissao ? null : (editForm.subscription_end_date ? new Date(editForm.subscription_end_date + 'T23:59:59').toISOString() : null),
            });
            if (comissao) await salvarFinanceiro(editingStore.id, editForm.fin);
            alert('Loja atualizada!');
            setEditingStore(null);
            recarregar();
        } catch (error: any) {
            console.error(error);
            alert(`Erro ao atualizar loja: ${error?.message || error}`);
        }
    };

    const openEditModal = (store: Store) => {
        setEditingStore(store);
        setEditForm({
            tipo: tipoDaLoja(store),
            plan_value: store.plan_value || 0,
            subscription_end_date: store.subscription_end_date ? new Date(store.subscription_end_date).toISOString().split('T')[0] : '',
            is_active: store.is_active ?? true,
            categoria: store.categoria || '',
            cidade: store.cidade || '',
            aparecer_no_shopping: store.aparecer_no_shopping ?? false,
            aceita_dinheiro: store.aceita_dinheiro ?? true,
            fin: { ...finPadroes(), ...(financeiros[store.id] ? { ...financeiros[store.id] } : {}) } as FormFinanceiro,
        });
    };

    const linkDaLoja = (slug: string) => `${window.location.origin}/${slug}`;
    const seletorDeTipo = (valor: TipoDeLoja, aoMudar: (t: TipoDeLoja) => void) => (
        <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Modelo da loja</label>
            <select value={valor} onChange={e => aoMudar(e.target.value as TipoDeLoja)} className={campoBase}>
                <option value="comissao">Comissão (Pede Aqui, sem mensalidade)</option>
                <option value="pdv_basico">PDV Básico (mensalidade)</option>
                <option value="pdv_avancado">PDV Avançado (mensalidade)</option>
            </select>
        </div>
    );

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-white">Lojas</h1>
                <button onClick={() => { setNewStore(novoFormulario()); setShowCreateModal(true); }} className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-bold transition">
                    <PlusIcon /> <span>Nova Loja</span>
                </button>
            </div>

            {padroes === null && (
                <div className="mb-6 rounded-lg bg-yellow-900/40 border border-yellow-700 text-yellow-200 px-4 py-3 text-sm">
                    As tabelas de condições de comissão ainda não existem no banco. Rode o SQL 4 no Supabase. Enquanto isso só dá para criar lojas de PDV.
                </div>
            )}

            <div className="bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-700">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-700 text-gray-300 uppercase text-sm">
                            <tr>
                                <th className="p-4">Nome</th>
                                <th className="p-4">Link</th>
                                <th className="p-4">Email Dono</th>
                                <th className="p-4">Modelo</th>
                                <th className="p-4">Condições</th>
                                <th className="p-4">Cardápio</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {stores.map(store => {
                                const tipo = tipoDaLoja(store);
                                const comissao = tipo === 'comissao';
                                const fin = financeiros[store.id];
                                const daysRemaining = store.subscription_end_date
                                    ? Math.ceil((new Date(store.subscription_end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                                    : 0;
                                return (
                                    <tr key={store.id} className="hover:bg-gray-750 transition">
                                        <td className="p-4 font-bold text-white">
                                            {store.name}
                                            {(store.categoria || store.cidade) && <span className="block text-xs font-normal text-gray-400">{[store.categoria, store.cidade].filter(Boolean).join(' · ')}{store.aparecer_no_shopping ? ' · no shopping' : ''}</span>}
                                        </td>
                                        <td className="p-4 text-blue-400 space-x-3 whitespace-nowrap">
                                            <a href={`/${store.slug}`} target="_blank" rel="noreferrer">/{store.slug}</a>
                                            <a href={`/${store.slug}/admin`} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-gray-200" title="Abre o painel da loja (você entra como administrador)">painel</a>
                                        </td>
                                        <td className="p-4 text-gray-300">
                                            {store.owner_email || '-'}
                                            {store.owner_email && !store.owner_id && <span className="ml-2 px-2 py-0.5 rounded text-xs font-bold bg-yellow-900 text-yellow-200" title="O dono ainda não criou/recebeu o login com este e-mail">sem login</span>}
                                        </td>
                                        <td className="p-4 text-gray-300">
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${comissao ? 'bg-orange-900 text-orange-200' : 'bg-blue-900 text-blue-200'}`}>{ROTULO_DO_TIPO[tipo]}</span>
                                            {!comissao && <span className="block text-green-400 font-mono text-xs mt-1">{brl(store.plan_value || 0)}/mês</span>}
                                        </td>
                                        <td className="p-4 text-xs">
                                            {comissao ? (
                                                fin ? (
                                                    <span className="text-gray-300">
                                                        {pct(fin.comissao_pct_propria)} / {pct(fin.comissao_pct_app)} + {brl(fin.comissao_fixa)}
                                                        <span className={`block ${fin.debito_dinheiro >= fin.limite_debito && fin.limite_debito > 0 ? 'text-red-400 font-bold' : 'text-gray-400'}`}>
                                                            débito {brl(fin.debito_dinheiro)} de {brl(fin.limite_debito)}{store.aceita_dinheiro === false ? ' (dinheiro bloqueado)' : ''}
                                                        </span>
                                                    </span>
                                                ) : <span className="text-yellow-400">sem condições cadastradas</span>
                                            ) : (
                                                <span className={`px-2 py-1 rounded font-bold ${daysRemaining < 7 ? 'bg-red-900 text-red-200' : 'bg-gray-700 text-gray-300'}`}>
                                                    {store.subscription_end_date ? new Date(store.subscription_end_date).toLocaleDateString() : '-'}
                                                    {store.subscription_end_date && ` (${daysRemaining} dias)`}
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-xs">
                                            {cardapio[store.id] > 0 ? <span className="text-gray-300">{cardapio[store.id]} itens</span> : <span className="text-yellow-400">vazio</span>}
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${store.is_active ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'}`}>
                                                {store.is_active ? 'ATIVO' : 'SUSPENSO'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            <button onClick={() => openEditModal(store)} className="text-blue-400 hover:text-blue-300 p-2 rounded hover:bg-gray-700" aria-label="Editar loja">
                                                <EditIcon />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Loja criada: o que falta fazer */}
            {criada && (
                <Janela titulo="Loja criada" onFechar={() => setCriada(null)} rodape={<>
                    <BotaoCancelar rotulo="Copiar link da loja" onClick={() => { navigator.clipboard?.writeText(linkDaLoja(criada.slug)).catch(() => {}); }} />
                    <BotaoPrincipal rotulo="Ok" onClick={() => setCriada(null)} />
                </>}>
                    <div className="space-y-3">
                        <p className="text-gray-300"><b>{criada.nome}</b></p>
                        <p className="text-sm text-gray-400">Link da loja (cardápio): <span className="text-blue-400 break-all">{linkDaLoja(criada.slug)}</span></p>
                        <p className="text-sm text-gray-400">Painel do dono: <span className="text-blue-400 break-all">{linkDaLoja(criada.slug)}/admin</span></p>
                        {criada.comLogin ? (
                            <p className="text-sm text-green-300">O dono (<b>{criada.email}</b>) já tem conta e foi ligado a esta loja sozinho. Ele já pode entrar no painel.</p>
                        ) : (
                            <p className="text-sm text-yellow-300">Falta o login: crie o usuário <b>{criada.email}</b> no Supabase (Authentication, Users, Add user, com "Auto Confirm User"). Ele é ligado a esta loja sozinho.</p>
                        )}
                    </div>
                </Janela>
            )}

            {/* Nova loja: duas colunas no computador */}
            {showCreateModal && (
                <Janela titulo="Nova Loja" larga onFechar={() => setShowCreateModal(false)} rodape={<>
                    <BotaoCancelar onClick={() => setShowCreateModal(false)} />
                    <BotaoPrincipal rotulo="Criar loja" onClick={handleCreateStore} />
                </>}>
                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-4">
                            {seletorDeTipo(newStore.tipo, t => setNewStore({ ...newStore, tipo: t, plan_value: t === 'comissao' ? 0 : VALOR_PADRAO[t] }))}
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Nome da Loja</label>
                                <input type="text" value={newStore.name} onChange={e => setNewStore({ ...newStore, name: e.target.value })} className={campoBase} placeholder="Ex: Lanchonete do João" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Link (slug)</label>
                                <input type="text" value={newStore.slug} onChange={e => setNewStore({ ...newStore, slug: e.target.value })} className={campoBase} placeholder={limparSlug(newStore.name) || 'lanchonetedojoao'} />
                                <p className="text-xs text-gray-500 mt-1">{window.location.origin}/{limparSlug(newStore.slug || newStore.name) || '...'}</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Email do Dono</label>
                                <input type="email" value={newStore.owner_email} onChange={e => setNewStore({ ...newStore, owner_email: e.target.value })} className={campoBase} placeholder="cliente@email.com" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Categoria</label>
                                    <select value={newStore.categoria} onChange={e => setNewStore({ ...newStore, categoria: e.target.value })} className={campoBase}>
                                        <option value="">Selecione</option>
                                        {CATEGORIAS_LOJA.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Cidade</label>
                                    <input type="text" value={newStore.cidade} onChange={e => setNewStore({ ...newStore, cidade: e.target.value })} className={campoBase} placeholder="Palmas" />
                                </div>
                            </div>
                        </div>
                        <div className="space-y-4">
                            {newStore.tipo === 'comissao' ? (
                                <div className="rounded-lg border border-gray-700 p-4">
                                    <p className="text-sm font-bold text-orange-300 mb-3">Condições de comissão (começam nos padrões)</p>
                                    <CamposFinanceiros v={newStore.fin} onChange={fin => setNewStore({ ...newStore, fin })} />
                                </div>
                            ) : (
                                <div className="rounded-lg border border-gray-700 p-4">
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Valor da mensalidade (R$)</label>
                                    <input type="number" value={newStore.plan_value} onChange={e => setNewStore({ ...newStore, plan_value: parseFloat(e.target.value) || 0 })} className={campoBase} />
                                    <p className="text-xs text-gray-500 mt-1">Começa ativa, com 30 dias de teste.</p>
                                </div>
                            )}
                            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                                <input type="checkbox" checked={newStore.aparecer_no_shopping} onChange={e => setNewStore({ ...newStore, aparecer_no_shopping: e.target.checked })} className="h-4 w-4" />
                                Aparecer no shopping (marque quando o cardápio estiver pronto)
                            </label>
                        </div>
                    </div>
                </Janela>
            )}

            {/* Editar loja: duas colunas no computador */}
            {editingStore && (
                <Janela titulo={`Editar: ${editingStore.name}`} larga onFechar={() => setEditingStore(null)} rodape={<>
                    <BotaoCancelar onClick={() => setEditingStore(null)} />
                    <BotaoPrincipal rotulo="Salvar alterações" onClick={handleUpdateStore} />
                </>}>
                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-4">
                            {seletorDeTipo(editForm.tipo, t => setEditForm({ ...editForm, tipo: t, plan_value: t === 'comissao' ? 0 : (editForm.plan_value || VALOR_PADRAO[t]) }))}
                            {editForm.tipo !== tipoDaLoja(editingStore) && (
                                <p className="text-xs text-yellow-300">Mudar o modelo muda na hora o que o lojista enxerga no painel dele.</p>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Categoria</label>
                                    <select value={editForm.categoria} onChange={e => setEditForm({ ...editForm, categoria: e.target.value })} className={campoBase}>
                                        <option value="">Sem categoria</option>
                                        {CATEGORIAS_LOJA.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Cidade</label>
                                    <input type="text" value={editForm.cidade} onChange={e => setEditForm({ ...editForm, cidade: e.target.value })} className={campoBase} />
                                </div>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                                <input type="checkbox" checked={editForm.aparecer_no_shopping} onChange={e => setEditForm({ ...editForm, aparecer_no_shopping: e.target.checked })} className="h-4 w-4" />
                                Aparecer no shopping (Pede Aqui)
                            </label>
                            <div className="flex items-center space-x-3 bg-gray-700 p-3 rounded-lg">
                                <input type="checkbox" id="isActive" checked={editForm.is_active} onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })} className="h-5 w-5 rounded text-blue-500 bg-gray-600 border-gray-500 focus:ring-blue-500" />
                                <label htmlFor="isActive" className="text-white font-medium cursor-pointer">Loja Ativa</label>
                            </div>
                        </div>
                        <div className="space-y-4">
                            {editForm.tipo === 'comissao' ? (
                                <div className="rounded-lg border border-gray-700 p-4 space-y-3">
                                    <p className="text-sm font-bold text-orange-300">Condições de comissão</p>
                                    <CamposFinanceiros v={editForm.fin} onChange={fin => setEditForm({ ...editForm, fin })} comDebito />
                                    <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                                        <input type="checkbox" checked={editForm.aceita_dinheiro} onChange={e => setEditForm({ ...editForm, aceita_dinheiro: e.target.checked })} className="h-4 w-4" />
                                        Aceitar pagamento em dinheiro (desmarque para bloquear a opção Dinheiro no checkout)
                                    </label>
                                </div>
                            ) : (
                                <div className="rounded-lg border border-gray-700 p-4 space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Valor da mensalidade (R$)</label>
                                        <input type="number" value={editForm.plan_value} onChange={e => setEditForm({ ...editForm, plan_value: parseFloat(e.target.value) || 0 })} className={campoBase} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Data de Vencimento</label>
                                        <input type="date" value={editForm.subscription_end_date} onChange={e => setEditForm({ ...editForm, subscription_end_date: e.target.value })} className={campoBase} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </Janela>
            )}
        </div>
    );
};
