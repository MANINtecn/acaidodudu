import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    react(),
    // LEGACY SO NO SITE, NUNCA NO ELECTRON.
    //
    // O .exe carrega por file:// (main.js: loadFile). Nesse protocolo a flag
    // window.__vite_is_modern_browser nem sempre e definida, e o script inline
    // do plugin injeta o bundle legacy POR CIMA do moderno:
    //
    //     if (window.__vite_is_modern_browser) return;   // nao retorna
    //
    // Resultado: DOIS AdminPage rodando ao mesmo tempo, com dois pollings,
    // dois realtime, dois caches de estacao e dois listeners de teclado.
    // Foi a causa de: sirene tocando com escopo "mudo", impressao em 2 vias,
    // campo de nome travando "as vezes" e o checkout "travado por tras".
    // Visivel no console: a mesma linha duas vezes, uma de AdminPage-*.js e
    // outra de AdminPage-legacy-*.js.
    //
    // O Electron 31 embute o Chrome 126: nunca precisou de legacy.
    // O site (Vercel) continua com ele, para celular antigo abrir o cardapio.
    ...(mode === 'electron' ? [] : [
      legacy({
        targets: ['defaults', 'not IE 11', 'chrome >= 49', 'android >= 5'],
      }),
    ]),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['pwa-192x192.png', 'pwa-512x512.png', 'icon.png'],
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      manifest: {
        name: 'Açaí do Dudu',
        short_name: 'Açaí do Dudu',
        description: 'Peça o melhor açaí da cidade com a entrega mais rápida!',
        theme_color: '#7C3AED',
        background_color: '#2E1065',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
}))
