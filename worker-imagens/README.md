# Worker de imagens (Cloudflare R2)

Recebe a imagem já comprimida (WebP), confere que quem envia é dono da loja e grava no R2.
Regras e testes: `node teste.mjs` (R2 e banco falsos, sem rede).

## Colocar no ar (uma vez)

1. Conta na Cloudflare (grátis). No terminal, dentro desta pasta:
   ```
   npx wrangler login
   npx wrangler r2 bucket create imagens-saas
   ```
2. Em `wrangler.toml`, troque `COLE_A_ANON_KEY_AQUI` pela `VITE_SUPABASE_ANON_KEY` do `.env` (é a chave pública).
3. `npx wrangler deploy`  → ele mostra o endereço, tipo `https://imagens-saas.SUACONTA.workers.dev`.
4. **Leitura pelo domínio próprio** (recomendado: a leitura não passa pelo Worker e não gasta a cota dele):
   Cloudflare, R2, bucket `imagens-saas`, Settings, Custom Domains, adicionar `img.tecx.pro`.
   Exige que o DNS do `tecx.pro` esteja na Cloudflare.
5. No `.env` do app (e nas variáveis do Vercel):
   ```
   VITE_IMAGENS_UPLOAD_URL=https://imagens-saas.SUACONTA.workers.dev
   VITE_IMAGENS_CDN_URL=https://img.tecx.pro
   ```
   Sem `VITE_IMAGENS_UPLOAD_URL` o app continua enviando para o Supabase Storage, como antes.

## Como as imagens ficam
`<store_id>/<produto|logo|hero>/<hash do conteúdo>.webp` (+ `_t.webp`, miniatura de 400 px, só para produto).
Cache de 1 ano e imutável: a mesma foto nunca é baixada duas vezes pelo mesmo aparelho.
