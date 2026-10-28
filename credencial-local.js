/**
 * Login offline do app de PC (28/10/2026).
 *
 * Depois de um login com internet, o computador guarda só uma "impressão" da senha (scrypt com sal),
 * nunca a senha. Sem internet, a tela de login confere a senha digitada contra essa impressão.
 * O arquivo é criptografado com o safeStorage do Electron (no Windows, a proteção da conta do usuário);
 * sem isso, fica só com a impressão (que já não revela a senha).
 *
 * Falhas seguidas travam o login por um tempo que cresce (5 erros: 1 min, depois dobra, até 15 min).
 * Este arquivo roda no processo principal do Electron (main.js) e não importa nada do Electron: quem
 * chama passa o safeStorage e a pasta, e assim dá para testar sozinho.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";

const PARAMS = { N: 16384, r: 8, p: 1, keylen: 32 };
const ERROS_ATE_TRAVAR = 5;
const TRAVA_BASE_MS = 60_000;
const TRAVA_MAXIMA_MS = 15 * 60_000;
const SENHA_MAXIMA = 256;
const ARQUIVO = "credenciais.dat";

const normalizarEmail = (e) => String(e || "").trim().toLowerCase();
const normalizarSenha = (s) => String(s ?? "").normalize("NFKC");

function impressao(senha, salt, params) {
  return crypto.scryptSync(senha, salt, params.keylen, { N: params.N, r: params.r, p: params.p, maxmem: 128 * params.N * params.r * 2 });
}

export function criarCredenciais({ dir, safeStorage = null, agora = () => Date.now(), log = () => {} }) {
  const caminho = path.join(dir, ARQUIVO);

  const podeCifrar = () => {
    try { return !!safeStorage && safeStorage.isEncryptionAvailable(); } catch (_) { return false; }
  };

  function carregar() {
    for (const arq of [caminho, caminho + ".bak"]) {
      try {
        if (!fs.existsSync(arq)) continue;
        const bruto = fs.readFileSync(arq, "utf8");
        let json;
        if (bruto.startsWith("enc1:")) {
          if (!podeCifrar()) { log("[Credencial] arquivo cifrado, mas a criptografia do Windows não está disponível"); continue; }
          json = safeStorage.decryptString(Buffer.from(bruto.slice(5), "base64"));
        } else if (bruto.startsWith("txt1:")) {
          json = bruto.slice(5);
        } else {
          continue;
        }
        const dados = JSON.parse(json);
        if (dados && dados.formato === 1 && dados.contas && typeof dados.contas === "object") return dados;
      } catch (e) {
        log(`[Credencial] falha ao ler ${arq}: ${e.message}`);
      }
    }
    return { formato: 1, contas: {} };
  }

  function gravar(dados) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const json = JSON.stringify(dados);
    const conteudo = podeCifrar() ? "enc1:" + safeStorage.encryptString(json).toString("base64") : "txt1:" + json;
    const tmp = caminho + ".tmp";
    const fd = fs.openSync(tmp, "w");
    try { fs.writeSync(fd, conteudo); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (fs.existsSync(caminho)) fs.copyFileSync(caminho, caminho + ".bak");
    fs.renameSync(tmp, caminho);
  }

  return {
    /** Guarda (ou renova) a impressão da senha de quem acabou de entrar COM internet. */
    salvar(email, senha, userId) {
      const e = normalizarEmail(email);
      const s = normalizarSenha(senha);
      if (!e || !s || s.length > SENHA_MAXIMA) return { ok: false, motivo: "invalido" };
      const dados = carregar();
      const salt = crypto.randomBytes(16);
      dados.contas[e] = {
        salt: salt.toString("base64"), hash: impressao(s, salt, PARAMS).toString("base64"), ...PARAMS,
        userId: userId || dados.contas[e]?.userId || null, salvoEm: agora(), falhas: 0, travadoAte: 0,
      };
      try { gravar(dados); } catch (err) { log(`[Credencial] FALHA AO GRAVAR: ${err.message}`); return { ok: false, motivo: "disco", erro: err.message }; }
      return { ok: true };
    },

    /** Confere a senha digitada contra a impressão guardada (login sem internet). */
    conferir(email, senha) {
      const e = normalizarEmail(email);
      const s = normalizarSenha(senha);
      const dados = carregar();
      const conta = dados.contas[e];
      if (!conta) return { ok: false, motivo: "sem-credencial" };
      const t = agora();
      if (conta.travadoAte && conta.travadoAte > t) return { ok: false, motivo: "travado", esperaMs: conta.travadoAte - t };
      let certa = false;
      if (s && s.length <= SENHA_MAXIMA) {
        try {
          const esperado = Buffer.from(conta.hash, "base64");
          const obtido = impressao(s, Buffer.from(conta.salt, "base64"), { N: conta.N, r: conta.r, p: conta.p, keylen: esperado.length });
          certa = obtido.length === esperado.length && crypto.timingSafeEqual(obtido, esperado);
        } catch (_) { certa = false; }
      }
      if (certa) {
        if (conta.falhas || conta.travadoAte) { conta.falhas = 0; conta.travadoAte = 0; try { gravar(dados); } catch (_) { /* segue */ } }
        return { ok: true, userId: conta.userId };
      }
      conta.falhas = (conta.falhas || 0) + 1;
      let esperaMs = 0;
      if (conta.falhas >= ERROS_ATE_TRAVAR) {
        esperaMs = Math.min(TRAVA_BASE_MS * Math.pow(2, conta.falhas - ERROS_ATE_TRAVAR), TRAVA_MAXIMA_MS);
        conta.travadoAte = t + esperaMs;
      }
      try { gravar(dados); } catch (_) { /* a contagem em memória não existe; pior caso: não conta */ }
      return esperaMs ? { ok: false, motivo: "senha", travado: true, esperaMs } : { ok: false, motivo: "senha", restantes: ERROS_ATE_TRAVAR - conta.falhas };
    },

    existe(email) {
      const dados = carregar();
      return email === undefined ? Object.keys(dados.contas).length > 0 : !!dados.contas[normalizarEmail(email)];
    },

    esquecer(email) {
      const dados = carregar();
      delete dados.contas[normalizarEmail(email)];
      gravar(dados);
    },
  };
}
