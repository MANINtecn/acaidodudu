/**
 * Marca da plataforma e nome da loja atual.
 *
 * `MARCA` é o que aparece quando não há loja (telas de login, rodapé do cupom).
 * O nome da loja atual é guardado aqui assim que a loja carrega (StoreContext), para o que
 * não tem acesso ao contexto do React (serviço de impressão, textos soltos).
 */
export const MARCA = {
    produto: 'Pede Aqui',
    site: 'pedeaki.tecx.pro',
    suporte: 'TECX SISTEMAS',
};

let nomeLoja = '';

export const definirNomeDaLoja = (nome?: string | null) => { nomeLoja = (nome || '').trim(); };

/** Nome da loja atual; sem loja carregada, o nome da plataforma. */
export const nomeDaLoja = (): string => nomeLoja || MARCA.produto;
