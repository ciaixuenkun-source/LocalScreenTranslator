const { BrowserWindow, Menu, desktopCapturer, ipcMain, screen } = require("electron");
const path = require("path");
const { APP_ICON_PATH } = require("../../app-assets");
const { mapCssRectToImagePixels } = require("./geometry");
const {
  RegionTranslationCoordinator
} = require("./region-translation-coordinator");
const {
  AI_PRECISE_MODE,
  FREE_MODE
} = require("../translator/translation-modes");

const TRANSLATION_ERRORS = {
  "provider-not-configured": "尚未配置 AI 精译服务",
  "api-key-invalid": "API Key 无效",
  "model-unavailable": "模型不可用",
  "network-error": "网络连接失败",
  "request-timeout": "请求超时",
  "rate-limited": "请求过于频繁，请稍后重试",
  "local-model-not-configured": "本地翻译尚未配置。请设置 TRANSLATOR_LLAMA_RUNTIME_DIR 和 TRANSLATOR_QWEN_MODEL_DIR。",
  "local-runtime-unavailable": "未找到 llama-server.exe，请检查 TRANSLATOR_LLAMA_RUNTIME_DIR。",
  "local-model-unavailable": "未找到本地 Qwen 模型，请检查 TRANSLATOR_QWEN_MODEL_DIR。",
  "local-model-start-failed": "本地翻译模型启动失败",
  "local-request-failed": "本地翻译暂时失败",
  "translation-cancelled": "翻译已取消"
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class RegionCaptureController {
  constructor({
    ocrService,
    translatorService,
    onHideBall,
    onRestoreBall,
    onNotice
  }) {
    this.ocrService = ocrService;
    this.translations = new RegionTranslationCoordinator(translatorService);
    this.onHideBall = onHideBall;
    this.onRestoreBall = onRestoreBall;
    this.onNotice = onNotice;
    this.session = null;
    this.previewWindow = null;
    this.previewData = null;
    this.ocrTask = null;
    this.nextOcrTaskId = 0;
    this.nextPreviewSessionId = 0;
    this.registerIpc();
  }

  isActive() {
    return Boolean(this.session || this.ocrTask);
  }

  isOverlaySender(sender) {
    return Boolean(
      this.session?.overlay &&
      !this.session.overlay.isDestroyed() &&
      sender.id === this.session.overlay.webContents.id
    );
  }

  isPreviewSender(sender) {
    return Boolean(
      this.previewWindow &&
      !this.previewWindow.isDestroyed() &&
      sender.id === this.previewWindow.webContents.id
    );
  }

  registerIpc() {
    ipcMain.handle("region-capture-bootstrap", (event) => {
      if (!this.isOverlaySender(event.sender)) return null;
      try {
        this.prepareOverlayScreenshot();
        const { display, screenshot, screenshotSize } = this.session;
        return {
          screenshotDataUrl: screenshot.toDataURL(),
          screenshotSize,
          display: {
            id: display.id,
            bounds: display.bounds,
            captureBounds: this.session.captureBounds,
            scaleFactor: display.scaleFactor
          }
        };
      } catch (error) {
        console.error("[region-capture] overlay initialization failed", error?.message);
        this.finishSession();
        this.onNotice("区域截图启动失败");
        return null;
      }
    });

    ipcMain.on("region-capture-confirm", (event, payload) => {
      if (!this.isOverlaySender(event.sender)) return;
      this.confirm(payload);
    });

    ipcMain.on("region-capture-cancel", (event, reason) => {
      if (!this.isOverlaySender(event.sender)) return;
      this.cancel(reason || "cancel");
    });

    ipcMain.handle("region-preview-bootstrap", (event) => {
      if (!this.isPreviewSender(event.sender)) return null;
      return this.previewData;
    });

    ipcMain.on("region-preview-close", (event) => {
      if (this.isPreviewSender(event.sender)) this.previewWindow.close();
    });

    ipcMain.on("region-preview-reselect", (event) => {
      if (!this.isPreviewSender(event.sender) || this.ocrTask) return;
      this.closePreview();
      this.start();
    });

    ipcMain.handle("region-preview-translate", async (event, payload) => {
      if (!this.isPreviewSender(event.sender)) {
        return { ok: false, message: "当前窗口无法发起翻译" };
      }
      const mode = payload?.mode;
      const text = typeof payload?.text === "string" ? payload.text.trim() : "";
      if (![FREE_MODE, AI_PRECISE_MODE].includes(mode) || !text) {
        return { ok: false, message: text ? "翻译模式无效" : "没有可翻译的原文" };
      }
      return this.translatePreview({
        sessionId: this.previewData?.sessionId,
        text,
        mode
      });
    });

    ipcMain.on("region-preview-cancel-translation", (event) => {
      if (!this.isPreviewSender(event.sender)) return;
      this.translations.cancel();
      this.updatePreview({
        state: "editing",
        message: "原文已修改",
        translatedText: "",
        warnings: []
      });
    });
  }

  async captureDisplay(display) {
    const requestedSize = {
      width: Math.round(display.bounds.width * display.scaleFactor),
      height: Math.round(display.bounds.height * display.scaleFactor)
    };
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: requestedSize,
      fetchWindowIcons: false
    });
    const displayId = String(display.id);
    const source =
      sources.find((candidate) => candidate.display_id === displayId) ||
      (sources.length === 1 ? sources[0] : null);
    if (!source || source.thumbnail.isEmpty()) {
      throw new Error("无法获取当前屏幕截图");
    }
    const fullScreenshot = source.thumbnail;
    const fullScreenshotSize = fullScreenshot.getSize();
    return {
      fullScreenshot,
      fullScreenshotSize,
      requestedSize,
      sourceId: source.id
    };
  }

  prepareOverlayScreenshot() {
    const session = this.session;
    if (!session || session.screenshot) return;

    const captureBounds = session.overlay.getContentBounds();
    const relativeBounds = {
      x: captureBounds.x - session.display.bounds.x,
      y: captureBounds.y - session.display.bounds.y,
      width: captureBounds.width,
      height: captureBounds.height
    };
    const capturePixelRect = mapCssRectToImagePixels(
      relativeBounds,
      { width: session.display.bounds.width, height: session.display.bounds.height },
      session.fullScreenshotSize
    );
    const screenshot = session.fullScreenshot.crop(capturePixelRect);
    session.captureBounds = captureBounds;
    session.capturePixelRect = capturePixelRect;
    session.screenshot = screenshot;
    session.screenshotSize = screenshot.getSize();

    console.info("[region-capture] overlay", JSON.stringify({
      captureBounds,
      capturePixelRect,
      screenshotSize: session.screenshotSize
    }));
  }

  async start() {
    if (this.session) return false;

    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    this.session = { display, phase: "capturing", overlay: null };
    this.closePreview();
    this.onHideBall();

    try {
      await delay(140);
      if (!this.session) return false;
      const capture = await this.captureDisplay(display);
      if (!this.session) return false;
      Object.assign(this.session, capture);

      console.info("[region-capture] display", JSON.stringify({
        bounds: display.bounds,
        workArea: display.workArea,
        scaleFactor: display.scaleFactor,
        requestedSize: capture.requestedSize,
        fullScreenshotSize: capture.fullScreenshotSize,
        sourceId: capture.sourceId
      }));
      this.createOverlay();
      return true;
    } catch (error) {
      console.error("[region-capture] start failed", error?.message);
      this.finishSession();
      this.onNotice("区域截图启动失败");
      return false;
    }
  }

  createOverlay() {
    const bounds = this.session.display.bounds;
    const overlay = new BrowserWindow({
      ...bounds,
      useContentSize: true,
      show: false,
      frame: false,
      thickFrame: false,
      hasShadow: false,
      transparent: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: "#000000",
      webPreferences: {
        preload: path.join(__dirname, "overlay", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    this.session.overlay = overlay;
    this.session.phase = "selecting";
    overlay.setAlwaysOnTop(true, "screen-saver");
    overlay.loadFile(path.join(__dirname, "overlay", "index.html"));
    overlay.once("ready-to-show", () => {
      if (!this.session || this.session.overlay !== overlay) return;
      overlay.show();
      overlay.focus();
      overlay.webContents.focus();
    });
    overlay.on("closed", () => {
      if (this.session?.overlay === overlay) this.finishSession();
    });
  }

  async confirm(payload) {
    if (!this.session?.screenshot || this.session.phase !== "selecting") return;
    this.session.phase = "finishing";

    try {
      const pixelRect = mapCssRectToImagePixels(
        payload?.rect,
        payload?.viewport,
        this.session.screenshotSize
      );
      if (pixelRect.width < 1 || pixelRect.height < 1) {
        throw new Error("选区尺寸无效");
      }
      const cropped = this.session.screenshot.crop(pixelRect);
      const croppedSize = cropped.getSize();
      console.info("[region-capture] selection", JSON.stringify({
        displayBounds: this.session.display.bounds,
        captureBounds: this.session.captureBounds,
        scaleFactor: this.session.display.scaleFactor,
        devicePixelRatio: payload.viewport.devicePixelRatio,
        cssRect: payload.rect,
        viewport: payload.viewport,
        screenshotSize: this.session.screenshotSize,
        pixelRect,
        croppedSize
      }));

      const imageBuffer = cropped.toPNG();
      const previewData = {
        sessionId: ++this.nextPreviewSessionId,
        state: "recognizing",
        message: "正在识别文字…",
        imageDataUrl: cropped.toDataURL(),
        width: croppedSize.width,
        height: croppedSize.height,
        sourceText: "",
        translatedText: "",
        translationMode: FREE_MODE,
        warnings: []
      };
      const display = this.session.display;
      const task = { id: ++this.nextOcrTaskId };
      this.ocrTask = task;
      this.finishSession();
      this.openPreview(previewData, display);

      try {
        const text = await this.ocrService.recognize(imageBuffer, {
          onProgress: (progress) => this.handleOcrProgress(task, progress)
        });
        if (this.ocrTask !== task) return;
        if (text) {
          this.ocrTask = null;
          this.updatePreview({
            state: "recognized",
            message: "文字识别完成",
            sourceText: text,
            translatedText: "",
            warnings: []
          });
          void this.translatePreview({
            sessionId: previewData.sessionId,
            text,
            mode: FREE_MODE
          });
        } else {
          this.updatePreview({
            state: "empty",
            message: "未识别到文字",
            sourceText: "",
            translatedText: ""
          });
        }
      } catch (error) {
        if (this.ocrTask !== task) return;
        console.error("[ocr] recognition failed", error?.code || error?.message);
          this.updatePreview({
            state: "error",
          message: error?.code === "ocr-initialization-failed"
            ? "本地 OCR 初始化失败"
            : "文字识别失败",
            sourceText: "",
            translatedText: ""
          });
      } finally {
        if (this.ocrTask === task) this.ocrTask = null;
      }
    } catch (error) {
      console.error("[region-capture] crop failed", error?.message);
      this.finishSession();
      this.onNotice("区域截图失败");
    }
  }

  handleOcrProgress(task, progress) {
    if (this.ocrTask !== task || !progress) return;
    if (progress.status === "recognizing text") {
      const percent = Math.max(1, Math.min(99, Math.round(progress.progress * 100)));
      this.updatePreview({ message: `正在识别文字… ${percent}%` });
    } else if (progress.status?.startsWith("loading")) {
      this.updatePreview({ message: "正在加载本地 OCR…" });
    }
  }

  updatePreview(changes) {
    if (!this.previewData) return;
    Object.assign(this.previewData, changes);
    if (this.previewWindow && !this.previewWindow.isDestroyed()) {
      this.previewWindow.webContents.send("region-preview-update", changes);
    }
  }

  isCurrentPreviewSession(sessionId) {
    return Boolean(
      sessionId &&
      this.previewData?.sessionId === sessionId &&
      this.previewWindow &&
      !this.previewWindow.isDestroyed()
    );
  }

  async translatePreview({ sessionId, text, mode }) {
    if (!this.isCurrentPreviewSession(sessionId)) {
      return { ok: false, stale: true };
    }
    let streamedText = "";
    this.updatePreview({
      state: "translating",
      message: mode === FREE_MODE ? "正在翻译…" : "正在进行 AI 精译…",
      sourceText: text,
      translatedText: "",
      translationMode: mode,
      warnings: []
    });

    const outcome = await this.translations.translate({
      sessionId,
      text,
      mode,
      onStatus: (status) => {
        if (!this.isCurrentPreviewSession(sessionId)) return;
        if (status?.stage === "starting") {
          this.updatePreview({ message: "正在启动本地翻译模型…" });
        } else if (status?.stage === "translating") {
          this.updatePreview({ message: "正在翻译…" });
        }
      },
      onChunk: (chunk) => {
        if (!this.isCurrentPreviewSession(sessionId)) return;
        streamedText += chunk;
        this.updatePreview({ translatedText: streamedText });
      },
      onStreamReset: () => {
        streamedText = "";
        if (this.isCurrentPreviewSession(sessionId)) {
          this.updatePreview({
            message: "正在重新连接…",
            translatedText: ""
          });
        }
      }
    });

    if (!this.isCurrentPreviewSession(sessionId) || outcome.stale) {
      return { ok: false, stale: true };
    }
    if (outcome.ok) {
      const warnings = outcome.result.warnings || [];
      this.updatePreview({
        state: "success",
        message: mode === FREE_MODE ? "免费翻译 · 本地" : "AI 精译",
        translatedText: outcome.result.text,
        translationMode: mode,
        warnings
      });
      return { ok: true, warnings };
    }

    const code = outcome.error?.code || "translation-failed";
    const message = TRANSLATION_ERRORS[code] || "翻译暂时失败";
    if (code !== "translation-cancelled") {
      console.error("[region-translation] failed", code, outcome.error?.message);
    }
    this.updatePreview({
      state: "translation-error",
      message,
      translatedText: "",
      warnings: []
    });
    return { ok: false, code, message };
  }

  cancel(reason = "cancel") {
    if (!this.session) return;
    console.info("[region-capture] cancelled", { reason });
    this.finishSession();
  }

  finishSession() {
    const overlay = this.session?.overlay;
    this.session = null;
    if (overlay && !overlay.isDestroyed()) overlay.destroy();
    this.onRestoreBall();
  }

  openPreview(previewData, display) {
    this.closePreview();
    this.previewData = previewData;
    const width = Math.min(780, Math.round(display.workArea.width * 0.82));
    const height = Math.min(640, Math.round(display.workArea.height * 0.82));
    const x = display.workArea.x + Math.round((display.workArea.width - width) / 2);
    const y = display.workArea.y + Math.round((display.workArea.height - height) / 2);

    const preview = new BrowserWindow({
      x,
      y,
      width,
      height,
      minWidth: 480,
      minHeight: 440,
      show: false,
      frame: false,
      resizable: true,
      fullscreenable: false,
      backgroundColor: "#fff8ea",
      title: "区域翻译",
      icon: APP_ICON_PATH,
      webPreferences: {
        preload: path.join(__dirname, "preview", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    this.previewWindow = preview;
    preview.loadFile(path.join(__dirname, "preview", "index.html"));
    preview.once("ready-to-show", () => {
      preview.show();
      preview.focus();
    });
    preview.webContents.on("context-menu", (_event, params) => {
      const template = [];
      if (params.isEditable && params.selectionText) {
        template.push({ label: "剪切", role: "cut" });
      }
      if (params.selectionText) template.push({ label: "复制", role: "copy" });
      if (params.isEditable) template.push({ label: "粘贴", role: "paste" });
      if (template.length) Menu.buildFromTemplate(template).popup({ window: preview });
    });
    preview.on("closed", () => {
      this.translations.cancel();
      if (this.previewWindow === preview) this.previewWindow = null;
      this.previewData = null;
    });
  }

  closePreview() {
    this.translations.cancel();
    if (this.previewWindow && !this.previewWindow.isDestroyed()) {
      this.previewWindow.destroy();
    }
    this.previewWindow = null;
    this.previewData = null;
  }

  closeAll({ restoreBall = true } = {}) {
    this.ocrTask = null;
    this.translations.cancel();
    if (this.session) {
      if (restoreBall) {
        this.finishSession();
      } else {
        const overlay = this.session.overlay;
        this.session = null;
        if (overlay && !overlay.isDestroyed()) overlay.destroy();
      }
    }
    this.closePreview();
  }
}

module.exports = { RegionCaptureController };
