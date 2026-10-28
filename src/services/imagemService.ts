/**
 * Imagens do SaaS: comprime no aparelho, nomeia pelo conteúdo e envia ao Cloudflare R2
 * (pelo Worker em worker-imagens/). O banco guarda só a URL.
 *
 * Por que assim: o que estoura o plano grátis é o DOWNLOAD de foto, então a foto já nasce
 * pequena (WebP), com miniatura para a lista, e com nome = hash do conteúdo para o
 * navegador guardar por 1 ano sem nunca precisar revalidar.
 *
 * Só liga quando VITE_IMAGENS_UPLOAD_URL está configurada; sem ela o app segue no
 * Supabase Storage como antes.
 */

export type TipoImagem = 'produto' | 'logo' | 'hero';

const env = ((import.meta as any).env || {}) as Record<string, string | undefined>;
const URL_UPLOAD = (env.VITE_IMAGENS_UPLOAD_URL || '').replace(/\/+$/, '');
// Leitura: o domínio público do bucket (ex.: https://img.tecx.pro). Sem ele, lê pelo Worker.
const URL_LEITURA = (env.VITE_IMAGENS_CDN_URL || URL_UPLOAD).replace(/\/+$/, '');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tem de ficar abaixo dos limites do Worker (150 / 100 / 400 KB).
const PERFIL: Record<TipoImagem, { lado: number; alvoBytes: number }> = {
    produto: { lado: 800, alvoBytes: 90 * 1024 },
    logo: { lado: 512, alvoBytes: 50 * 1024 },
    hero: { lado: 1600, alvoBytes: 220 * 1024 },
};
const MINIATURA = { lado: 400, alvoBytes: 30 * 1024 };

/** O envio ao R2 está ligado e dá para usar nesta loja? (senão cai no caminho antigo) */
export const imagensR2Ativas = (storeId: string): boolean => !!URL_UPLOAD && UUID.test(storeId);

/**
 * Miniatura de uma imagem de produto enviada por este serviço (R2 ou Supabase): a lista do
 * cardápio baixa essa, não a grande. Imagem antiga ou de outro padrão: devolve igual.
 */
export const miniatura = (url?: string | null): string | undefined => {
    if (!url) return undefined;
    return url.replace(/(\/produto\/[0-9a-f]{16,64})\.webp(\?.*)?$/, '$1_t.webp$2');
};

async function carregar(file: File): Promise<ImageBitmap> {
    return createImageBitmap(file, { imageOrientation: 'from-image' } as any);
}

async function paraWebp(img: ImageBitmap, ladoMax: number, alvoBytes: number): Promise<Blob> {
    let lado = ladoMax;
    for (let rodada = 0; rodada < 4; rodada++) {
        const escala = Math.min(1, lado / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * escala));
        canvas.height = Math.max(1, Math.round(img.height * escala));
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        for (const q of [0.82, 0.72, 0.62, 0.5, 0.4]) {
            const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/webp', q));
            if (!blob) throw new Error('Não foi possível comprimir a imagem.');
            // Navegador sem suporte a WebP devolve PNG: o Worker só aceita WebP.
            if (blob.type !== 'image/webp') throw new Error('Este navegador não gera WebP. Use o Chrome atualizado.');
            if (blob.size <= alvoBytes) return blob;
        }
        lado = Math.round(lado * 0.8); // ainda grande: diminui o tamanho e tenta de novo
    }
    throw new Error('A imagem não ficou pequena o bastante. Tente outra foto.');
}

async function hashDe(blob: Blob): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

/** A imagem não pôde ser comprimida (formato estranho, navegador sem WebP...). Não é erro de rede. */
export class ErroDeCompressao extends Error {}

/** Grava um arquivo já comprimido e devolve a URL pública dele. Cada destino (R2, Supabase) fornece o seu. */
export type Gravador = (caminho: string, blob: Blob) => Promise<string>;

/**
 * Comprime e grava via `gravar`. Devolve a URL da imagem principal. Para produto grava também a
 * miniatura (`..._t.webp`) e, se ela falhar, o envio todo falha: a lista do cardápio depende dela,
 * e produto sem miniatura apareceria quebrado.
 */
export async function enviarImagemComprimida(file: File, storeId: string, tipo: TipoImagem, gravar: Gravador): Promise<string> {
    let img: ImageBitmap;
    let principal: Blob;
    let mini: Blob | null = null;
    let hash: string;
    try {
        img = await carregar(file);
    } catch (e: any) {
        throw new ErroDeCompressao(`Não foi possível ler a imagem: ${e?.message || e}`);
    }
    try {
        const perfil = PERFIL[tipo];
        principal = await paraWebp(img, perfil.lado, perfil.alvoBytes);
        if (tipo === 'produto') mini = await paraWebp(img, MINIATURA.lado, MINIATURA.alvoBytes);
        hash = await hashDe(principal);
    } catch (e: any) {
        throw new ErroDeCompressao(e?.message || String(e));
    } finally {
        img.close?.();
    }
    const base = `${storeId}/${tipo}/${hash}`;
    const url = await gravar(`${base}.webp`, principal);
    if (mini) await gravar(`${base}_t.webp`, mini);
    return url;
}

/** Destino Cloudflare R2, pelo Worker (exige login). */
export const enviarImagem = (file: File, storeId: string, tipo: TipoImagem, obterToken: () => Promise<string | undefined>) =>
    enviarImagemComprimida(file, storeId, tipo, async (caminho, blob) => {
        const token = await obterToken();
        if (!token) throw new Error('Faça login para enviar imagens.');
        const r = await fetch(`${URL_UPLOAD}/upload?key=${encodeURIComponent(caminho)}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/webp' },
            body: blob,
        });
        if (!r.ok) throw new Error(`Falha ao enviar a imagem (${r.status}): ${await r.text().catch(() => '')}`);
        return `${URL_LEITURA}/${caminho}`;
    });
