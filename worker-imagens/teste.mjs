// node worker-imagens/teste.mjs  -- R2 e banco falsos; prova cada regra do Worker.
import worker from './src/index.js';

const LOJA_A = '11111111-1111-1111-1111-111111111111';
const LOJA_B = '22222222-2222-2222-2222-222222222222';
const guardado = new Map();
const env = {
    SUPABASE_URL: 'https://banco.falso', SUPABASE_ANON_KEY: 'anon', ORIGENS_PERMITIDAS: '*',
    IMAGENS: {
        head: async (k) => (guardado.has(k) ? {} : null),
        get: async (k) => (guardado.has(k) ? { body: guardado.get(k), httpEtag: '"x"' } : null),
        put: async (k, v) => { guardado.set(k, v); },
    },
};
// Banco falso: o token "dono-a" é dono da loja A; o resto não é de ninguém.
globalThis.fetch = async (_url, init) => {
    const token = (init.headers.Authorization || '').replace('Bearer ', '');
    const sid = JSON.parse(init.body).sid;
    return new Response(JSON.stringify(token === 'dono-a' && sid === LOJA_A), { status: 200 });
};

const webp = (n) => { const b = new Uint8Array(n); b.set([...'RIFF'].map(c => c.charCodeAt(0)), 0); b.set([...'WEBP'].map(c => c.charCodeAt(0)), 8); return b; };
const chave = (loja, tipo = 'produto', h = 'a'.repeat(16)) => `${loja}/${tipo}/${h}.webp`;
const put = (key, corpo, token) => worker.fetch(new Request(`https://w/upload?key=${encodeURIComponent(key)}`, { method: 'PUT', body: corpo, headers: token ? { Authorization: `Bearer ${token}` } : {} }), env);

let falhas = 0;
const confere = async (nome, resp, esperado) => { const r = await resp; const ok = r.status === esperado; if (!ok) falhas++; console.log(ok ? 'ok   ' : 'FALHA', nome, '->', r.status, ok ? '' : `(esperado ${esperado})`); return r; };

await confere('sem login', put(chave(LOJA_A), webp(500)), 401);
await confere('login de outro (loja B)', put(chave(LOJA_B), webp(500), 'dono-a'), 403);
await confere('token qualquer na loja A', put(chave(LOJA_A), webp(500), 'intruso'), 403);
await confere('chave com ../', put(`${LOJA_A}/produto/../x.webp`, webp(500), 'dono-a'), 400);
await confere('tipo inválido', put(chave(LOJA_A, 'script'), webp(500), 'dono-a'), 400);
await confere('não é WebP (png)', put(chave(LOJA_A), new Uint8Array(500).fill(7), 'dono-a'), 415);
await confere('produto grande demais', put(chave(LOJA_A), webp(200 * 1024), 'dono-a'), 413);
await confere('produto ok', put(chave(LOJA_A), webp(5000), 'dono-a'), 200);
const rep = await confere('mesmo conteúdo de novo (já existe)', put(chave(LOJA_A), webp(5000), 'dono-a'), 200);
if (!(await rep.json()).jaExistia) { falhas++; console.log('FALHA não marcou jaExistia'); }
const get = await confere('leitura', worker.fetch(new Request(`https://w/${chave(LOJA_A)}`), env), 200);
const cache = get.headers.get('Cache-Control');
if (cache !== 'public, max-age=31536000, immutable') { falhas++; console.log('FALHA cache:', cache); } else console.log('ok    cache de 1 ano, imutável');
await confere('leitura de chave inexistente', worker.fetch(new Request(`https://w/${chave(LOJA_A, 'logo')}`), env), 404);
await confere('leitura de caminho estranho', worker.fetch(new Request('https://w/etc/passwd'), env), 404);
await confere('POST não permitido', worker.fetch(new Request('https://w/upload', { method: 'POST' }), env), 405);

console.log(falhas === 0 ? '\nTODOS OK' : `\n${falhas} FALHA(S)`);
process.exit(falhas ? 1 : 0);
