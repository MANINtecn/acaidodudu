/**
 * Worker de imagens do SaaS (Cloudflare R2).
 *
 * ESCRITA  PUT /upload?key=<store_id>/<tipo>/<hash>[_t].webp
 *   - exige o login do Supabase (Authorization: Bearer <access_token>)
 *   - só deixa gravar na pasta da PRÓPRIA loja (pergunta ao banco: owns_store)
 *   - só WebP pequeno; nome = hash do conteúdo, então nunca sobrescreve nada
 *
 * LEITURA  GET /<key>   (só usada se o bucket NÃO estiver ligado a um domínio público;
 *   com domínio próprio no R2 a leitura nem passa por aqui e não gasta requisição do Worker)
 *   - cache de 1 ano, imutável
 *
 * Nenhuma chave do R2 vai para o app: o Worker usa o bucket pelo binding IMAGENS.
 */

const CHAVE_VALIDA = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(produto|logo|hero)\/[0-9a-f]{16,64}(_t)?\.webp$/;
const LIMITE_BYTES = { produto: 150 * 1024, logo: 100 * 1024, hero: 400 * 1024 };
const UM_ANO = 'public, max-age=31536000, immutable';

const cors = (env, origem) => {
    const permitidas = (env.ORIGENS_PERMITIDAS || '*').split(',').map(s => s.trim());
    const ok = permitidas.includes('*') || (origem && permitidas.includes(origem));
    return {
        'Access-Control-Allow-Origin': ok ? (permitidas.includes('*') ? '*' : origem) : 'null',
        'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
    };
};

const resposta = (corpo, status, env, req, extra = {}) =>
    new Response(corpo, { status, headers: { ...cors(env, req.headers.get('Origin')), ...extra } });

const ehWebp = (bytes) =>
    bytes.length > 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';

/** Pergunta ao banco, COM o login do usuário, se ele é dono da loja (função owns_store do RLS). */
async function ehDonoDaLoja(env, token, storeId) {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/owns_store`, {
        method: 'POST',
        headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid: storeId }),
    });
    if (!r.ok) return false;
    return (await r.json()) === true;
}

export default {
    async fetch(req, env) {
        const url = new URL(req.url);

        if (req.method === 'OPTIONS') return resposta(null, 204, env, req);

        if (req.method === 'PUT' && url.pathname === '/upload') {
            const key = url.searchParams.get('key') || '';
            const m = CHAVE_VALIDA.exec(key);
            if (!m) return resposta('chave inválida', 400, env, req);
            const [, storeId, tipo] = m;

            const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
            if (!token) return resposta('sem login', 401, env, req);
            if (!(await ehDonoDaLoja(env, token, storeId))) return resposta('sem permissão nesta loja', 403, env, req);

            const limite = LIMITE_BYTES[tipo];
            const declarado = Number(req.headers.get('Content-Length') || 0);
            if (declarado > limite) return resposta('arquivo grande demais', 413, env, req);

            // Mesmo nome = mesmo conteúdo (hash): se já existe, não grava de novo.
            if (await env.IMAGENS.head(key)) return resposta(JSON.stringify({ ok: true, key, jaExistia: true }), 200, env, req, { 'Content-Type': 'application/json' });

            const bytes = new Uint8Array(await req.arrayBuffer());
            if (bytes.length === 0 || bytes.length > limite) return resposta('tamanho inválido', 413, env, req);
            if (!ehWebp(bytes)) return resposta('só WebP', 415, env, req);

            await env.IMAGENS.put(key, bytes, { httpMetadata: { contentType: 'image/webp', cacheControl: UM_ANO } });
            return resposta(JSON.stringify({ ok: true, key }), 200, env, req, { 'Content-Type': 'application/json' });
        }

        if (req.method === 'GET' || req.method === 'HEAD') {
            const key = decodeURIComponent(url.pathname.slice(1));
            if (!CHAVE_VALIDA.test(key)) return resposta('não encontrado', 404, env, req);
            const obj = await env.IMAGENS.get(key);
            if (!obj) return resposta('não encontrado', 404, env, req);
            return resposta(req.method === 'HEAD' ? null : obj.body, 200, env, req, {
                'Content-Type': 'image/webp', 'Cache-Control': UM_ANO, ETag: obj.httpEtag,
            });
        }

        return resposta('método não permitido', 405, env, req);
    },
};
