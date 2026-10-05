// print-worker.js -- gerencia o PowerShell RESIDENTE de impressao (printer_worker.ps1).
//
// Por que existe: o fluxo antigo abria um `powershell.exe` por impressao e
// recompilava o C# toda vez (~0,7 s de custo fixo por papel, medido). Aqui o
// PowerShell abre UMA vez e recebe os trabalhos por stdin (1 JSON por linha).
//
// Regras de seguranca (impressao de pedido nao pode se perder nem duplicar):
//  - Se o worker nao esta pronto (ainda subindo, caiu), `print` rejeita com
//    code 'WORKER_INDISPONIVEL' ANTES de enviar qualquer coisa -> quem chamou
//    usa o metodo antigo (printer_raw.ps1), sem risco de papel duplicado.
//  - Se o worker aceitou o trabalho e nao respondeu no prazo, rejeita com code
//    'TIMEOUT' -- NAO ha fallback automatico, porque o papel pode ter saido.
//  - Se o worker cair com trabalho em andamento, rejeita com 'WORKER_CAIU'.
//  - Cai sozinho? Reinicia (ate 5 vezes seguidas, com espera crescente).
import { spawn } from "child_process";

export function createPrintWorker({ scriptPath, spawnFn = spawn, log = console, command = "powershell.exe" }) {
  let child = null;
  let ready = false;
  let stopped = false;
  let restarts = 0;
  let seq = 0;
  let buffer = "";
  let lixo = []; // linhas de stdout que nao sao JSON (ex.: mensagens do helper C#)
  const pendentes = new Map(); // id -> { resolve, reject, timer }

  const erro = (code, message) => Object.assign(new Error(message), { code });

  function falharPendentes(code, message) {
    for (const [id, p] of pendentes) {
      clearTimeout(p.timer);
      p.reject(erro(code, message));
      pendentes.delete(id);
    }
  }

  function tratarLinha(linha) {
    const texto = linha.trim();
    if (!texto) return;
    if (!texto.startsWith("{")) {
      lixo.push(texto);
      if (lixo.length > 20) lixo.shift();
      return;
    }
    let msg;
    try {
      msg = JSON.parse(texto);
    } catch {
      lixo.push(texto);
      return;
    }
    if (msg.ready) {
      ready = true;
      restarts = 0;
      log.log("[PrintWorker] pronto (PowerShell residente compilado)");
      return;
    }
    const p = pendentes.get(msg.id);
    if (!p) return;
    clearTimeout(p.timer);
    pendentes.delete(msg.id);
    const detalhe = lixo.length ? lixo.join(" | ") : "";
    lixo = [];
    if (msg.ok) p.resolve({ ok: true });
    else p.resolve({ ok: false, message: msg.message || "Falha ao imprimir", details: detalhe });
  }

  function start() {
    if (stopped || child) return;
    ready = false;
    buffer = "";
    try {
      child = spawnFn(
        command,
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
        { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
      );
    } catch (e) {
      log.error("[PrintWorker] nao foi possivel iniciar:", e.message);
      child = null;
      agendarReinicio();
      return;
    }
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let i;
      while ((i = buffer.indexOf("\n")) >= 0) {
        tratarLinha(buffer.slice(0, i));
        buffer = buffer.slice(i + 1);
      }
    });
    child.stderr.on("data", (d) => log.warn("[PrintWorker] stderr:", d.toString().trim()));
    child.stdin.on("error", () => { /* o 'close' cuida do resto */ });
    child.on("error", (e) => log.error("[PrintWorker] erro do processo:", e.message));
    child.on("close", (code) => {
      log.warn(`[PrintWorker] encerrou (codigo ${code})`);
      child = null;
      ready = false;
      falharPendentes("WORKER_CAIU", "PowerShell de impressao encerrou durante o trabalho");
      agendarReinicio();
    });
  }

  function agendarReinicio() {
    if (stopped) return;
    if (restarts >= 5) {
      log.error("[PrintWorker] desistiu de reiniciar; impressao segue pelo metodo antigo");
      return;
    }
    restarts += 1;
    setTimeout(start, Math.min(1000 * restarts, 5000)).unref?.();
  }

  /** Envia um papel. `buf` = Buffer com os bytes ESC/POS. */
  function print(printer, buf, timeoutMs = 25000) {
    if (!child || !ready || !child.stdin.writable) {
      return Promise.reject(erro("WORKER_INDISPONIVEL", "PowerShell de impressao nao esta pronto"));
    }
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendentes.delete(id);
        reject(erro("TIMEOUT", `PowerShell de impressao nao respondeu em ${timeoutMs} ms`));
      }, timeoutMs);
      pendentes.set(id, { resolve, reject, timer });
      const linha = JSON.stringify({ id, printer, b64: Buffer.from(buf).toString("base64") }) + "\n";
      child.stdin.write(linha, "utf8", (e) => {
        if (e) {
          clearTimeout(timer);
          pendentes.delete(id);
          reject(erro("WORKER_INDISPONIVEL", "Falha ao escrever no PowerShell de impressao"));
        }
      });
    });
  }

  function stop() {
    stopped = true;
    falharPendentes("WORKER_CAIU", "encerrando");
    try { child?.stdin.end(); } catch { /* ignora */ }
    try { child?.kill(); } catch { /* ignora */ }
    child = null;
    ready = false;
  }

  return { start, print, stop, isReady: () => ready };
}
