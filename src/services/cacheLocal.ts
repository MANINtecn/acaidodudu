/**
 * Cópia local da loja, do cardápio e das configurações (28/10/2026).
 *
 * O app precisa abrir e vender mesmo sem internet. A cada carga boa a cópia é gravada; quando a
 * internet falha, é a cópia que abre a tela. No app de PC ela vai para um ARQUIVO em userData
 * (fora do cache do Chromium, como o livro do Balcão); no navegador, para o localStorage.
 *
 * Preço mudado em outro aparelho só chega quando a internet voltar; comanda já aberta mantém o
 * preço que tinha (regra do Balcão V2).
 */
export interface CopiaLocal<T> { valor: T; em: number }

const api = (): { ler: (n: string) => Promise<string | null>; gravar: (n: string, t: string) => Promise<any> } | null =>
    (typeof window !== 'undefined' && (window as any).electron?.cacheLocal) || null;

const PREFIXO = 'pdv_copia:';
const ultimoGravado = new Map<string, string>();

/** Grava a cópia. Não grava de novo se o conteúdo é igual ao último gravado (a carga roda de 10 em 10 minutos). */
export async function gravarCopia(nome: string, valor: unknown): Promise<void> {
    try {
        const conteudo = JSON.stringify(valor);
        if (ultimoGravado.get(nome) === conteudo) return;
        const texto = JSON.stringify({ em: Date.now(), valor });
        const a = api();
        if (a) {
            const r = await a.gravar(nome, texto);
            if (r && r.ok === false) return; // disco falhou: o próximo carregamento tenta de novo
        } else {
            window.localStorage.setItem(PREFIXO + nome, texto);
        }
        ultimoGravado.set(nome, conteudo);
    } catch (_) { /* sem cópia: o app segue funcionando online como antes */ }
}

export async function lerCopia<T>(nome: string): Promise<CopiaLocal<T> | null> {
    try {
        const a = api();
        const texto = a ? await a.ler(nome) : window.localStorage.getItem(PREFIXO + nome);
        if (!texto) return null;
        const o = JSON.parse(texto);
        return o && typeof o.em === 'number' && 'valor' in o ? (o as CopiaLocal<T>) : null;
    } catch (_) { return null; }
}

/** Só para os testes. */
export const __esquecerUltimoGravadoParaTeste = () => ultimoGravado.clear();

// Quando a tela abriu com a cópia (sem internet), o aviso de conexão diz de quando ela é.
let copiaEmUso: number | null = null;
export const definirCopiaEmUso = (em: number | null) => { copiaEmUso = em; };
export const copiaEmUsoDesde = (): number | null => copiaEmUso;
