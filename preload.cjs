const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  checkForUpdate: () => ipcRenderer.invoke("check-for-update"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  quitAndInstall: () => ipcRenderer.invoke("quit-and-install"),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  
  // Listeners
  onUpdateAvailable: (callback) => ipcRenderer.on("update-available", (event, ...args) => callback(...args)),
  onUpdateNotAvailable: (callback) => ipcRenderer.on("update-not-available", (event, ...args) => callback(...args)),
  onUpdateDownloadProgress: (callback) => ipcRenderer.on("update-download-progress", (event, ...args) => callback(...args)),
  onUpdateDownloaded: (callback) => ipcRenderer.on("update-downloaded", (event, ...args) => callback(...args)),
  onUpdateError: (callback) => ipcRenderer.on("update-error", (event, ...args) => callback(...args)),
  
  // WhatsApp Bot listeners
  onWhatsAppQR: (callback) => ipcRenderer.on("whatsapp-qr", (event, ...args) => callback(...args)),
  onWhatsAppStatus: (callback) => ipcRenderer.on("whatsapp-status", (event, ...args) => callback(...args)),
  onBotLog: (callback) => ipcRenderer.on("bot-log", (event, ...args) => callback(...args)),
  onTunnelUrl: (callback) => ipcRenderer.on("tunnel-url", (event, ...args) => callback(...args)),

  
  // Cleaners to remove listeners if needed (React UseEffect cleanup)
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

  // Storage API for Persistence
  storage: {
    getItem: (key) => ipcRenderer.invoke("storage-get", key),
    setItem: (key, value) => ipcRenderer.invoke("storage-set", key, value),
  removeItem: (key) => ipcRenderer.invoke("storage-remove", key),
  },

  // Bot Control
  toggleBot: (enabled) => ipcRenderer.send("toggle-bot", enabled),
  sendWhatsapp: (data) => ipcRenderer.send("send-whatsapp", data),
  restartBot: () => ipcRenderer.send("restart-bot"),
  resetWhatsAppSession: () => ipcRenderer.send("reset-whatsapp-session"),
  forceSyncWebhook: () => ipcRenderer.invoke("force-sync-webhook")
});
