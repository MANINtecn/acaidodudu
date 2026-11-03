/* Aviso de pedido novo com o celular bloqueado ou o navegador fechado (Web Push).
 * Carregado pelo service worker do PWA (vite.config.ts: workbox.importScripts).
 * O servidor (api/push-pedido.js) manda { titulo, texto, tag, url } a cada pedido novo e repete o lembrete
 * enquanto o pedido seguir sem resposta; a mesma tag troca o aviso anterior e renotify faz tocar de novo. */

self.addEventListener('push', function (event) {
    var d = {};
    try { d = event.data ? event.data.json() : {}; } catch (e) { d = { texto: event.data ? event.data.text() : '' }; }
    var opcoes = {
        body: d.texto || 'Chegou um pedido.',
        tag: d.tag || 'pedido-novo',
        renotify: true,
        requireInteraction: true,
        vibrate: [500, 200, 500, 200, 500, 200, 500],
        icon: d.icone || '/pwa-192x192.png',
        badge: d.icone || '/pwa-192x192.png',
        data: { url: d.url || '/' },
    };
    event.waitUntil(self.registration.showNotification(d.titulo || 'Novo pedido!', opcoes));
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    var alvo = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (janelas) {
            for (var i = 0; i < janelas.length; i++) {
                if (janelas[i].url.indexOf(alvo) === 0 && 'focus' in janelas[i]) return janelas[i].focus();
            }
            return self.clients.openWindow(alvo);
        })
    );
});
