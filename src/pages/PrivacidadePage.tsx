import React from 'react';
import { LegalLayout, type SecaoLegal } from '../legal/LegalLayout';
import { EMPRESA, PRODUTO, SITE, identificacaoDaEmpresa } from '../legal/empresa';

const CONTATO = EMPRESA.email ? EMPRESA.email : 'o contato informado no cadastro ou no painel da loja';

const SECOES: SecaoLegal[] = [
    {
        titulo: 'Quem trata os seus dados',
        paragrafos: [
            `Esta política explica como o ${PRODUTO} (${SITE}), mantido por ${identificacaoDaEmpresa()}, trata dados pessoais, conforme a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).`,
            'Quando você faz um pedido, o Estabelecimento escolhido recebe os seus dados para atender o pedido e decide o que fazer com eles: nesse caso, ele é o controlador e nós somos operadores, tratando os dados em nome dele, pela plataforma. Nós somos controladores dos dados dos Estabelecimentos (donos de loja), dos dados necessários para o funcionamento, a segurança e a cobrança da plataforma e do shopping.',
        ],
    },
    {
        titulo: 'Quais dados coletamos',
        itens: [
            'De quem pede (Clientes): nome, telefone, endereço de entrega e ponto de referência, itens, valores e forma de pagamento dos pedidos, observações, avaliações e, quando existe programa de fidelidade da loja, selos ou pontos.',
            'De quem tem loja (Estabelecimentos): e-mail, senha (guardada de forma protegida, nunca em texto aberto), nome da loja, cidade, categoria, cardápio, fotos, configurações, dados de entregadores cadastrados e dados financeiros da operação (comissões, débitos e repasses).',
            'De entregadores e atendentes cadastrados pela loja: nome, telefone e dados de acesso.',
            'Dados técnicos: tipo de aparelho e navegador, registros de acesso e de erros, horário das ações, e, se você ativar o aviso de pedidos no celular, o endereço técnico de notificação do seu aparelho.',
            'Dados de pagamento: o pagamento online é feito na instituição de pagamento parceira. Não guardamos número de cartão.',
        ],
    },
    {
        titulo: 'Para que usamos e em que base legal',
        itens: [
            'Receber, preparar, entregar e cobrar o pedido, e atender o Cliente (execução do contrato).',
            'Criar e manter a conta do Estabelecimento, calcular a comissão, registrar débitos e fazer a cobrança (execução do contrato e legítimo interesse).',
            'Prevenir fraude, pedidos falsos, abuso e acesso indevido, e proteger a segurança do serviço (legítimo interesse e prevenção à fraude).',
            'Cumprir obrigações legais e regulatórias e exercer direitos em processos (obrigação legal e exercício regular de direitos).',
            'Enviar avisos do serviço, como notificações de pedido novo ao Estabelecimento, e mensagens sobre o pedido (execução do contrato e consentimento, no caso da notificação do aparelho).',
            'Mostrar a loja e os produtos no shopping do Pede Aqui (legítimo interesse do Estabelecimento e da plataforma).',
        ],
        depois: ['Não vendemos dados pessoais e não usamos rastreamento de publicidade.'],
    },
    {
        titulo: 'Com quem compartilhamos',
        itens: [
            'O Estabelecimento em que você faz o pedido, e entregadores que ele cadastrou, que recebem o necessário para entregar.',
            'Instituição de pagamento parceira, para cobrar e dividir pagamentos online.',
            'Empresas que fornecem a infraestrutura do serviço: hospedagem do site e do banco de dados (como Vercel e Supabase), armazenamento e distribuição de imagens (como Cloudflare) e envio de e-mails e notificações. Elas tratam os dados por nossa conta e somente para o serviço.',
            'Autoridades, quando houver ordem legal ou para defesa em processos.',
        ],
        depois: ['Alguns desses fornecedores têm servidores fora do Brasil. Nesses casos, adotamos as garantias exigidas pela LGPD para a transferência internacional.'],
    },
    {
        titulo: 'Por quanto tempo guardamos',
        paragrafos: [
            'Guardamos os dados pelo tempo necessário para as finalidades acima e para cumprir obrigações legais e prazos de defesa em processos, em geral até 5 anos para dados de pedidos e financeiros. Dados que não precisem mais ser guardados são apagados ou tornados anônimos. Ao encerrar a conta, dados necessários para obrigações legais e para cobranças em aberto continuam guardados pelo prazo exigido.',
        ],
    },
    {
        titulo: 'Seus direitos',
        paragrafos: [`Você pode pedir, a qualquer momento, por ${CONTATO}:`],
        itens: [
            'confirmar se tratamos seus dados e ter acesso a eles;',
            'corrigir dados incompletos ou desatualizados;',
            'pedir anonimização, bloqueio ou exclusão de dados desnecessários ou tratados em desacordo com a lei;',
            'receber uma cópia dos seus dados (portabilidade);',
            'saber com quem compartilhamos os dados;',
            'retirar o consentimento, quando o tratamento depender dele, e se opor a tratamentos que a lei não autorize.',
        ],
        depois: ['Se o pedido for sobre um pedido feito em uma loja, podemos precisar acionar o Estabelecimento, que é o controlador desses dados. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).'],
    },
    {
        titulo: 'Armazenamento no seu aparelho',
        paragrafos: [
            'Usamos o armazenamento do navegador (e tecnologias parecidas) apenas para o serviço funcionar: manter você conectado, guardar o carrinho, o tema escolhido, o aceite destes textos e, no painel da loja, as preferências de som e de avisos. Não usamos esses recursos para publicidade. Você pode apagá-los nas configurações do navegador, mas partes do serviço podem deixar de funcionar.',
        ],
    },
    {
        titulo: 'Segurança',
        paragrafos: [
            'Adotamos medidas técnicas e organizacionais para proteger os dados: acesso por conta e senha, regras que separam os dados de cada loja, senhas protegidas, conexão criptografada e limites contra abuso. Nenhum sistema é totalmente imune. Em caso de incidente que possa causar risco relevante, avisaremos os afetados e a ANPD, como a lei exige.',
        ],
    },
    {
        titulo: 'Crianças e adolescentes',
        paragrafos: ['O serviço não é dirigido a menores de 18 anos. Se um menor fizer pedidos, o responsável responde por eles e pode pedir a exclusão dos dados.'],
    },
    {
        titulo: 'Mudanças nesta política',
        paragrafos: ['Podemos atualizar esta política. A data e a versão no topo mostram a edição em vigor, e mudanças relevantes terão novo aviso e novo aceite.'],
    },
    {
        titulo: 'Contato do encarregado de dados',
        paragrafos: [EMPRESA.email ? `Fale com o encarregado pelo e-mail ${EMPRESA.email}.` : 'Fale com o encarregado pelo contato informado no seu cadastro ou no painel da loja.'],
    },
];

const PrivacidadePage: React.FC = () => (
    <LegalLayout
        titulo="Política de Privacidade"
        resumo="Resumo: guardamos só o necessário para o pedido chegar e para a plataforma funcionar (nome, telefone, endereço e dados do pedido). Não vendemos dados e não usamos rastreamento de publicidade. Você pode pedir acesso, correção ou exclusão quando quiser."
        secoes={SECOES}
        outra={{ para: '/termos', rotulo: 'Termos de Uso' }}
    />
);

export default PrivacidadePage;
