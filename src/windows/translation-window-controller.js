const { BrowserWindow, Menu, clipboard, ipcMain, screen } = require("electron");
const path = require("path");
const { APP_ICON_PATH } = require("../app-assets");
const { ResultWindowManager } = require("./result/result-window-manager");
const {
  shouldCloseTextWindowOnBlur
} = require("./text-input/window-close-policy");
const {
  AI_PRECISE_MODE,
  FREE_MODE
} = require("../services/translator/translation-modes");

const FRIENDLY_ERRORS = {
  "provider-not-configured": "尚未配置翻译服务",
  "api-key-invalid": "API Key 无效",
  "model-unavailable": "模型不可用",
  "network-error": "网络连接失败",
  "request-timeout": "请求超时",
  "rate-limited": "请求过于频繁，请稍后重试",
  "empty-input": "请输入需要翻译的文字。",
  "translation-cancelled": "翻译已取消。",
  "empty-response": "翻译服务没有返回有效译文，请稍后重试。",
  "local-model-unavailable": "本地翻译模型不可用",
  "local-model-start-failed": "本地翻译模型启动失败",
  "local-request-failed": "本地翻译暂时失败"
};

function readClipboardTextOnce() {
  const formats = clipboard.availableFormats();
  const hasPlainText = formats.some(
    (format) =>
      format === "text/plain" ||
      format === "text/unicode" ||
      format.startsWith("text/plain;")
  );
  if (!hasPlainText) return "";

  const text = clipboard.readText();
  return text.trim() ? text : "";
}

class TranslationWindowController {
  constructor(translatorService, translatorSettings) {
    this.translatorService = translatorService;
    this.translatorSettings = translatorSettings;
    this.resultWindows = new ResultWindowManager();
    this.textWindow = null;
    this.textWindowState = null;
    this.clipboardSnapshot = "";
    this.activeRequests = new Map();
    this.registerIpc();
  }

  isTextWindowSender(sender) {
    return Boolean(
      this.textWindow &&
      !this.textWindow.isDestroyed() &&
      sender.id === this.textWindow.webContents.id
    );
  }

  cancelActiveRequests() {
    for (const controller of this.activeRequests.values()) controller.abort();
    this.activeRequests.clear();
  }

  registerIpc() {
    ipcMain.handle("text-translation-bootstrap", (event) => {
      if (!this.isTextWindowSender(event.sender)) return null;
      return {
        clipboardText: this.clipboardSnapshot,
        translation: this.translatorSettings.getSnapshot(),
        windowState: {
          pinned: Boolean(this.textWindowState?.pinned),
          phase: this.textWindowState?.phase || "idle"
        }
      };
    });

    ipcMain.handle("translate-text", async (event, payload) => {
      if (!this.isTextWindowSender(event.sender)) {
        return { ok: false, message: "当前窗口无法发起翻译。" };
      }

      const requestId = payload?.requestId;
      const text = payload?.text;
      const mode = payload?.mode;
      if (
        typeof requestId !== "string" ||
        typeof text !== "string" ||
        ![FREE_MODE, AI_PRECISE_MODE].includes(mode)
      ) {
        return { ok: false, message: "翻译请求无效。" };
      }
      if (this.activeRequests.size > 0 && !payload?.replaceActive) {
        return { ok: false, message: "当前已有翻译任务正在进行。" };
      }
      if (payload?.replaceActive) {
        this.cancelActiveRequests();
      }
      if (text.length > 100000) {
        return { ok: false, message: "本次文字过长，请分段翻译。" };
      }

      const controller = new AbortController();
      this.activeRequests.set(requestId, controller);
      if (this.textWindowState) this.textWindowState.phase = "translating";
      const sendToCurrentRequest = (channel, payload = {}) => {
        if (
          controller.signal.aborted ||
          this.activeRequests.get(requestId) !== controller ||
          event.sender.isDestroyed()
        ) {
          return;
        }
        event.sender.send(channel, { requestId, ...payload });
      };

      try {
        const translation = await this.translatorService.translate(text, {
          mode,
          signal: controller.signal,
          onChunk: (delta) => {
            sendToCurrentRequest("text-translation-chunk", { delta });
          },
          onStreamReset: () => {
            sendToCurrentRequest("text-translation-stream-reset");
          },
          onStatus: (status) => {
            sendToCurrentRequest("text-translation-status", { status });
          },
          includeDetails: true
        });
        if (
          controller.signal.aborted ||
          this.activeRequests.get(requestId) !== controller
        ) {
          return {
            ok: false,
            code: "translation-cancelled",
            message: FRIENDLY_ERRORS["translation-cancelled"]
          };
        }
        if (this.activeRequests.get(requestId) === controller && this.textWindowState) {
          this.textWindowState.phase = "complete";
        }
        return {
          ok: true,
          text: translation.text,
          warnings: translation.warnings,
          provider: translation.provider
        };
      } catch (error) {
        const code = error?.code || "translation-failed";
        if (this.activeRequests.get(requestId) === controller && this.textWindowState) {
          this.textWindowState.phase = "error";
        }
        return {
          ok: false,
          code,
          message: FRIENDLY_ERRORS[code] || "翻译暂时失败，请稍后重试。"
        };
      } finally {
        this.activeRequests.delete(requestId);
      }
    });

    ipcMain.on("cancel-text-translation", (event, requestId) => {
      if (!this.isTextWindowSender(event.sender)) return;
      this.activeRequests.get(requestId)?.abort();
    });

    ipcMain.on("begin-text-translation-pin-toggle", (event) => {
      if (!this.isTextWindowSender(event.sender) || !this.textWindowState) return;
      this.textWindowState.pinTransitionUntil = Date.now() + 700;
    });

    ipcMain.handle("set-text-translation-pinned", (event, pinned) => {
      if (!this.isTextWindowSender(event.sender) || !this.textWindowState) {
        return false;
      }
      this.textWindowState.pinTransitionUntil = Date.now() + 700;
      this.textWindowState.pinned = Boolean(pinned);
      if (this.textWindow.isMinimized()) this.textWindow.restore();
      if (!this.textWindow.isVisible()) this.textWindow.show();
      if (this.textWindowState.pinned) {
        this.textWindow.setAlwaysOnTop(true, "screen-saver");
      } else {
        this.textWindow.setAlwaysOnTop(false);
      }
      this.textWindow.moveTop();
      this.textWindow.focus();
      this.textWindow.webContents.focus();
      return this.textWindowState.pinned;
    });

    ipcMain.on("text-translation-phase", (event, phase) => {
      if (!this.isTextWindowSender(event.sender) || !this.textWindowState) return;
      if (["idle", "translating", "complete", "error", "editing"].includes(phase)) {
        this.textWindowState.phase = phase;
      }
    });

    ipcMain.on("minimize-text-translation", (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (this.isTextWindowSender(event.sender) && window) window.minimize();
    });

    ipcMain.on("close-text-translation", (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (this.isTextWindowSender(event.sender) && window) window.close();
    });
  }

  positionOnCurrentDisplay(window) {
    const workArea = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint()
    ).workArea;
    const bounds = window.getBounds();
    window.setPosition(
      workArea.x + Math.round((workArea.width - bounds.width) / 2),
      workArea.y + Math.round((workArea.height - bounds.height) / 2)
    );
  }

  presentTextWindow(window) {
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    if (!window.isVisible()) window.show();

    // A short topmost pulse reliably crosses Windows' foreground lock, then
    // immediately returns the window to normal independent-window behavior.
    window.setAlwaysOnTop(true, "floating");
    window.moveTop();
    window.focus();
    window.webContents.focus();

    setTimeout(() => {
      if (window.isDestroyed()) return;
      if (this.textWindowState?.pinned) {
        window.setAlwaysOnTop(true, "screen-saver");
      } else {
        window.setAlwaysOnTop(false);
      }
      window.moveTop();
      window.focus();
      window.webContents.send("focus-text-translation-input");
    }, 120);
  }

  refreshClipboard(window) {
    this.clipboardSnapshot = readClipboardTextOnce();
    if (!window.webContents.isLoadingMainFrame()) {
      window.webContents.send(
        "text-translation-clipboard",
        this.clipboardSnapshot
      );
    }
  }

  openTextInput() {
    if (this.textWindow?.isDestroyed()) this.textWindow = null;
    if (this.textWindow) {
      this.refreshClipboard(this.textWindow);
      this.presentTextWindow(this.textWindow);
      return;
    }

    this.clipboardSnapshot = readClipboardTextOnce();
    const window = new BrowserWindow({
      width: 680,
      height: 560,
      minWidth: 520,
      minHeight: 440,
      show: false,
      frame: false,
      resizable: true,
      fullscreenable: false,
      alwaysOnTop: false,
      skipTaskbar: false,
      backgroundColor: "#fff8ea",
      title: "文本翻译",
      icon: APP_ICON_PATH,
      webPreferences: {
        preload: path.join(__dirname, "text-input", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    this.textWindow = window;
    this.textWindowState = {
      pinned: false,
      phase: "idle",
      contextMenuOpen: false,
      pinTransitionUntil: 0
    };
    this.positionOnCurrentDisplay(window);

    window.loadFile(path.join(__dirname, "text-input", "index.html"));
    window.once("ready-to-show", () => {
      this.presentTextWindow(window);
    });

    window.webContents.on("context-menu", (_event, params) => {
      if (!this.textWindowState?.pinned) {
        window.close();
        return;
      }
      const template = [];
      if (params.isEditable && params.selectionText) {
        template.push({ label: "剪切", role: "cut" });
      }
      if (params.selectionText) {
        template.push({ label: "复制", role: "copy" });
      }
      if (params.isEditable) {
        template.push({ label: "粘贴", role: "paste" });
        template.push({ type: "separator" });
        template.push({ label: "全选", role: "selectAll" });
      }
      if (template.length === 0) return;

      this.textWindowState.contextMenuOpen = true;
      Menu.buildFromTemplate(template).popup({
        window,
        callback: () => {
          if (this.textWindow === window && this.textWindowState) {
            this.textWindowState.contextMenuOpen = false;
          }
        }
      });
    });

    window.on("blur", () => {
      setTimeout(() => {
        if (this.textWindow !== window || window.isDestroyed()) return;
        if (this.textWindowState?.pinned) {
          window.setAlwaysOnTop(true, "screen-saver");
          window.moveTop();
          return;
        }
        if (shouldCloseTextWindowOnBlur({
          state: this.textWindowState,
          windowFocused: window.isFocused(),
          windowMinimized: window.isMinimized()
        })) window.close();
      }, 220);
    });

    window.on("minimize", () => {
      if (!this.textWindowState?.pinned) return;
      setTimeout(() => {
        if (this.textWindow !== window || window.isDestroyed()) return;
        window.restore();
        window.setAlwaysOnTop(true, "screen-saver");
        window.showInactive();
        window.moveTop();
      }, 0);
    });

    window.on("close", () => {
      this.cancelActiveRequests();
    });

    window.on("closed", () => {
      if (this.textWindow === window) this.textWindow = null;
      this.textWindowState = null;
      this.clipboardSnapshot = "";
    });
  }

  closeAll() {
    this.cancelActiveRequests();
    this.resultWindows.closeAll();
    if (this.textWindow && !this.textWindow.isDestroyed()) {
      this.textWindow.destroy();
    }
    this.textWindow = null;
    this.textWindowState = null;
  }
}

module.exports = { TranslationWindowController };
