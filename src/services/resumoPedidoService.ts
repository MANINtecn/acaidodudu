/**
 * resumoPedidoService — monta o texto que o cliente envia no WhatsApp da loja
 * junto com o comprovante do PIX.
 *
 * O modelo é editável nas Configurações. Se estiver vazio, usa o MODELO_PADRAO.
 */

export interface DadosResumo {
    numeroPedido?: number | string;
    nomeCliente: string;
    telefone?: string;
    tipoPedido: string;                 // Entrega | Retirada | Balcão
    endereco?: string;
    bairro?: string;
    complemento?: string;
    pontoReferencia?: string;
    itens: Array<{
        nome: string;
        quantidade: number;
        preco: number;
        adicionais?: Array<{ nome: string; preco: number }>;
    }>;
    subtotal: number;
    taxaEntrega?: number;
    desconto?: number;
    total: number;
    formaPagamento: string;
    pixKey?: string;
    pixKeyType?: string;
    pixBeneficiary?: string;
    nomeLoja?: string;
}

/**
 * Marcas aceitas no modelo. Mantidas em português para o lojista entender
 * o que está editando.
 */
export const MARCAS_DISPONIVEIS = [
    { marca: '{{pedido}}', descricao: 'Número do pedido' },
    { marca: '{{cliente}}', descricao: 'Nome do cliente' },
    { marca: '{{telefone}}', descricao: 'Telefone do cliente' },
    { marca: '{{tipo}}', descricao: 'Entrega / Retirada' },
    { marca: '{{itens}}', descricao: 'Lista dos itens com adicionais' },
    { marca: '{{endereco}}', descricao: 'Endereço completo (só entrega)' },
    { marca: '{{subtotal}}', descricao: 'Soma dos itens' },
    { marca: '{{taxa}}', descricao: 'Taxa de entrega' },
    { marca: '{{desconto}}', descricao: 'Desconto aplicado' },
    { marca: '{{total}}', descricao: 'Valor total' },
    { marca: '{{pagamento}}', descricao: 'Forma de pagamento' },
    { marca: '{{pix}}', descricao: 'Bloco com chave PIX, tipo e beneficiário' },
    { marca: '{{loja}}', descricao: 'Nome da loja' },
];

export const MODELO_PADRAO = `*NOVO PEDIDO* {{pedido}}

{{itens}}
------------------------------------------
*DADOS PARA ENTREGA*

Nome: {{cliente}}
{{endereco}}
Telefone: {{telefone}}
{{taxa}}
------------------------------------------
*TOTAL = {{total}}*
------------------------------------------

*PAGAMENTO*

{{pagamento}}
{{pix}}`;

const real = (v: number) => `R$ ${(Number(v) || 0).toFixed(2).replace('.', ',')}`;

function montarItens(itens: DadosResumo['itens']): string {
    return itens.map(i => {
        const adicionais = i.adicionais || [];
        const precoAdicionais = adicionais.reduce((s, a) => s + (Number(a.preco) || 0), 0);
        const subtotalItem = ((Number(i.preco) || 0) + precoAdicionais) * (Number(i.quantidade) || 1);

        const linhas = [`${i.quantidade}x ${i.nome}`];
        adicionais.forEach(a => linhas.push(`   (1x) ${a.nome} (${real(a.preco)})`));
        linhas.push(``);
        linhas.push(` Subtotal do item: ${real(subtotalItem)}`);
        linhas.push(` - - - - - - - - - - - - - - -`);
        return linhas.join('\n');
    }).join('\n');
}

function montarEndereco(d: DadosResumo): string {
    if (d.tipoPedido !== 'Entrega') return `Tipo: ${d.tipoPedido}`;
    const partes: string[] = [];
    if (d.endereco) partes.push(`Endereço: ${d.endereco}`);
    if (d.bairro) partes.push(`Bairro: ${d.bairro}`);
    if (d.complemento) partes.push(`Complemento: ${d.complemento}`);
    if (d.pontoReferencia) partes.push(`Ponto de Referência: ${d.pontoReferencia}`);
    return partes.join('\n');
}

function montarPix(d: DadosResumo): string {
    if (!d.pixKey) return '';
    const l = [``, `Chave Pix: ${d.pixKey}`];
    if (d.pixKeyType) l.push(`Tipo: ${d.pixKeyType}`);
    if (d.pixBeneficiary) l.push(`Beneficiário: ${d.pixBeneficiary}`);
    return l.join('\n');
}

/** Substitui as marcas do modelo pelos dados do pedido. */
export function gerarResumo(dados: DadosResumo, modelo?: string): string {
    const base = (modelo && modelo.trim()) ? modelo : MODELO_PADRAO;

    const valores: Record<string, string> = {
        '{{pedido}}': dados.numeroPedido ? `#${dados.numeroPedido}` : '',
        '{{cliente}}': dados.nomeCliente || '',
        '{{telefone}}': dados.telefone || '',
        '{{tipo}}': dados.tipoPedido || '',
        '{{itens}}': montarItens(dados.itens || []),
        '{{endereco}}': montarEndereco(dados),
        '{{subtotal}}': real(dados.subtotal),
        '{{taxa}}': dados.taxaEntrega ? `\nTaxa de Entrega: ${real(dados.taxaEntrega)}` : '',
        '{{desconto}}': dados.desconto ? `Desconto: -${real(dados.desconto)}` : '',
        '{{total}}': real(dados.total),
        '{{pagamento}}': `Pagamento com ${dados.formaPagamento}`,
        '{{pix}}': dados.formaPagamento?.toUpperCase() === 'PIX' ? montarPix(dados) : '',
        '{{loja}}': dados.nomeLoja || '',
    };

    let texto = base;
    Object.entries(valores).forEach(([m, v]) => {
        texto = texto.split(m).join(v);
    });

    // Limpa sobras de marcas vazias (3+ quebras viram 2).
    return texto.replace(/\n{3,}/g, '\n\n').trim();
}

/** Monta o link que abre a conversa no WhatsApp já com o resumo escrito. */
export function linkWhatsapp(numeroLoja: string, texto: string): string {
    let n = (numeroLoja || '').replace(/\D/g, '');
    if (n.length <= 11 && !n.startsWith('55')) n = '55' + n;
    return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
}

/** Exemplo para a pré-visualização nas Configurações. */
export const EXEMPLO_RESUMO: DadosResumo = {
    numeroPedido: 42,
    nomeCliente: 'Sonia Maria',
    telefone: '63999998888',
    tipoPedido: 'Entrega',
    endereco: 'Rua Carlos Melo, nº 565',
    bairro: 'Povoado Boa Vista',
    complemento: 'Casa de dois andares, azulejo escuro',
    pontoReferencia: 'Em frente ao número 550',
    itens: [{
        nome: 'Potes de Sorvete 1,8L',
        quantidade: 1,
        preco: 0,
        adicionais: [{ nome: 'Ovomaltine', preco: 30 }],
    }],
    subtotal: 30,
    taxaEntrega: 5,
    total: 35,
    formaPagamento: 'PIX',
    pixKey: '44344954000197',
    pixKeyType: 'CNPJ',
    pixBeneficiary: 'Açaí do Dudu',
    nomeLoja: 'Açaí do Dudu',
};
