const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("translationResult", {
  onData: (callback) => {
    ipcRenderer.on("translation-result-data", (_event, data) => callback(data));
  },
  setPinned: (pinned) => ipcRenderer.invoke("set-result-pinned", pinned),
  close: () => ipcRenderer.send("close-translation-result")
});
