/**
 * Dados da empresa que aparecem nos Termos de Uso e na Política de Privacidade.
 * Preencha quando o CNPJ e o e-mail de contato estiverem definidos: o que ficar vazio simplesmente não aparece no texto.
 * Ao mudar o conteúdo dos textos de forma relevante, mude também a VERSAO_TERMOS: todo cliente volta a ver o aceite.
 */
export const EMPRESA = {
    nome: 'TECX SISTEMAS',
    razaoSocial: '',   // ex.: 'TECX SISTEMAS LTDA'
    cnpj: '',          // ex.: '00.000.000/0001-00'
    email: '',         // e-mail de contato e do encarregado de dados (LGPD)
    cidade: '',        // ex.: 'Palmas'
    uf: 'TO',
};

export const PRODUTO = 'Pede Aqui';
export const SITE = 'pedeaki.tecx.pro';

/** Versão dos textos. Guardada no aparelho do cliente e nos dados da conta do lojista ao aceitar. */
export const VERSAO_TERMOS = '2026-11-03';
export const DATA_TERMOS = '3 de novembro de 2026';

export const identificacaoDaEmpresa = (): string => {
    const nome = EMPRESA.razaoSocial || EMPRESA.nome;
    const partes = [nome];
    if (EMPRESA.cnpj) partes.push(`CNPJ ${EMPRESA.cnpj}`);
    if (EMPRESA.cidade) partes.push(`${EMPRESA.cidade}/${EMPRESA.uf}`);
    return partes.join(', ');
};

export const foro = (): string => EMPRESA.cidade ? `foro da comarca de ${EMPRESA.cidade}, ${EMPRESA.uf}` : `foro da comarca da sede da ${EMPRESA.nome}`;
