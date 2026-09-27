const { BrowserWindow, Menu, ipcMain, screen } = require("electron");
const path = require("path");
const { APP_ICON_PATH } = require("../../app-assets");

class ResultWindowManager {
  constructor() {
    this.transientWindow = null;
    this.windowStates = new Map();
    this.registerIpc();
  }

  registerIpc() {
    ipcMain.handle("set-result-pinned", (event, pinned) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const state = this.windowStates.get(window);
      if (!window || !state) return false;

      state.pinned = Boolean(pinned);
      if (state.pinned) {
        if (this.transientWindow === window) this.transientWindow = null;
      } else {
        if (this.transientWindow && this.transientWindow !== window) {
          this.transientWindow.close();
        }
        this.transientWindow = window;
      }
      return state.pinned;
    });

    ipcMain.on("close-translation-result", (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window && this.windowStates.has(window)) window.close();
    });
  }

  show(text) {
    if (this.transientWindow && !this.transientWindow.isDestroyed()) {
      this.transientWindow.close();
    }

    const workArea = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint()
    ).workArea;
    const width = Math.min(680, workArea.width - 48);
    const height = Math.min(380, workArea.height - 48);
    const window = new BrowserWindow({
      width,
      height,
      x: workArea.x + Math.round((workArea.width - width) / 2),
      y: workArea.y + Math.round((workArea.height - height) / 2),
      minWidth: 420,
      minHeight: 240,
      frame: false,
      transparent: true,
      resizable: true,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      icon: APP_ICON_PATH,
      backgroundColor: "#00000000",
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    const state = { pinned: false, contextMenuOpen: false };
    this.windowStates.set(window, state);
    this.transientWindow = window;
    window.setAlwaysOnTop(true, "floating");
    window.loadFile(path.join(__dirname, "index.html"));

    window.webContents.once("did-finish-load", () => {
      window.webContents.send("translation-result-data", { text });
      window.show();
      window.focus();
    });

    window.webContents.on("context-menu", (_event, params) => {
      if (!params.selectionText) return;
      state.contextMenuOpen = true;
      const menu = Menu.buildFromTemplate([{ label: "复制", role: "copy" }]);
      menu.popup({
        window,
        callback: () => {
          state.contextMenuOpen = false;
        }
      });
    });

    window.on("blur", () => {
      setTimeout(() => {
        if (
          !window.isDestroyed() &&
          !state.pinned &&
          !state.contextMenuOpen
        ) {
          window.close();
        }
      }, 100);
    });

    window.on("closed", () => {
      if (this.transientWindow === window) this.transientWindow = null;
      this.windowStates.delete(window);
    });

    return window;
  }

  closeAll() {
    for (const window of this.windowStates.keys()) {
      if (!window.isDestroyed()) window.close();
    }
    this.transientWindow = null;
    this.windowStates.clear();
  }
}

module.exports = { ResultWindowManager };
