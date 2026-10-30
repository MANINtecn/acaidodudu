/** Constantes e formatadores da central de gestão (Super Admin). */

export interface FormFinanceiro {
    comissao_pct_propria: number;
    comissao_pct_app: number;
    comissao_fixa: number;
    repassa_taxa_pagamento: boolean;
    limite_debito: number;
    debito_dinheiro: number;
}
export const FIN_PADRAO: FormFinanceiro = { comissao_pct_propria: 8, comissao_pct_app: 20, comissao_fixa: 0.99, repassa_taxa_pagamento: true, limite_debito: 100, debito_dinheiro: 0 };

/** Valor mensal sugerido de cada PDV (editável na criação). A loja de comissão não tem mensalidade. */
export const VALOR_PADRAO: Record<'pdv_basico' | 'pdv_avancado', number> = { pdv_basico: 199, pdv_avancado: 499 };
export const CATEGORIAS_LOJA = ['Lanchonete', 'Sorveteria / Açaí', 'Pizzaria', 'Restaurante', 'Padaria', 'Agropecuária', 'Outros'];
// Endereços que já são rotas do app: não podem virar link de loja.
export const SLUGS_RESERVADOS = ['admin', 'login', 'super-admin', 'staff', 'acesso', 'hub-equipe', 'portal-equipe', 'garcom', 'waiter', 'entregador', 'tv', 'cadastro', 'shopping', 'redefinir_senha', 'assets', 'public'];

export const limparSlug = (texto: string) =>
    texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');

export const brl = (v: number) => `R$ ${(Number(v) || 0).toFixed(2).replace('.', ',')}`;
export const pct = (v: number) => `${String(Number(v) || 0).replace('.', ',')}%`;

/** "há 3 min", "há 2 h", "há 4 dias". */
export const haQuanto = (iso: string | null | undefined, agora = Date.now()): string => {
    if (!iso) return 'nunca';
    const min = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60000));
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    if (min < 1440) return `há ${Math.round(min / 60)} h`;
    return `há ${Math.round(min / 1440)} dias`;
};

export const dataHora = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
