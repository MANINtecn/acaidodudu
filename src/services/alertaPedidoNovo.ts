import { useEffect, useRef } from 'react';
import { tocarSirene } from './sireneService';

/**
 * Alerta de pedido novo para o celular do lojista (02/11/2026).
 * Enquanto houver pedido novo ainda não visto (status "Novo"):
 *  - repete a campainha a cada 8 s, alto, até o lojista confirmar que viu o pedido (os pedidos entram já aceitos:
 *    não há aceitar ou recusar, só "recebi");
 *  - pisca o título da aba e vibra;
 *  - mostra uma notificação do sistema por pedido novo (se o lojista permitiu).
 * E, com o alerta ligado, pede ao celular para não apagar a tela (Wake Lock) enquanto o painel está aberto.
 * Não cobre o celular bloqueado ou o app fechado: isso exige notificação push de servidor.
 */
const INTERVALO_REPETICAO_MS = 8000;
const VOLUME_DO_ALERTA = 8; // bem chato de proposito: pedido novo nao pode passar batido

type WakeLockSentinelLike = { release: () => Promise<void> };

export async function pedirPermissaoDeNotificacao(): Promise<NotificationPermission | 'indisponivel'> {
    if (typeof Notification === 'undefined') return 'indisponivel';
    if (Notification.permission !== 'default') return Notification.permission;
    try { return await Notification.requestPermission(); } catch { return 'indisponivel'; }
}

export function usarAlertaDePedidoNovo(opcoes: { ligado: boolean; novos: { id?: string; numero?: number | string }[] }) {
    const { ligado, novos } = opcoes;
    const jaNotificados = useRef<Set<string>>(new Set());
    const tituloOriginal = useRef<string>(typeof document !== 'undefined' ? document.title : '');

    // Tela acesa enquanto o alerta esta ligado e a pagina visivel.
    useEffect(() => {
        if (!ligado || typeof navigator === 'undefined' || !(navigator as any).wakeLock) return;
        let trava: WakeLockSentinelLike | null = null;
        let cancelado = false;
        const pegar = async () => {
            try {
                if (document.visibilityState !== 'visible') return;
                const t = await (navigator as any).wakeLock.request('screen');
                if (cancelado) { t.release().catch(() => {}); return; }
                trava = t;
            } catch { /* sem suporte ou bateria fraca: segue sem */ }
        };
        pegar();
        const aoVoltar = () => { if (document.visibilityState === 'visible') pegar(); };
        document.addEventListener('visibilitychange', aoVoltar);
        return () => {
            cancelado = true;
            document.removeEventListener('visibilitychange', aoVoltar);
            trava?.release().catch(() => {});
        };
    }, [ligado]);

    // Sirene repetida, titulo piscando, vibracao.
    const quantos = novos.length;
    useEffect(() => {
        if (!ligado || quantos === 0) {
            if (typeof document !== 'undefined') document.title = tituloOriginal.current;
            return;
        }
        const tocar = () => {
            tocarSirene('campainha', VOLUME_DO_ALERTA);
            try { navigator.vibrate?.([300, 150, 300]); } catch { /* sem vibracao */ }
        };
        let aceso = false;
        const piscar = setInterval(() => {
            aceso = !aceso;
            document.title = aceso ? `(${quantos}) NOVO PEDIDO!` : tituloOriginal.current;
        }, 1000);
        const repetir = setInterval(tocar, INTERVALO_REPETICAO_MS);
        return () => {
            clearInterval(piscar);
            clearInterval(repetir);
            document.title = tituloOriginal.current;
        };
    }, [ligado, quantos]);

    // Notificacao do sistema, uma vez por pedido.
    useEffect(() => {
        if (!ligado || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        for (const p of novos) {
            const chave = String(p.id || p.numero || '');
            if (!chave || jaNotificados.current.has(chave)) continue;
            jaNotificados.current.add(chave);
            try {
                const n = new Notification('Novo pedido!', { body: p.numero ? `Pedido #${p.numero} chegou` : 'Chegou um pedido', tag: `pedido-${chave}`, requireInteraction: true });
                n.onclick = () => { window.focus(); n.close(); };
            } catch { /* alguns navegadores moveis so aceitam notificacao pelo service worker */ }
        }
    }, [ligado, novos]);
}
