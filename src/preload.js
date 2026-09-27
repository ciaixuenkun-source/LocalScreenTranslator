const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("translatorShell", {
  expandMenu: () => ipcRenderer.send("expand-menu"),
  collapseMenu: () => ipcRenderer.send("collapse-menu"),
  triggerFeature: (action) => ipcRenderer.send("trigger-feature", action),
  setMenuHeight: (height) => ipcRenderer.send("set-menu-height", height),
  startDrag: (point) => ipcRenderer.send("drag-start", point),
  moveDrag: (point) => ipcRenderer.send("drag-move", point),
  endDrag: (moved) => ipcRenderer.send("drag-end", moved),
  setPointerPresence: (inside) => ipcRenderer.send("ball-pointer-presence", inside),
  animationFinished: (state) => ipcRenderer.send("ball-animation-finished", state),
  onWindowState: (callback) => {
    ipcRenderer.on("window-state", (_event, state) => callback(state));
  },
  onAppNotice: (callback) => {
    ipcRenderer.on("app-notice", (_event, message) => callback(message));
  }
});
