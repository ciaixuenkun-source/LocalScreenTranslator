const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("translatorSettings", {
  getSnapshot: () => ipcRenderer.invoke("hotkey-settings-bootstrap"),
  beginCapture: () => ipcRenderer.send("begin-hotkey-capture"),
  cancelCapture: () => ipcRenderer.send("cancel-hotkey-capture"),
  saveBinding: (payload) => ipcRenderer.invoke("save-hotkey-binding", payload),
  deleteBinding: (payload) => ipcRenderer.invoke("delete-hotkey-binding", payload),
  resetDefaults: () => ipcRenderer.invoke("reset-hotkey-defaults"),
  getTranslatorConfig: () => ipcRenderer.invoke("translator-settings-bootstrap"),
  testTranslator: (payload) => ipcRenderer.invoke("test-translator-settings", payload),
  saveTranslator: (payload) => ipcRenderer.invoke("save-translator-settings", payload),
  showBall: () => ipcRenderer.send("show-floating-ball"),
  quitTranslator: () => ipcRenderer.send("quit-translator"),
  minimize: () => ipcRenderer.send("minimize-settings-window"),
  close: () => ipcRenderer.send("close-settings-window")
});
