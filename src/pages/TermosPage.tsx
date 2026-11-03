import React from 'react';
import { LegalLayout, type SecaoLegal } from '../legal/LegalLayout';
import { EMPRESA, PRODUTO, SITE, foro, identificacaoDaEmpresa } from '../legal/empresa';

const SECOES: SecaoLegal[] = [
    {
        titulo: 'Quem somos e o que é o serviço',
        paragrafos: [
            `O ${PRODUTO} (${SITE}) é uma plataforma de tecnologia, mantida por ${identificacaoDaEmpresa()}, que permite a lojas e restaurantes (os "Estabelecimentos") divulgar o cardápio, receber pedidos pela internet e acompanhá-los, e permite a pessoas (os "Clientes") encontrar Estabelecimentos e fazer pedidos.`,
            `O ${PRODUTO} não prepara, não vende e não entrega os produtos. A venda é feita pelo Estabelecimento, que é o único responsável pelo que oferece. O ${PRODUTO} fornece o ambiente tecnológico, o recebimento do pedido e, quando contratado, a cobrança e a divisão dos pagamentos.`,
        ],
    },
    {
        titulo: 'Aceite e alterações',
        paragrafos: [
            'Ao criar uma conta de Estabelecimento, ao tocar em aceitar na primeira visita ou ao fazer um pedido, você declara que leu e concorda com estes Termos e com a Política de Privacidade.',
            'Podemos atualizar estes Termos. Mudanças relevantes terão nova data e uma nova versão, e o aceite será pedido de novo. Se você não concordar, deve parar de usar o serviço. O uso depois da mudança significa que você concorda com o texto novo.',
        ],
    },
    {
        titulo: 'Para os Clientes',
        itens: [
            'O contrato de compra é feito entre você e o Estabelecimento. Preço, disponibilidade, qualidade, tempo de preparo, prazo e taxa de entrega são de responsabilidade dele.',
            'Informe nome, telefone e endereço corretos. Erros nos dados podem atrasar ou impedir a entrega, sem responsabilidade do Estabelecimento ou da plataforma.',
            'O Estabelecimento pode cancelar um pedido (por falta de produto, loja fechada, endereço fora da área e outros motivos) e você será avisado. Se você já pagou online, o valor será devolvido pelo mesmo meio.',
            'Pagamentos online (PIX ou cartão) são processados por instituição de pagamento parceira. Pagamento em dinheiro é feito ao entregador ou na retirada, apenas nos Estabelecimentos que o aceitam.',
            'Problemas com o pedido (atraso, produto errado, qualidade) devem ser resolvidos primeiro com o Estabelecimento, pelos contatos que ele divulga. Podemos ajudar a mediar.',
            'Para evitar fraude e pedidos falsos, existem limites, como o intervalo mínimo entre pedidos do mesmo telefone. Uso abusivo pode levar ao bloqueio.',
        ],
    },
    {
        titulo: 'Para os Estabelecimentos: cadastro e responsabilidades',
        itens: [
            'O cadastro deve ser feito por quem tem poderes para representar o negócio, com dados verdadeiros e atualizados. A senha é pessoal: o que for feito com ela é de sua responsabilidade. Avise-nos se suspeitar de acesso indevido.',
            'Você é responsável por tudo o que publica: cardápio, preços, fotos, promoções, horários, áreas e taxas de entrega, e por cumprir as leis que valem para a sua atividade (sanitárias, de consumo, fiscais e trabalhistas, inclusive emissão de nota fiscal quando exigida).',
            'Você se compromete a atender os pedidos aceitos pelo sistema ou cancelá-los com um motivo verdadeiro, a manter o painel aberto no horário de funcionamento e a tratar com cuidado os dados dos Clientes, usando-os somente para entregar o pedido e atender o Cliente.',
            'Os pedidos entram no painel já aceitos. A plataforma audita cancelamentos para evitar que pedidos feitos pelo Pede Aqui sejam desviados.',
        ],
    },
    {
        titulo: 'Comissão e pagamentos',
        paragrafos: [
            'O modelo sem mensalidade cobra uma comissão, em percentual, sobre o valor dos produtos de cada pedido feito pela plataforma. A taxa de entrega não entra na base de cálculo. Os percentuais, que podem variar conforme quem faz a entrega (o próprio Estabelecimento ou entregadores da plataforma), são os informados no painel e combinados no cadastro. Quando a entrega é feita por entregador da plataforma, o valor da taxa de entrega é repassado a ele.',
            'Pagamento online (PIX e cartão): o valor é cobrado do Cliente por instituição de pagamento parceira e dividido automaticamente entre o Estabelecimento, a plataforma (comissão) e, se for o caso, o entregador. As tarifas da instituição de pagamento podem ser cobradas do Estabelecimento, conforme as condições informadas no painel.',
            'Pagamento em dinheiro na entrega ou na retirada: o dinheiro fica com o Estabelecimento e a comissão do pedido é registrada como débito dele com a plataforma, pelo valor do pedido entregue. Ao aceitar estes Termos, o Estabelecimento autoriza a plataforma a compensar esse débito com os valores dos próximos pagamentos online a que ele tiver direito, e também a cobrá-lo por PIX ou outro meio.',
            'Existe um limite de débito por Estabelecimento. Ao atingi-lo, a opção de pagamento em dinheiro deixa de aparecer para os Clientes até que o débito seja pago ou compensado. Débito vencido por muito tempo pode levar à suspensão da loja, inclusive da vitrine do shopping, até a regularização.',
            'Cancelamentos e devoluções feitos depois da divisão do pagamento ajustam a comissão e o débito de forma proporcional.',
        ],
    },
    {
        titulo: 'Condutas proibidas',
        itens: [
            'Combinar com o Cliente, por fora da plataforma, a compra de um pedido que veio pelo Pede Aqui para não pagar a comissão, ou cancelar pedidos sem motivo real com a mesma finalidade.',
            'Criar pedidos falsos, tentar burlar limites de segurança, acessar dados de outras lojas ou de outros usuários, ou tentar interferir no funcionamento do serviço.',
            'Publicar conteúdo ilegal, enganoso, ofensivo ou que infrinja direitos de terceiros, inclusive imagens e marcas sem autorização.',
            'Usar a plataforma para vender produtos proibidos ou que exijam licença que o Estabelecimento não tem.',
        ],
        depois: ['O descumprimento pode levar à suspensão ou ao encerramento da conta, sem prejuízo da cobrança do que for devido e de outras medidas legais.'],
    },
    {
        titulo: 'Disponibilidade e suporte',
        paragrafos: [
            'Trabalhamos para manter o serviço no ar, mas ele depende de internet, de servidores e de parceiros, e pode ter interrupções, manutenção ou falhas. Não garantimos funcionamento ininterrupto nem ausência de erros.',
            'O aviso de pedido novo depende do aparelho, do navegador e da conexão do Estabelecimento. É responsabilidade do Estabelecimento conferir se os avisos estão ligados e acompanhar o painel.',
        ],
    },
    {
        titulo: 'Propriedade intelectual',
        paragrafos: [
            `A marca ${PRODUTO}, o sistema e o conteúdo da plataforma são de ${EMPRESA.nome} ou de seus licenciantes. O Estabelecimento continua dono da marca, das fotos e dos textos que publica, e nos autoriza a exibi-los na plataforma, no shopping e nas divulgações da plataforma enquanto a conta estiver ativa.`,
        ],
    },
    {
        titulo: 'Limitação de responsabilidade',
        paragrafos: [
            'Como plataforma de tecnologia, não respondemos pela qualidade, segurança, preço ou entrega dos produtos vendidos pelos Estabelecimentos, nem por atos de entregadores contratados por eles. Na extensão permitida em lei, nossa responsabilidade se limita a falhas do próprio serviço e, em qualquer caso, ao valor de comissão que recebemos do pedido em questão.',
            'Isso não afasta direitos que a lei garante ao consumidor.',
        ],
    },
    {
        titulo: 'Encerramento',
        paragrafos: [
            'O Estabelecimento pode encerrar a conta quando quiser, depois de quitar o que deve. Podemos suspender ou encerrar contas que descumpram estes Termos ou a lei. Os débitos existentes continuam valendo depois do encerramento, e os dados são tratados conforme a Política de Privacidade.',
        ],
    },
    {
        titulo: 'Privacidade e contato',
        paragrafos: [
            'O tratamento dos dados pessoais está descrito na Política de Privacidade.',
            EMPRESA.email ? `Dúvidas, reclamações e pedidos sobre estes Termos: ${EMPRESA.email}.` : 'Dúvidas, reclamações e pedidos sobre estes Termos: use o contato informado no seu cadastro ou no painel da loja.',
        ],
    },
    {
        titulo: 'Lei aplicável e foro',
        paragrafos: [`Estes Termos seguem as leis do Brasil. Fica eleito o ${foro()}, para resolver conflitos, ressalvado o direito do consumidor de ajuizar ações no foro do seu domicílio.`],
    },
];

const TermosPage: React.FC = () => (
    <LegalLayout
        titulo="Termos de Uso"
        resumo="Resumo: o Pede Aqui é a ferramenta que liga o Cliente ao Estabelecimento. Quem vende e entrega é a loja. O Estabelecimento paga uma comissão sobre os produtos de cada pedido feito pela plataforma, e o dinheiro recebido na mão vira um débito de comissão. Leia o texto completo abaixo."
        secoes={SECOES}
        outra={{ para: '/privacidade', rotulo: 'Política de Privacidade' }}
    />
);

export default TermosPage;
