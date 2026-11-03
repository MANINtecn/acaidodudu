/**
 * Aviso de pedido novo com o celular bloqueado (Web Push), lado do aparelho do lojista.
 * Registra este aparelho no banco (função push_registrar) para o servidor mandar a notificação a cada pedido novo.
 * No iPhone só funciona com o app instalado na tela inicial (iOS 16.4 ou mais novo).
 */
import { supabase } from './supabaseService';

const CHAVE_PUBLICA = ((import.meta as any).env?.VITE_VAPID_PUBLIC_KEY || '') as string;

export type ResultadoPush = { ok: true } | { ok: false; motivo: string };

export const pushSuportado = (): boolean =>
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!CHAVE_PUBLICA && location.protocol.startsWith('http');

const paraBytes = (b64: string): Uint8Array => {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const bin = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
};

const iosNaoInstalado = (): boolean => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const instalado = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    return ios && !instalado;
};

async function registroDoServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    const pronto = navigator.serviceWorker.ready;
    const limite = new Promise<null>(r => setTimeout(() => r(null), 8000));
    return Promise.race([pronto, limite]);
}

async function gravar(storeId: string, sub: PushSubscription): Promise<void> {
    const j = sub.toJSON();
    if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) throw new Error('assinatura incompleta');
    const { error } = await supabase.rpc('push_registrar', {
        p_store: storeId, p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth,
        p_dispositivo: (navigator.userAgent || '').slice(0, 200),
    });
    if (error) throw error;
}

/** Pede permissão, assina o aviso neste aparelho e registra no banco. Chamar a partir de um toque do lojista. */
export async function ativarPush(storeId: string): Promise<ResultadoPush> {
    if (iosNaoInstalado()) return { ok: false, motivo: 'No iPhone, instale o app na tela inicial (Compartilhar, Adicionar à Tela de Início) e abra por ele.' };
    if (!pushSuportado()) return { ok: false, motivo: 'Este navegador ou aparelho não recebe avisos com a tela bloqueada.' };
    try {
        const permissao = await Notification.requestPermission();
        if (permissao !== 'granted') return { ok: false, motivo: 'As notificações estão bloqueadas. Libere nas configurações do navegador para este site.' };
        const reg = await registroDoServiceWorker();
        if (!reg) return { ok: false, motivo: 'O aplicativo ainda está carregando. Tente de novo em instantes.' };
        let sub = await reg.pushManager.getSubscription();
        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: paraBytes(CHAVE_PUBLICA) as BufferSource });
        await gravar(storeId, sub);
        return { ok: true };
    } catch (e: any) {
        return { ok: false, motivo: `Não foi possível ligar o aviso: ${e?.message || e}` };
    }
}

/** Se o aviso já estava ligado neste aparelho, renova o registro em silêncio (a assinatura pode ter mudado). */
export async function renovarPushSeJaAtivo(storeId: string): Promise<boolean> {
    try {
        if (!pushSuportado() || Notification.permission !== 'granted') return false;
        const reg = await registroDoServiceWorker();
        const sub = await reg?.pushManager.getSubscription();
        if (!sub) return false;
        await gravar(storeId, sub);
        return true;
    } catch (_) { return false; }
}
