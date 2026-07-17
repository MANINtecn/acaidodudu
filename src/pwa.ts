import { registerSW } from 'virtual:pwa-register'

export function registerPWA() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    registerSW({
      onNeedRefresh() {
        if (confirm('Nova versão disponível! Deseja recarregar para atualizar?')) {
          window.location.reload();
        }
      },
      onOfflineReady() {
        console.log('Aplicativo pronto para trabalhar offline.');
      },
    })
  }
}
