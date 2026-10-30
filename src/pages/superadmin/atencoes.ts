/**
 * "Precisa da sua atenção": o que o Ikarus precisa olhar hoje, calculado dos dados que o Super Admin já carregou.
 * Função pura: cada item diz o que é, quantas lojas e para qual seção do painel levar.
 */
import type { Store, LojaFinanceiro } from '../../types';
import { tipoDaLoja } from '../../services/recursos';
import { nivelDeContato, resumirCancelamentos, type PedidoResumo } from '../../services/comissao';

export type Secao = 'lojas' | 'comissoes' | 'pedidos' | 'saude' | 'shopping';
export interface Atencao { id: string; gravidade: 'alta' | 'media' | 'baixa'; texto: string; secao: Secao; lojas: string[] }

export interface DadosParaAtencao {
    stores: Store[];
    financeiros: Record<string, LojaFinanceiro>;
    cardapio: Record<string, number>;
    sinais: { store_id: string; ultimo_contato: string; vendas_na_fila: number }[];
    pedidos: PedidoResumo[];
    agora: number;
}

export function calcularAtencoes(d: DadosParaAtencao): Atencao[] {
    const out: Atencao[] = [];
    const ativas = d.stores.filter(s => s.is_active !== false);
    const add = (id: string, gravidade: Atencao['gravidade'], texto: string, secao: Secao, lojas: Store[]) => {
        if (lojas.length) out.push({ id, gravidade, texto, secao, lojas: lojas.map(s => s.name) });
    };

    // Computadores sem falar com o sistema, com venda guardada só neles
    const presas = new Set<string>();
    for (const s of d.sinais) {
        if (s.vendas_na_fila > 0 && nivelDeContato(s.ultimo_contato, d.agora, s.vendas_na_fila) === 'critico') presas.add(s.store_id);
    }
    add('fila-presa', 'alta', 'Computador sem contato com venda guardada só nele', 'saude', d.stores.filter(s => presas.has(s.id)));

    // Débito do dinheiro perto do limite
    add('debito', 'alta', 'Débito do dinheiro a 80% do limite ou mais', 'comissoes', ativas.filter(s => {
        const f = d.financeiros[s.id];
        return tipoDaLoja(s) === 'comissao' && !!f && f.limite_debito > 0 && f.debito_dinheiro >= f.limite_debito * 0.8;
    }));

    // Cancelamento suspeito
    const suspeitas = new Set(resumirCancelamentos(d.pedidos).filter(r => r.suspeito).map(r => r.store_id));
    add('cancelamento', 'media', 'Muitos cancelamentos (possível fuga da comissão)', 'pedidos', d.stores.filter(s => suspeitas.has(s.id)));

    // Mensalidade vencida ou vencendo
    add('vencimento', 'media', 'Mensalidade vencida ou vencendo em menos de 7 dias', 'lojas', ativas.filter(s =>
        tipoDaLoja(s) !== 'comissao' && !!s.subscription_end_date && (new Date(s.subscription_end_date).getTime() - d.agora) / 86400000 < 7));

    // Dono ainda sem login
    add('sem-login', 'media', 'Dono ainda sem login ligado à loja', 'lojas', d.stores.filter(s => !!s.owner_email && !s.owner_id));

    // Comissão sem condições
    add('sem-condicoes', 'media', 'Loja de comissão sem condições cadastradas', 'comissoes', ativas.filter(s => tipoDaLoja(s) === 'comissao' && !d.financeiros[s.id]));

    // No shopping sem cardápio, e cardápio vazio
    add('shopping-vazio', 'media', 'Aparece no shopping mas está sem cardápio', 'shopping', ativas.filter(s => !!s.aparecer_no_shopping && !(d.cardapio[s.id] > 0)));
    add('cardapio-vazio', 'baixa', 'Loja ativa sem nenhum item no cardápio', 'lojas', ativas.filter(s => !(d.cardapio[s.id] > 0)));

    const ordem = { alta: 0, media: 1, baixa: 2 };
    return out.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade]);
}
