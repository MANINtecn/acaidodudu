export {};

declare global {
  interface Window {
    electron: {
      checkForUpdate: () => Promise<any>;
      downloadUpdate: () => Promise<any>;
      quitAndInstall: () => Promise<void>;
      onUpdateAvailable: (callback: (info: any) => void) => void;
      onUpdateNotAvailable: (callback: () => void) => void;
      onUpdateDownloadProgress: (callback: (progress: any) => void) => void;
      onUpdateDownloaded: (callback: () => void) => void;
      onUpdateError: (callback: (error: string) => void) => void;
      removeAllListeners: (channel: string) => void;
      getAppVersion: () => Promise<string>;
    };
  }
}
