# 🚀 Como Lançar uma Atualização (Auto-Update)

Para que o sistema se atualize sozinho nos computadores, não basta apenas salvar o código. Você precisa seguir estes 3 passos simples:

## 1. Alterar a Versão

Abra o arquivo `package.json` e aumente o número da versão.
_Exemplo:_ De `"version": "1.0.0"` para `"version": "1.0.1"`.

> 💡 **Dica:** Se você me pedir "Prepare uma nova versão", eu posso fazer isso para você!

## 2. Gerar o Executável (Build)

Rode o comando de construção para criar o novo instalador `.exe`:

```bash
npm run electron:build
```

_Isso vai criar o arquivo na pasta `dist-electron`._

## 3. Publicar no GitHub (O Pulo do Gato 🐱)

O sistema de atualização automática busca novas versões nas **Releases do GitHub**.

1. Vá no seu repositório no GitHub.
2. Clique em **Releases** (na direita) > **Draft a new release**.
3. Em "Choose a tag", crie a tag da versão (ex: `v1.0.1`).
4. Coloque um título (ex: "Correção de Bugs").
5. **IMPORTANTE:** Arraste o arquivo `.exe` gerado (da pasta `dist-electron`) para a área de anexos.
6. Clique em **Publish release**.

---

**Pronto!**
Assim que você clicar em "Publish", todos os computadores com o sistema aberto verão o botão de atualização lá em cima.
