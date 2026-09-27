const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("regionPreview", {
  getBootstrap: () => ipcRenderer.invoke("region-preview-bootstrap"),
  onUpdate: (listener) => {
    const handler = (_event, update) => listener(update);
    ipcRenderer.on("region-preview-update", handler);
    return () => ipcRenderer.removeListener("region-preview-update", handler);
  },
  translate: (payload) => ipcRenderer.invoke("region-preview-translate", payload),
  cancelTranslation: () => ipcRenderer.send("region-preview-cancel-translation"),
  reselect: () => ipcRenderer.send("region-preview-reselect"),
  close: () => ipcRenderer.send("region-preview-close")
});
