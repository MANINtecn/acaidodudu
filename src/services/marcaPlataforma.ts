/**
 * Marca da plataforma (logo e cores do Pede Aqui), definida no Super Admin e lida por todo o site.
 *
 * Regra de identidade: telas da plataforma mostram a marca do Pede Aqui; telas de uma loja mostram a marca
 * da loja; loja sem logo mostra a do Pede Aqui (nunca a de outra loja).
 */
import { useSyncExternalStore } from 'react';
import { supabase } from './supabaseService';

export type MarcaPlataforma = { nome: string; logo_url: string | null; cor_primaria: string; cor_secundaria: string };

export const MARCA_PADRAO: MarcaPlataforma = { nome: 'Pede Aqui', logo_url: null, cor_primaria: '#ea580c', cor_secundaria: '#f59e0b' };
/** Ícone provisório, usado enquanto o Super Admin não sobe a logo oficial. */
export const ICONE_PADRAO = '/pedeaqui-padrao.svg';

const CHAVE_CACHE = 'pedeaqui_marca';
const COR = /^#[0-9a-f]{6}$/i;

const limpar = (m: any): MarcaPlataforma => ({
    nome: (typeof m?.nome === 'string' && m.nome.trim()) || MARCA_PADRAO.nome,
    logo_url: typeof m?.logo_url === 'string' && m.logo_url ? m.logo_url : null,
    cor_primaria: COR.test(m?.cor_primaria || '') ? m.cor_primaria : MARCA_PADRAO.cor_primaria,
    cor_secundaria: COR.test(m?.cor_secundaria || '') ? m.cor_secundaria : MARCA_PADRAO.cor_secundaria,
});

const lerCache = (): MarcaPlataforma => {
    try { const t = localStorage.getItem(CHAVE_CACHE); if (t) return limpar(JSON.parse(t)); } catch (_) { /* sem storage */ }
    return MARCA_PADRAO;
};

let atual: MarcaPlataforma = lerCache();
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach(f => f());

export const marcaAtual = (): MarcaPlataforma => atual;
const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
export const useMarca = (): MarcaPlataforma => useSyncExternalStore(assinar, marcaAtual, marcaAtual);

const definir = (m: MarcaPlataforma) => {
    atual = m;
    try { localStorage.setItem(CHAVE_CACHE, JSON.stringify(m)); } catch (_) { /* sem storage */ }
    avisar();
};

/** Lê a marca no banco (leitura pública). Sem rede ou sem a tabela, segue com o cache ou o padrão. */
export async function carregarMarca(): Promise<MarcaPlataforma> {
    try {
        const { data } = await supabase.from('plataforma_marca').select('nome,logo_url,cor_primaria,cor_secundaria').eq('id', 1).maybeSingle();
        if (data) definir(limpar(data));
    } catch (_) { /* mantém o que já tinha */ }
    return atual;
}

export async function salvarMarca(m: MarcaPlataforma): Promise<void> {
    const v = limpar(m);
    const { error } = await supabase.from('plataforma_marca').upsert(
        { id: 1, nome: v.nome, logo_url: v.logo_url, cor_primaria: v.cor_primaria, cor_secundaria: v.cor_secundaria, atualizado_em: new Date().toISOString() },
        { onConflict: 'id' });
    if (error) throw error;
    definir(v);
}

/** Quadrado de 512 px em PNG (mantém transparência), para servir de ícone de aba, de app e de cabeçalho. */
async function quadradoPng(file: File): Promise<Blob> {
    const img = await createImageBitmap(file, { imageOrientation: 'from-image' } as any);
    const lado = 512;
    const canvas = document.createElement('canvas');
    canvas.width = lado; canvas.height = lado;
    const esc = Math.min(lado / img.width, lado / img.height);
    const w = Math.round(img.width * esc), h = Math.round(img.height * esc);
    canvas.getContext('2d')!.drawImage(img, Math.round((lado - w) / 2), Math.round((lado - h) / 2), w, h);
    img.close?.();
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('Não foi possível preparar a imagem.');
    return blob;
}

/** Sobe a logo da plataforma para o bucket público `assets` (pasta plataforma/). Devolve a URL pública. */
export async function enviarLogoDaPlataforma(file: File): Promise<string> {
    const png = await quadradoPng(file);
    const buf = await crypto.subtle.digest('SHA-256', await png.arrayBuffer());
    const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
    const caminho = `plataforma/logo_${hash}.png`;
    const { error } = await supabase.storage.from('assets').upload(caminho, png, { upsert: false, cacheControl: '31536000', contentType: 'image/png' });
    if (error && !/already exists|duplicate/i.test(error.message)) throw error;
    return supabase.storage.from('assets').getPublicUrl(caminho).data.publicUrl;
}

/** Escolhe preto ou branco para o texto sobre uma cor de fundo. */
export const textoSobre = (hex: string): string => {
    if (!COR.test(hex)) return '#ffffff';
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#1a1a1a' : '#ffffff';
};

// ---- identidade da aba e do app instalado ----

let manifestoOriginal: string | null = null;
let manifestoBlob: string | null = null;

const tipoDaImagem = (url: string) => /\.svg(\?|$)/i.test(url) ? 'image/svg+xml' : /\.webp(\?|$)/i.test(url) ? 'image/webp' : /\.jpe?g(\?|$)/i.test(url) ? 'image/jpeg' : 'image/png';

const pegarLink = (seletor: string, rel: string): HTMLLinkElement => {
    let l = document.querySelector<HTMLLinkElement>(seletor);
    if (!l) { l = document.createElement('link'); l.rel = rel; document.head.appendChild(l); }
    return l;
};

/**
 * Aplica o ícone da aba, a cor do navegador, o título e o manifesto do app instalado.
 * Com loja: logo e nome da loja (se a loja não tem logo, a da plataforma). Sem loja: a marca do Pede Aqui.
 */
export function aplicarIdentidade(loja: { name?: string | null; slug?: string | null; logo_url?: string | null } | null) {
    if (typeof document === 'undefined') return;
    const marca = atual;
    const icone = loja?.logo_url || marca.logo_url || ICONE_PADRAO;

    const link = pegarLink("link[rel='icon']", 'icon');
    link.removeAttribute('type');
    link.href = icone;
    const apple = pegarLink("link[rel='apple-touch-icon']", 'apple-touch-icon');
    apple.href = icone;

    const meta = document.querySelector<HTMLMetaElement>("meta[name='theme-color']");
    if (meta) meta.content = marca.cor_primaria;

    document.title = (loja?.name || marca.nome).toUpperCase();

    // Manifesto: só no site (no .exe a origem é file://).
    if (!location.protocol.startsWith('http')) return;
    const m = pegarLink("link[rel='manifest']", 'manifest');
    if (manifestoOriginal === null) manifestoOriginal = m.getAttribute('href') || '/manifest.webmanifest';
    if (manifestoBlob) { URL.revokeObjectURL(manifestoBlob); manifestoBlob = null; }
    if (!loja && !marca.logo_url) { m.href = manifestoOriginal; return; }
    const abs = (u: string) => new URL(u, location.origin).href;
    const nome = loja?.name || marca.nome;
    const manifesto = {
        name: nome,
        short_name: nome.length > 12 ? nome.slice(0, 12).trim() : nome,
        start_url: loja?.slug ? `${location.origin}/${loja.slug}` : `${location.origin}/`,
        scope: `${location.origin}/`,
        display: 'standalone',
        orientation: 'portrait',
        theme_color: marca.cor_primaria,
        background_color: '#ffffff',
        icons: [
            { src: abs(icone), sizes: '512x512', type: tipoDaImagem(icone), purpose: 'any' },
            { src: abs(icone), sizes: '192x192', type: tipoDaImagem(icone), purpose: 'any' },
        ],
    };
    manifestoBlob = URL.createObjectURL(new Blob([JSON.stringify(manifesto)], { type: 'application/manifest+json' }));
    m.href = manifestoBlob;
}
