/**
 * O que cada tipo de loja enxerga (30/10/2026). Fonte única da verdade: o menu do painel, as telas e,
 * depois, o servidor perguntam aqui. Para mudar o que entra em cada plano, mexe-se SÓ nesta tabela.
 *
 * Modelos:
 *   comissao  Pede Aqui, sem mensalidade: recebe pedidos, o app cobra comissão. Painel enxuto, sem PDV.
 *   pdv       Mensalidade, plano Básico ou Avançado, link próprio e SEM comissão.
 *
 * ATENÇÃO: a divisão Básico x Avançado abaixo é PROVISÓRIA (o Ikarus ainda vai definir o que entra em cada um).
 */
import type { Store } from '../types';

export type ModeloLoja = 'comissao' | 'pdv';
export type PlanoPdv = 'basico' | 'avancado';
export type TipoDeLoja = 'comissao' | 'pdv_basico' | 'pdv_avancado';

export type Recurso =
    | 'pedidos' | 'avaliacoes' | 'cardapio' | 'promocoes' | 'historico' | 'motoboys' | 'taxas_entrega' | 'configuracoes'
    | 'balcao' | 'caixa' | 'cozinha' | 'comandos' | 'fidelidade' | 'sorteio' | 'propagandas'
    | 'robo_whatsapp' | 'nota_fiscal';

const BASE: Recurso[] = ['pedidos', 'avaliacoes', 'cardapio', 'promocoes', 'historico', 'motoboys', 'taxas_entrega', 'configuracoes'];
const PDV_BASICO: Recurso[] = [...BASE, 'balcao', 'caixa', 'cozinha', 'comandos', 'fidelidade', 'sorteio', 'propagandas'];
const PDV_AVANCADO: Recurso[] = [...PDV_BASICO, 'robo_whatsapp', 'nota_fiscal'];

const POR_TIPO: Record<TipoDeLoja, ReadonlySet<Recurso>> = {
    comissao: new Set(BASE),
    pdv_basico: new Set(PDV_BASICO),
    pdv_avancado: new Set(PDV_AVANCADO),
};

type LojaMinima = Pick<Store, 'modelo' | 'plan'> | null | undefined;

/**
 * Qual tipo de loja é. Loja sem o campo `modelo` (criada antes dos modelos, ou cópia antiga) é PDV completo:
 * nada some de quem já usa. Loja ainda não carregada também: não esconde nada por engano (internet fora).
 */
export function tipoDaLoja(loja: LojaMinima): TipoDeLoja {
    if (!loja || !loja.modelo) return 'pdv_avancado';
    if (loja.modelo === 'comissao') return 'comissao';
    return loja.plan === 'basico' ? 'pdv_basico' : 'pdv_avancado';
}

export const temRecurso = (loja: LojaMinima, recurso: Recurso): boolean => POR_TIPO[tipoDaLoja(loja)].has(recurso);

/** Todos os recursos, na ordem em que aparecem na tabela de planos do Super Admin. */
export const TODOS_OS_RECURSOS: Recurso[] = [...PDV_AVANCADO];

/** Nome de cada recurso para mostrar ao Ikarus. */
export const ROTULO_DO_RECURSO: Record<Recurso, string> = {
    pedidos: 'Pedidos', avaliacoes: 'Avaliações', cardapio: 'Cardápio', promocoes: 'Promoções', historico: 'Histórico',
    motoboys: 'Motoboys', taxas_entrega: 'Taxas de entrega', configuracoes: 'Configurações',
    balcao: 'Balcão (PDV)', caixa: 'Caixa', cozinha: 'Cozinha', comandos: 'Comandos', fidelidade: 'Fidelidade',
    sorteio: 'Sorteio', propagandas: 'Propagandas', robo_whatsapp: 'Robô de WhatsApp', nota_fiscal: 'Nota fiscal',
};

export const ROTULO_DO_TIPO: Record<TipoDeLoja, string> = {
    comissao: 'Comissão',
    pdv_basico: 'PDV Básico',
    pdv_avancado: 'PDV Avançado',
};

/** Loja de comissão não tem mensalidade nem vencimento. */
export const cobraMensalidade = (loja: LojaMinima): boolean => tipoDaLoja(loja) !== 'comissao';

/** Aba do painel de administração -> recurso que a libera. */
export const RECURSO_DA_ABA: Record<string, Recurso> = {
    orders: 'pedidos', reviews: 'avaliacoes', menu: 'cardapio', promotions: 'promocoes', history: 'historico',
    couriers: 'motoboys', 'delivery-zones': 'taxas_entrega', settings: 'configuracoes',
    counter: 'balcao', cash: 'caixa', kitchen: 'cozinha', comandos: 'comandos', fidelidade: 'fidelidade',
    raffle: 'sorteio', ads: 'propagandas', 'whatsapp-bot': 'robo_whatsapp', fiscal: 'nota_fiscal',
};

/** A aba está liberada para esta loja? Aba que não está na tabela (ex.: addons) não é controlada por plano. */
export const abaLiberada = (loja: LojaMinima, aba: string): boolean => {
    const r = RECURSO_DA_ABA[aba];
    return r ? temRecurso(loja, r) : true;
};
