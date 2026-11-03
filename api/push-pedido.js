/**
 * Envia o aviso de pedido novo (Web Push) para os celulares do lojista. Função serverless da Vercel.
 *
 * Quem chama: o banco (gatilho orders_push e a rotina push_lembretes, via pg_net) com o cabeçalho x-push-segredo.
 * Quem recebe: os aparelhos que o lojista registrou (tabela push_assinaturas).
 * O banco só entrega as assinaturas se o segredo bater (função push_para_pedido), então este endereço não serve
 * para mandar aviso nem para ler assinaturas sem o segredo.
 *
 * Variáveis na Vercel: PUSH_SEGREDO, VAPID_PUBLIC_KEY (ou VITE_VAPID_PUBLIC_KEY), VAPID_PRIVATE_KEY,
 * e as do Supabase que o site já usa (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
 */
import crypto from 'node:crypto';
import webpush from 'web-push';

const iguais = (a, b) => {
    const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const brl = (v) => `R$ ${(Number(v) || 0).toFixed(2).replace('.', ',')}`;

/** Núcleo sem dependência de ambiente (para testar com dados falsos). Devolve { status, corpo }. */
export async function tratar({ segredoRecebido, corpo, env, buscar, enviar }) {
    if (!env.PUSH_SEGREDO || !iguais(segredoRecebido, env.PUSH_SEGREDO)) return { status: 401, corpo: { erro: 'negado' } };
    const orderId = corpo && corpo.order_id;
    if (!orderId || typeof orderId !== 'string') return { status: 400, corpo: { erro: 'pedido ausente' } };

    const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
    const chave = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
    const rpc = async (nome, args) => {
        const r = await buscar(`${base}/rest/v1/rpc/${nome}`, {
            method: 'POST',
            headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(args),
        });
        const t = await r.text();
        if (!r.ok) throw new Error(`${nome}: ${r.status} ${t.slice(0, 120)}`);
        return t ? JSON.parse(t) : null;
    };

    const info = await rpc('push_para_pedido', { p_order: orderId, p_segredo: env.PUSH_SEGREDO });
    if (!info || !info.enviar || !Array.isArray(info.subs) || info.subs.length === 0) return { status: 200, corpo: { enviados: 0, motivo: 'nada a enviar' } };

    const lembrete = !!(corpo && corpo.lembrete);
    const numero = info.numero ? `#${info.numero}` : '';
    const mensagem = JSON.stringify({
        titulo: lembrete ? 'Pedido esperando você!' : 'Novo pedido!',
        texto: `${info.loja ? info.loja + ': ' : ''}pedido ${numero} de ${brl(info.total)} (${String(info.tipo || '').toLowerCase()}). ${lembrete ? 'Ainda não foi recebido.' : 'Toque para abrir.'}`.replace('pedido  ', 'pedido '),
        tag: `pedido-${orderId}`,
        url: `/${info.slug || ''}/admin`,
    });

    const mortos = [];
    let enviados = 0;
    await Promise.all(info.subs.map(async (s) => {
        try {
            await enviar({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, mensagem, { TTL: 900, urgency: 'high' });
            enviados++;
        } catch (e) {
            // 404/410: o aparelho cancelou o aviso ou limpou o navegador; some da lista
            if (e && (e.statusCode === 404 || e.statusCode === 410)) mortos.push(s.id);
        }
    }));
    if (mortos.length) { try { await rpc('push_remover', { p_ids: mortos, p_segredo: env.PUSH_SEGREDO }); } catch (_) { /* tenta de novo no próximo envio */ } }
    return { status: 200, corpo: { enviados, removidos: mortos.length } };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ erro: 'metodo' });
    const env = process.env;
    const pub = env.VAPID_PUBLIC_KEY || env.VITE_VAPID_PUBLIC_KEY;
    if (!pub || !env.VAPID_PRIVATE_KEY) return res.status(500).json({ erro: 'VAPID não configurado' });
    webpush.setVapidDetails(env.VAPID_ASSUNTO || 'https://pedeaki.tecx.pro', pub, env.VAPID_PRIVATE_KEY);

    let corpo = req.body;
    if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch (_) { corpo = null; } }
    try {
        const r = await tratar({
            segredoRecebido: req.headers['x-push-segredo'],
            corpo, env,
            buscar: fetch,
            enviar: (sub, msg, opc) => webpush.sendNotification(sub, msg, opc),
        });
        return res.status(r.status).json(r.corpo);
    } catch (e) {
        return res.status(500).json({ erro: String((e && e.message) || e).slice(0, 200) });
    }
}
