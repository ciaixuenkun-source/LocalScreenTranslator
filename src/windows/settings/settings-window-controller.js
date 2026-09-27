const { BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { APP_ICON_PATH } = require("../../app-assets");

class SettingsWindowController {
  constructor(hotkeyManager, { translatorSettings, onShowBall, onQuit }) {
    this.hotkeyManager = hotkeyManager;
    this.translatorSettings = translatorSettings;
    this.onShowBall = onShowBall;
    this.onQuit = onQuit;
    this.window = null;
    this.connectionTestController = null;
    this.registerIpc();
  }

  isSettingsSender(sender) {
    return Boolean(
      this.window &&
      !this.window.isDestroyed() &&
      sender.id === this.window.webContents.id
    );
  }

  registerIpc() {
    ipcMain.handle("hotkey-settings-bootstrap", (event) => {
      if (!this.isSettingsSender(event.sender)) return null;
      return this.hotkeyManager.getSnapshot();
    });

    ipcMain.handle("translator-settings-bootstrap", (event) => {
      if (!this.isSettingsSender(event.sender)) return null;
      return this.translatorSettings.getSnapshot();
    });

    ipcMain.handle("test-translator-settings", async (event, payload) => {
      if (!this.isSettingsSender(event.sender)) {
        return { ok: false, message: "当前窗口无法测试翻译服务" };
      }
      this.connectionTestController?.abort();
      const controller = new AbortController();
      this.connectionTestController = controller;
      try {
        return await this.translatorSettings.testConnection(payload, {
          signal: controller.signal
        });
      } finally {
        if (this.connectionTestController === controller) {
          this.connectionTestController = null;
        }
      }
    });

    ipcMain.handle("save-translator-settings", (event, payload) => {
      if (!this.isSettingsSender(event.sender)) {
        return { ok: false, message: "当前窗口无法保存翻译服务" };
      }
      return this.translatorSettings.save(payload);
    });

    ipcMain.on("begin-hotkey-capture", (event) => {
      if (!this.isSettingsSender(event.sender)) return;
      this.hotkeyManager.beginCapture();
    });

    ipcMain.on("cancel-hotkey-capture", (event) => {
      if (this.isSettingsSender(event.sender)) this.hotkeyManager.endCapture();
    });

    ipcMain.handle("save-hotkey-binding", (event, payload) => {
      if (!this.isSettingsSender(event.sender)) {
        return { ok: false, message: "当前窗口无法修改设置" };
      }
      return this.hotkeyManager.saveBinding(
        payload?.action,
        payload?.binding,
        payload?.bindingId
      );
    });

    ipcMain.handle("delete-hotkey-binding", (event, payload) => {
      if (!this.isSettingsSender(event.sender)) {
        return { ok: false, message: "当前窗口无法修改设置" };
      }
      return this.hotkeyManager.deleteBinding(
        payload?.action,
        payload?.bindingId
      );
    });

    ipcMain.handle("reset-hotkey-defaults", (event) => {
      if (!this.isSettingsSender(event.sender)) {
        return { ok: false, message: "当前窗口无法修改设置" };
      }
      return this.hotkeyManager.resetDefaults();
    });

    ipcMain.on("show-floating-ball", (event) => {
      if (this.isSettingsSender(event.sender)) this.onShowBall();
    });

    ipcMain.on("quit-translator", (event) => {
      if (this.isSettingsSender(event.sender)) this.onQuit();
    });

    ipcMain.on("minimize-settings-window", (event) => {
      if (this.isSettingsSender(event.sender)) this.window.minimize();
    });

    ipcMain.on("close-settings-window", (event) => {
      if (this.isSettingsSender(event.sender)) this.window.close();
    });
  }

  open() {
    if (this.window && !this.window.isDestroyed()) {
      if (this.window.isMinimized()) this.window.restore();
      this.window.show();
      this.window.focus();
      return;
    }

    this.window = new BrowserWindow({
      width: 780,
      height: 650,
      minWidth: 680,
      minHeight: 520,
      frame: false,
      resizable: true,
      fullscreenable: false,
      backgroundColor: "#fff8ea",
      title: "Translator 设置",
      icon: APP_ICON_PATH,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    this.window.loadFile(path.join(__dirname, "index.html"));
    this.window.once("ready-to-show", () => {
      this.window.show();
      this.window.focus();
    });
    this.window.on("closed", () => {
      this.connectionTestController?.abort();
      this.connectionTestController = null;
      this.hotkeyManager.endCapture();
      this.window = null;
    });
  }

  close() {
    if (this.window && !this.window.isDestroyed()) this.window.close();
  }
}

module.exports = { SettingsWindowController };
