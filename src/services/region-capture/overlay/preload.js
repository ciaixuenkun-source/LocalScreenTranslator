const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("regionCapture", {
  getBootstrap: () => ipcRenderer.invoke("region-capture-bootstrap"),
  confirm: (payload) => ipcRenderer.send("region-capture-confirm", payload),
  cancel: (reason) => ipcRenderer.send("region-capture-cancel", reason)
});
