const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("textTranslation", {
  getBootstrap: () => ipcRenderer.invoke("text-translation-bootstrap"),
  translate: (payload) => ipcRenderer.invoke("translate-text", payload),
  cancel: (requestId) => ipcRenderer.send("cancel-text-translation", requestId),
  onChunk: (callback) => {
    ipcRenderer.on("text-translation-chunk", (_event, payload) => callback(payload));
  },
  onStreamReset: (callback) => {
    ipcRenderer.on("text-translation-stream-reset", (_event, payload) => callback(payload));
  },
  onStatus: (callback) => {
    ipcRenderer.on("text-translation-status", (_event, payload) => callback(payload));
  },
  setPinned: (pinned) => ipcRenderer.invoke("set-text-translation-pinned", pinned),
  beginPinToggle: () => ipcRenderer.send("begin-text-translation-pin-toggle"),
  setPhase: (phase) => ipcRenderer.send("text-translation-phase", phase),
  minimize: () => ipcRenderer.send("minimize-text-translation"),
  close: () => ipcRenderer.send("close-text-translation"),
  onClipboardRefresh: (callback) => {
    ipcRenderer.on("text-translation-clipboard", (_event, text) => callback(text));
  },
  onFocusInput: (callback) => {
    ipcRenderer.on("focus-text-translation-input", () => callback());
  }
});
