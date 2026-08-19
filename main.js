import electron from "electron";
const { app, BrowserWindow, ipcMain, Menu, dialog, Tray, nativeImage, powerSaveBlocker } = electron;
import "dotenv/config";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import fs from "fs";
import http from "http";
import os from "os";
import Store from "electron-store";
import electronUpdater from "electron-updater";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";
const { autoUpdater } = electronUpdater;

let store;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let tray = null;
let isQuitting = false;

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// --- GLOBAL ERROR HANDLER ---
let LOG_PATH = null;
try {
  LOG_PATH = path.join(app.getPath("userData"), "pdv_error.log");
} catch (e) {}

function logToFile(msg) {
  try {
    const time = new Date().toISOString();
    // Se o caminho ainda não estiver pronto, apenas printamos no console interno
    if (LOG_PATH) {
      fs.appendFileSync(LOG_PATH, `[${time}] ${msg}\n`);
    } else {
      console.log(`[EarlyLog] ${msg}`);
    }
  } catch (e) {
    console.error("Failed to write to log file:", e);
  }
}

logToFile("--- INICIANDO APLICATIVO (ESCM - V1.5.2) ---");
logToFile(`Data: ${new Date().toISOString()}`);
logToFile(`Versão: ${app.getVersion()}`);
logToFile(`Plataforma: ${process.platform}`);
logToFile(`Argumentos: ${process.argv.join(" ")}`);

process.on('uncaughtException', (error) => {
  const msg = `Uncaught Exception: ${error.stack || error}`;
  console.error(msg);
  logToFile(msg);
  // Show error box immediately
  dialog.showErrorBox('Erro Crítico na Inicialização', error.message || String(error));
});

process.on('unhandledRejection', (reason, promise) => {
    const msg = `Unhandled Rejection at: ${promise}, reason: ${reason}`;
    console.error(msg);
    logToFile(msg);
});

// --- SINGLE INSTANCE LOCK ---
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}



ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});


// Native Silent Print Server (Option 2)

function startNativePrintServer() {
  const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    console.log(`[PrintServer] Request: ${req.method} ${req.url}`);

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === "POST" && req.url === "/print") {
      console.log(`[PrintServer] Received /print POST request`);
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", async () => {
        console.log(`[PrintServer] Body read complete, length: ${body.length}`);
        try {
          const data = JSON.parse(body);
          const content = data.content;
          const printer_name = data.printer_name || "HPRT MPT-II";

          const tempFilePath = path.join(
            os.tmpdir(),
            `print_${Date.now()}_${Math.floor(Math.random() * 1000)}.raw`,
          );
          // Write as binary buffer to avoid UTF-8 corruption of ESC/POS codes
          fs.writeFileSync(tempFilePath, Buffer.from(content, 'latin1'));

          // Call PowerShell Bridge
          const psScriptPath = app.isPackaged
            ? path.join(process.resourcesPath, "printer_raw.ps1")
            : path.join(__dirname, "printer_raw.ps1");

          if (!fs.existsSync(psScriptPath)) {
            throw new Error(`PowerShell script not found at: ${psScriptPath}`);
          }

          console.log(
            `Printing RAW to: ${printer_name} using script: ${psScriptPath}`,
          );

          const child = spawn("powershell.exe", [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            psScriptPath,
            "-PrinterName",
            printer_name,
            "-RawPath",
            tempFilePath,
          ]);

          let stdErr = "";
          let stdOut = "";
          child.stderr.on("data", (data) => {
            stdErr += data.toString();
          });
          child.stdout.on("data", (data) => {
            stdOut += data.toString();
          });

          child.on("close", (code) => {
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); // Cleanup
            console.log(`[PrintServer] PS Exit Code: ${code}`);
            console.log(`[PrintServer] PS Out: ${stdOut}`);
            if (code === 0) {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ status: "success", output: stdOut }));
            } else {
              console.error(`[PrintServer] PS Error: ${stdErr}`);
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  status: "error",
                  message: `PowerShell exited with code ${code}`,
                  details: stdErr,
                  output: stdOut,
                }),
              );
            }
          });
        } catch (err) {
          console.error("Print Server Internal Error:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              status: "error",
              message: err.message,
              stack: err.stack,
            }),
          );
        }
      });
    } else if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "online" }));
    } else if (req.url === "/printers") {
      const child = spawn("powershell.exe", [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Printer | Select-Object Name, Default | ConvertTo-Json",
      ]);
      let output = "";
      child.stdout.on("data", (data) => (output += data.toString()));
      child.on("close", () => {
        let printers = [];
        try {
          const parsed = JSON.parse(output || "[]");
          printers = Array.isArray(parsed) ? parsed : [parsed];
          // Normalize keys to Name and IsDefault
          printers = printers.map(p => ({
            Name: p.Name,
            IsDefault: p.Default || false
          }));
        } catch (e) {
          console.error("[PrintServer] Error parsing printers:", e);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(printers));
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.on("error", (e) => {
    console.error("SERVER ERROR:", e);
    if (e.code === "EADDRINUSE") {
      console.log("Port 5050 in use, retrying in 5s...");
      setTimeout(() => {
        try {
          server.close();
        } catch (e) {}
        server.listen(5050, "127.0.0.1");
      }, 5000);
    }
  });

  server.listen(5050, "127.0.0.1", () => {
    console.log("--- SILENT PRINT SERVER STARTED ON 127.0.0.1:5050 ---");
  });
}

function createWindow() {
  let appIconPath = path.join(__dirname, "dist", "icon.png");
  if (!fs.existsSync(appIconPath)) {
    appIconPath = path.join(__dirname, "public", "icon.png");
  }
  if (!fs.existsSync(appIconPath)) {
    appIconPath = path.join(__dirname, "build", "icon.png");
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Açaí do Dudu PDV",
    icon: appIconPath,
    show: false,
    focusable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, "preload.cjs"),
      backgroundThrottling: false
    },
  });

  // --- WEB SERIAL PORT SELECTION HANDLER (Balanca Eletronica) ---
  const ses = mainWindow.webContents.session;
  ses.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    if (portList && portList.length > 0) {
      // Auto-select the connected USB/COM scale port
      callback(portList[0].portId);
    } else {
      callback('');
    }
  });

  ses.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'serial') return true;
    return true;
  });

  ses.setDevicePermissionHandler((details) => {
    if (details.deviceType === 'serial') return true;
    return true;
  });

  const isHidden = process.argv.includes('--hidden');

  mainWindow.once('ready-to-show', () => {
    if (!isHidden) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Mostramos se não estiver oculto
  // mainWindow.once('ready-to-show', ...) acima já cuida disso

  // INTERCEPT CLOSE: Hide to tray instead of quitting
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// --- Auto Updater Logic ---



// Load .env from the same directory as main.js (works in dev and prod/asar)
const envPath = path.join(__dirname, ".env");
dotenv.config({ path: envPath });

console.log("[Main] Loading .env from:", envPath);
console.log("[Main] GH_TOKEN loaded:", process.env.GH_TOKEN ? (process.env.GH_TOKEN.substring(0, 5) + "...") : "UNDEFINED");

// Auto-Updater Config
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// Hardcoded token for private repo (Safe strictly for this specific internal app usage)
// In a real production app, you'd use a more secure distribution method or public repo.
const GH_TOKEN = process.env.GH_TOKEN;

if (!GH_TOKEN) {
  console.warn("[AutoUpdater] GH_TOKEN is missing! Updates will fail for private repo.");
}

autoUpdater.setFeedURL({
  provider: "github",
  owner: "manintecn",
  repo: "acaidodudu",
  private: true,
  token: GH_TOKEN
});

function setupAutoUpdater() {
  console.log("[AutoUpdater] Setting up...");

  // Event: Update Available
  autoUpdater.on("update-available", (info) => {
    console.log("[AutoUpdater] Update available:", info);
    if (mainWindow) {
      mainWindow.webContents.send("update-available", info);
    }
  });

  // Event: Update Not Available
  autoUpdater.on("update-not-available", (info) => {
    console.log("[AutoUpdater] Update not available.");
    if (mainWindow) {
      mainWindow.webContents.send("update-not-available", info);
    }
  });

  // Event: Download Progress
  autoUpdater.on("download-progress", (progressObj) => {
    console.log(`[AutoUpdater] Download speed: ${progressObj.bytesPerSecond} - ${progressObj.percent}%`);
    if (mainWindow) {
      mainWindow.webContents.send("update-download-progress", progressObj);
    }
  });

  // Event: Update Downloaded
  autoUpdater.on("update-downloaded", (info) => {
    console.log("[AutoUpdater] Update downloaded:", info);
    if (mainWindow) {
      mainWindow.webContents.send("update-downloaded", info);
    }
    // Custom UI handles the restart via IPC
    // console.log("Update downloaded - waiting for user to click Restart in UI");
  });

  // Event: Error
  autoUpdater.on("error", (err) => {
    // Silenced to prevent console pollution as requested
    // console.error("[AutoUpdater] Error in auto-updater:", err);
    if (mainWindow) {
      mainWindow.webContents.send("update-error", err.message);
    }
  });

  // IPC: Check for Update (Manual Trigger)
  ipcMain.handle("check-for-update", async () => {
    console.log("[AutoUpdater] Checking for updates (manual)...");
    try {
      if (!GH_TOKEN) {
          console.warn("[AutoUpdater] GH_TOKEN is missing during manual check.");
      }
      const result = await autoUpdater.checkForUpdates();
      return result;
    } catch (error) {
      const errorMsg = error.message || String(error);
      if (errorMsg.includes('404')) {
          // Silence 404 errors as they are expected when no releases exist yet
          return { error: 'No releases found on GitHub' };
      }
      console.error("[AutoUpdater] Check failed:", error);
      throw error;
    }
  });

  // IPC: Download Update (Manual Trigger)
  ipcMain.handle("download-update", async () => {
    console.log("[AutoUpdater] Downloading update...");
    return await autoUpdater.downloadUpdate();
  });

  // IPC: Quit and Install
  ipcMain.handle("quit-and-install", () => {
    console.log("[AutoUpdater] Quitting and installing...");
    autoUpdater.quitAndInstall();
  });
}

app.whenReady().then(() => {
  // Force bot off on every startup per user request
  const cfg = getStoredConfig();
  if (cfg.isBotEnabled !== false) {
     saveStoredConfig({ ...cfg, isBotEnabled: false });
  }

  // --- INITIALIZE CRITICAL THINGS ---
  try {
      LOG_PATH = path.join(app.getPath("userData"), "pdv_error.log");
      store = new Store();
      
      // Initial Log
      logToFile("--- INICIANDO APLICATIVO (ESCM) ---");
      logToFile(`Versão: ${app.getVersion()}`);
      logToFile(`Plataforma: ${process.platform}`);
      logToFile(`Argumentos: ${process.argv.join(" ")}`);
      
      // Prevent system sleep while the app is open (critical for background bot)
      powerSaveBlocker.start('prevent-app-suspension');
  } catch (err) {
      console.error("Erro na inicialização inicial:", err);
  }

  // Define standard application menu to enable Copy/Paste/Undo/Redo in packaged app
  const template = [
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // --- TRAY SETUP ---
  function createTray() {
    // Try different possible icon locations for packaged vs dev
    let iconPath = path.join(__dirname, "dist", "icon.png");
    if (!fs.existsSync(iconPath)) {
      iconPath = path.join(__dirname, "public", "icon.png");
    }
    if (!fs.existsSync(iconPath)) {
      iconPath = path.join(process.resourcesPath, "dist", "favicon.ico");
    }
    if (!fs.existsSync(iconPath)) {
       // Absolute fallback to a generic name or just try icon.ico if that's what we have
       iconPath = path.join(__dirname, "dist", "icon.png");
    }
    
    // If it still doesn't exist, we'll try to use the one from the root
    if (!fs.existsSync(iconPath)) {
      iconPath = path.join(__dirname, "favicon.ico");
    }

    if (!fs.existsSync(iconPath)) {
      console.warn("[Tray] Icon NOT found. Tray might be invisible.");
    }
    
    try {
        const icon = nativeImage.createFromPath(iconPath);
        if (icon.isEmpty()) {
            logToFile(`[Tray] Aviso: Imagem do ícone está vazia ou não encontrada em: ${iconPath}`);
        }
        
        tray = new Tray(icon.resize({ width: 16, height: 16 }));
        
        const trayMenu = Menu.buildFromTemplate([
          { 
            label: 'Abrir Açaí do Dudu',
            click: () => {
              mainWindow.show();
              mainWindow.focus();
            } 
          },
          { type: 'separator' },
          { 
            label: 'Sair Completamente', 
            click: () => {
              isQuitting = true;
              app.quit();
            } 
          }
        ]);
        
        tray.setToolTip('Açaí do Dudu PDV - Monitorando Pedidos');
        tray.setContextMenu(trayMenu);
        
        tray.on('double-click', () => {
          mainWindow.show();
          mainWindow.focus();
        });
    } catch (e) {
        const msg = `Falha ao criar Tray: ${e.message}`;
        console.error(msg);
        logToFile(msg);
        // Não deixamos o app cair por causa do Tray
    }
  }

  const CONFIG_PATH = path.join(app.getPath('userData'), 'bot_config.json');

  function getStoredConfig() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      }
    } catch (e) {
      console.error("[Main] Error reading config:", e);
    }
    return {};
  }

  function saveStoredConfig(config) {
    try {
      const current = getStoredConfig();
      fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...current, ...config }, null, 2));
    } catch (e) {
      console.error("[Main] Error saving config:", e);
    }
  }

  let botProcess = null;

  // --- WHATSAPP BOT SERVER ---
  function stopBotServer() {
      if (botProcess) {
          console.log("[Main] Stopping WhatsApp Bot...");
          botProcess.kill();
          botProcess = null;
      }
      if (cloudflaredProcess) {
          console.log("[Main] Stopping Cloudflare Tunnel...");
          cloudflaredProcess.kill();
          cloudflaredProcess = null;
      }
  }

  let cloudflaredProcess = null;
  let activeTunnelUrl = null;

  function startCloudflaredTunnel(btzapToken) {
    if (cloudflaredProcess) {
      cloudflaredProcess.kill();
      cloudflaredProcess = null;
    }

    logToFile("[Túnel] Iniciando cloudflared tunnel com npx -y...");
    
    // Usamos npx para garantir que funcione se o usuário tiver node instalado
    cloudflaredProcess = spawn("npx", ["-y", "--package", "cloudflared", "cloudflared", "tunnel", "--url", "http://localhost:3000"], {
      shell: true,
      windowsHide: true
    });

    cloudflaredProcess.on("error", (err) => {
      logToFile(`[Túnel Error]: Falha ao iniciar o npx: ${err.message}`);
    });

    cloudflaredProcess.stdout.on("data", (data) => {
      const output = data.toString();
      logToFile(`[Túnel stdout]: ${output}`);
      // Procura pela URL do túnel rápido
      const match = output.match(/https:\/\/.*\.trycloudflare\.com/);
      if (match) {
        activeTunnelUrl = match[0];
        logToFile(`[Túnel] URL Identificada: ${activeTunnelUrl}`);
        syncWebhookWithBTZAP(btzapToken, activeTunnelUrl);
        if (mainWindow) {
          mainWindow.webContents.send("tunnel-url", activeTunnelUrl);
        }
      }
    });

    cloudflaredProcess.stderr.on("data", (data) => {
      const output = data.toString();
      logToFile(`[Túnel stderr]: ${output}`);
      const match = output.match(/https:\/\/.*\.trycloudflare\.com/);
      if (match) {
        activeTunnelUrl = match[0];
        logToFile(`[Túnel] URL Identificada (stderr): ${activeTunnelUrl}`);
        syncWebhookWithBTZAP(btzapToken, activeTunnelUrl);
        if (mainWindow) {
          mainWindow.webContents.send("tunnel-url", activeTunnelUrl);
        }
      }
    });

    cloudflaredProcess.on("close", (code) => {
      logToFile(`[Túnel] cloudflared encerrado com código ${code}`);
      activeTunnelUrl = null;
      if (mainWindow) {
        mainWindow.webContents.send("tunnel-url", null);
      }
    });
  }

  async function syncWebhookWithBTZAP(token, url, retryCount = 0) {
    if (!token || !url) {
      logToFile("[Sistema] ⚠️ Token ou URL ausentes para sincronização.");
      return;
    }
    try {
      logToFile(`[Sistema] Sincronizando Webhook no BTZAP (Tentativa ${retryCount + 1}): ${url}`);
      const response = await axios.post("https://server.btzap.com.br/webhook", {
        enabled: true,
        url: url,
        events: ["messages", "connection"],
        excludeMessages: ["wasSentByApi"]
      }, {
        headers: {
          "Content-Type": "application/json",
          "token": token
        },
        timeout: 10000
      });
      if (response.status === 200) {
        logToFile("[Sistema] ✅ Webhook sincronizado com sucesso no BTZAP.");
        if (mainWindow) {
          mainWindow.webContents.send("bot-log", `[Sistema] ✅ Webhook sincronizado: ${url}`);
        }
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message;
      logToFile(`[Sistema] ❌ Falha ao sincronizar Webhook (Tentativa ${retryCount + 1}): ${errorMsg}`);
      
      if (retryCount < 5) {
        const delay = (retryCount + 1) * 5000;
        logToFile(`[Sistema] Retentando sincronização em ${delay/1000}s...`);
        setTimeout(() => syncWebhookWithBTZAP(token, url, retryCount + 1), delay);
      } else if (mainWindow) {
        mainWindow.webContents.send("bot-log", `[Sistema] ❌ Falha final na sincronização automática. Tente clicar em Reiniciar Bot.`);
      }
    }
  }

  function startBotServer() {
    const config = getStoredConfig();
    const isBotEnabled = config.isBotEnabled === true;
    const bypassNumber = config.bypassNumber || "";

    if (botProcess) {
        console.log("[Main] Bot already running, skipping start.");
        return;
    }

    console.log("[Main] Starting WhatsApp Bot Server...");
    
    const botPath = app.isPackaged
      ? path.join(__dirname, "servidor.cjs")
      : path.join(__dirname, "servidor.ts");

    console.log(`[Main] Loading Bot from: ${botPath}`);

    if (!fs.existsSync(botPath)) {
      console.error(`[Bot Error] Bot script NOT found at: ${botPath}`);
      return;
    }

    const authPath = path.join(os.homedir(), ".acaidodudu_bot_auth");
    if (!fs.existsSync(authPath)) {
        fs.mkdirSync(authPath, { recursive: true });
    }

    // Merge stored keys into environment variables
    const botEnv = { 
        ...process.env,
        AUTH_PATH: authPath,
        SUPABASE_URL: config.supabaseUrl || process.env.SUPABASE_URL || "",
        SUPABASE_SERVICE_ROLE_KEY: config.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
        STORE_ID: config.storeId || process.env.STORE_ID || "",
        OPENAI_API_KEY: config.openaiKey || process.env.OPENAI_API_KEY || "",
        BTZAP_TOKEN: config.btzapToken || process.env.BTZAP_TOKEN || "",
        INSTANCE_NUMBER: config.instanceNumber || process.env.INSTANCE_NUMBER,
        BOT_PROMPT: config.botPrompt || "",
        APP_URL: config.appUrl || process.env.APP_URL || "",
        IS_BOT_ENABLED: isBotEnabled ? "true" : "false",
        BYPASS_NUMBER: bypassNumber
    };

    // Use current process.execPath (Electron) as Node.js runner in production
    // or npx ts-node in development
    const command = app.isPackaged ? process.execPath : "npx";
    const args = app.isPackaged ? [botPath] : ["ts-node", botPath];

    if (app.isPackaged) {
        // Enforce node mode for Electron binary
        botEnv.ELECTRON_RUN_AS_NODE = "1";
    }

    botProcess = spawn(command, args, {
      env: botEnv,
      shell: !app.isPackaged,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    // Iniciar túnel Cloudflare sempre
    const effectiveToken = botEnv.BTZAP_TOKEN || config.btzapToken;
    if (effectiveToken) {
      startCloudflaredTunnel(effectiveToken);
    }

    botProcess.stdout.on('data', (data) => {

      const msg = data.toString();
      console.log(`[Bot Stdout] ${msg}`);
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('bot-log', msg);
      }
    });

    botProcess.stderr.on('data', (data) => {
      const msg = data.toString();
      console.error(`[Bot Stderr] ${msg}`);
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('bot-log', `ERROR: ${msg}`);
      }
    });

    botProcess.on('message', (msg) => {
      if (!mainWindow || !mainWindow.webContents) return;
      
      console.log(`[Bot Message] Type: ${msg.type}`);
      if (msg.type === 'whatsapp-qr') {
        mainWindow.webContents.send('whatsapp-qr', msg.data);
      } else if (msg.type === 'whatsapp-status') {
        mainWindow.webContents.send('whatsapp-status', msg.data);
      } else if (msg.type === 'bot-log') {
        mainWindow.webContents.send('bot-log', msg.data);
      }
    });

    botProcess.on('close', (code) => {
      console.log(`[Bot] Process exited with code ${code}`);
      botProcess = null;
      if (code !== 0 && !isQuitting) {
        const currentConfig = getStoredConfig();
        if (currentConfig.isBotEnabled !== false) {
           console.log("[Bot] Restarting in 15s...");
           setTimeout(startBotServer, 15000);
        }
      }
    });

    // Cleanup on app quit
    app.on('before-quit', () => {
      if (botProcess) botProcess.kill();
    });
  }

  // --- IPC STORAGE & BOT CONTROL ---
  ipcMain.handle('storage-get', (event, key) => {
      const config = getStoredConfig();
      if (key === 'tunnel-url') return activeTunnelUrl;
      return config[key];
  });

  ipcMain.handle('storage-set', (event, key, value) => {
      saveStoredConfig({ [key]: value });
      return true;
  });

  ipcMain.handle('storage-remove', (event, key) => {
      try {
        const current = getStoredConfig();
        delete current[key];
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2));
        return true;
      } catch (e) {
        console.error("[Main] Error removing config key:", e);
        return false;
      }
  });

  ipcMain.on('restart-bot', () => {
      stopBotServer();
      setTimeout(startBotServer, 1000);
  });

  ipcMain.handle('force-sync-webhook', async () => {
      const config = getStoredConfig();
      if (config.btzapToken && activeTunnelUrl) {
          await syncWebhookWithBTZAP(config.btzapToken, activeTunnelUrl);
          return { success: true, url: activeTunnelUrl };
      }
      return { success: false, message: "Tunnel ou Token não disponíveis." };
  });

  ipcMain.on('reset-whatsapp-session', async () => {
    console.log("[Main] Emergency Reset: Deleting bot_auth and clearing history...");
    if (mainWindow) mainWindow.webContents.send('bot-log', "[Sistema] 🛑 Parando robô para limpeza forçada...");
    
    stopBotServer();
    
    const authPath = path.join(os.homedir(), ".acaidodudu_bot_auth");
    const config = getStoredConfig();
    const supabaseUrl = config.supabaseUrl || process.env.SUPABASE_URL || "";
    const supabaseKey = config.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const storeId = config.storeId || process.env.STORE_ID || '';

    // 1. Limpar Histórico no Banco de Dados (Supabase)
    if (supabaseKey) {
        try {
            if (mainWindow) mainWindow.webContents.send('bot-log', "[Sistema] 🧹 Limpando histórico de chat no banco de dados...");
            const supabase = createClient(supabaseUrl, supabaseKey);
            // Chamamos a função para limpar histórico de toda a loja (ou poderíamos passar números específicos)
            await supabase.rpc('clear_all_store_chat_history', { p_store_id: storeId });
            console.log("[Main] Database history cleared.");

            // 1.1 Limpar credenciais no storage local
            saveStoredConfig({ btzapToken: '', instanceNumber: '' });
            console.log("[Main] BTZap credentials cleared from storage.");
        } catch (err) {
            console.error("[Main] Error clearing DB history:", err);
        }
    }
    
    // 2. Limpar arquivos locais (WhatsApp session)
    // Espera um pouco mais para o Windows soltar os arquivos bloqueados
    setTimeout(() => {
        try {
            if (fs.existsSync(authPath)) {
                if (mainWindow) mainWindow.webContents.send('bot-log', "[Sistema] 🧹 Limpando arquivos de sessão locais...");
                
                // Tentativa robusta de remoção direta
                fs.rmSync(authPath, { recursive: true, force: true });
                console.log("[Main] bot_auth deleted successfully.");
                if (mainWindow) mainWindow.webContents.send('bot-log', "[Sistema] ✅ Sessão e Histórico limpos com sucesso!");
            } else {
                if (mainWindow) mainWindow.webContents.send('bot-log', "[Sistema] ⚠️ Pasta de sessão não encontrada, prosseguindo...");
            }
        } catch (e) {
            console.error("[Main] Error deleting bot_auth:", e);
            if (mainWindow) mainWindow.webContents.send('bot-log', `[Sistema] ❌ Erro ao limpar arquivos locais: ${e.message}. Tente fechar o aplicativo e abrir novamente.`);
        }
        
        if (mainWindow) mainWindow.webContents.send('bot-log', "[Sistema] 🔄 Reiniciando robô... O QR Code deve aparecer em instantes.");
        setTimeout(startBotServer, 2000);
    }, 6000); // 6 segundos de espera para garantir que o processo Baileys fechou
  });

  ipcMain.on('send-whatsapp', (event, { phone, message }) => {
    if (botProcess && phone && message) {
        botProcess.send({ type: 'send-message', data: { phone, message } });
    } else {
        logToFile(`[Bot] Aviso: Notificação via robô local ignorada para ${phone} (Robô desligado).`);
    }
  });

  ipcMain.on('toggle-bot', (event, enabled) => {
    saveStoredConfig({ isBotEnabled: enabled });
    if (enabled) {
        startBotServer();
    } else {
        stopBotServer();
        if (mainWindow) mainWindow.webContents.send('whatsapp-status', { connection: 'disabled' });
    }
  });

  startNativePrintServer();
  
  // Limpeza de processos no boot para garantir estado estável
  setTimeout(() => {
    logToFile("[Sistema] Realizando limpeza de processos iniciais...");
    stopBotServer(); 
    // startBotServer(); <-- Removido para iniciar com robô desligado
  }, 3000);

  createWindow();
  setupAutoUpdater();
  createTray();


  // Enable Start with Windows
  try {
      const exeName = path.basename(process.execPath);
      app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath,
        args: [
          '--process-start-args', `--hidden`
        ]
      });
  } catch (e) {
      logToFile(`Falha ao configurar LoginItem: ${e.message}`);
  }

  // Check for updates shortly after startup
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(e => console.log("Startup update check failed:", e));
  }, 3000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  // Since we have a Tray icon now, we NEVER want to quit on window close unless isQuitting is true.
  // Exception: macOS typically keeps the app in the dock.
  if (process.platform === "darwin" && isQuitting) {
    app.quit();
  }
});
