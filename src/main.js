const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const { createTranslatorRuntime } = require("./services/translator");
const {
  TranslationWindowController
} = require("./windows/translation-window-controller");
const { HotkeyManager } = require("./services/hotkeys/hotkey-manager");
const {
  SettingsWindowController
} = require("./windows/settings/settings-window-controller");
const {
  RegionCaptureController
} = require("./services/region-capture/region-capture-controller");
const { createOcrRuntime } = require("./services/ocr");
const { APP_ID, APP_ICON_PATH } = require("./app-assets");
const {
  BALL_STATES,
  DockedBallStateMachine
} = require("./services/floating-ball/docked-ball-state-machine");
const {
  DOCKED_BALL_VISUAL_CONFIG
} = require("./services/floating-ball/docked-ball-visual-config");

const COLLAPSED = { width: 76, height: 76 };
const EXPANDED_WIDTH = 318;
const DEFAULT_EXPANDED_HEIGHT = 240;
const EDGE_SNAP_THRESHOLD = 60;
const COLLAPSED_BALL_TOP = 6;
const EXPANDED_BALL_TOP = 64;
const DOCKED_BALL_CONFIG = DOCKED_BALL_VISUAL_CONFIG;
const DOCKED_HIDDEN = {
  width: DOCKED_BALL_CONFIG.hiddenWindowWidth,
  height: DOCKED_BALL_CONFIG.hiddenWindowHeight
};
const EDGE_DOCK_TOLERANCE = 8;

let mainWindow;
let viewState = "collapsed";
let edge = "right";
let dragState = null;
let expandedHeight = DEFAULT_EXPANDED_HEIGHT;
let translationWindows = null;
let settingsWindow = null;
let hotkeyManager = null;
let regionCapture = null;
let ocrService = null;
let translatorRuntime = null;
let cleanupPromise = null;
let isQuitting = false;
let dockedBall = null;

const statePath = () => path.join(app.getPath("userData"), "window-state.json");

function readSavedState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), "utf8"));
  } catch {
    return {};
  }
}

function saveState(bounds) {
  const payload = { edge, x: bounds.x, y: bounds.y };
  fs.mkdirSync(path.dirname(statePath()), { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify(payload, null, 2));
}

function getWorkAreaFor(bounds) {
  const display = screen.getDisplayMatching(bounds);
  return display.workArea;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function collapsedBoundsFromSaved() {
  const saved = readSavedState();
  const workArea = screen.getPrimaryDisplay().workArea;
  edge = saved.edge === "left" ? "left" : "right";
  const fallbackX =
    edge === "left" ? workArea.x : workArea.x + workArea.width - COLLAPSED.width;
  const x = clamp(
    Number.isFinite(saved.x) ? saved.x : fallbackX,
    workArea.x,
    workArea.x + workArea.width - COLLAPSED.width
  );
  const fallbackY = workArea.y + Math.round(workArea.height * 0.36);
  const y = clamp(
    Number.isFinite(saved.y) ? saved.y : fallbackY,
    workArea.y,
    workArea.y + workArea.height - COLLAPSED.height
  );
  return { x, y, ...COLLAPSED };
}

function expandedBoundsFromCollapsed(bounds) {
  const workArea = getWorkAreaFor(bounds);
  const naturalX =
    edge === "left" ? bounds.x : bounds.x + COLLAPSED.width - EXPANDED_WIDTH;
  const x = clamp(
    naturalX,
    workArea.x,
    workArea.x + workArea.width - EXPANDED_WIDTH
  );
  const targetY = bounds.y + COLLAPSED_BALL_TOP - EXPANDED_BALL_TOP;
  const y = clamp(targetY, workArea.y, workArea.y + workArea.height - expandedHeight);
  return { x, y, width: EXPANDED_WIDTH, height: expandedHeight };
}

function collapsedBoundsFromExpanded(bounds) {
  const workArea = getWorkAreaFor(bounds);
  const naturalX =
    edge === "left" ? bounds.x : bounds.x + EXPANDED_WIDTH - COLLAPSED.width;
  const x = clamp(
    naturalX,
    workArea.x,
    workArea.x + workArea.width - COLLAPSED.width
  );
  const y = clamp(
    bounds.y + EXPANDED_BALL_TOP - COLLAPSED_BALL_TOP,
    workArea.y,
    workArea.y + workArea.height - COLLAPSED.height
  );
  return { x, y, ...COLLAPSED };
}

function isBoundsDocked(bounds) {
  const workArea = getWorkAreaFor(bounds);
  const leftDistance = Math.abs(bounds.x - workArea.x);
  const rightDistance = Math.abs(
    workArea.x + workArea.width - (bounds.x + bounds.width)
  );
  return Math.min(leftDistance, rightDistance) <= EDGE_DOCK_TOLERANCE;
}

function hiddenBoundsFromCollapsed(bounds) {
  const workArea = getWorkAreaFor(bounds);
  const x = edge === "left"
    ? workArea.x
    : workArea.x + workArea.width - DOCKED_HIDDEN.width;
  const centerY = bounds.y + COLLAPSED.height / 2;
  const y = clamp(
    Math.round(centerY - DOCKED_HIDDEN.height / 2),
    workArea.y,
    workArea.y + workArea.height - DOCKED_HIDDEN.height
  );
  return { x, y, ...DOCKED_HIDDEN };
}

function collapsedBoundsFromHidden(bounds) {
  const workArea = getWorkAreaFor(bounds);
  const x = edge === "left"
    ? workArea.x
    : workArea.x + workArea.width - COLLAPSED.width;
  const centerY = bounds.y + DOCKED_HIDDEN.height / 2;
  const y = clamp(
    Math.round(centerY - COLLAPSED.height / 2),
    workArea.y,
    workArea.y + workArea.height - COLLAPSED.height
  );
  return { x, y, ...COLLAPSED };
}

function handleDockedBallStateChange(nextState, previousState) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (previousState === BALL_STATES.DOCKED_HIDDEN && nextState !== previousState) {
    mainWindow.setBounds(collapsedBoundsFromHidden(mainWindow.getBounds()), false);
  }
  if (nextState === BALL_STATES.DOCKED_HIDDEN) {
    mainWindow.setBounds(hiddenBoundsFromCollapsed(mainWindow.getBounds()), false);
  }
  sendWindowState();
}

function sendWindowState() {
  if (!mainWindow) return;
  mainWindow.webContents.send("window-state", {
    mode: viewState,
    edge,
    ballState: dockedBall?.state || BALL_STATES.FLOATING,
    ballConfig: DOCKED_BALL_CONFIG
  });
}

function snapToNearbyEdge() {
  if (!mainWindow) return false;
  const bounds = mainWindow.getBounds();
  const workArea = getWorkAreaFor(bounds);
  const leftDistance = bounds.x - workArea.x;
  const rightDistance =
    workArea.x + workArea.width - (bounds.x + bounds.width);
  const nearLeft = leftDistance <= EDGE_SNAP_THRESHOLD;
  const nearRight = rightDistance <= EDGE_SNAP_THRESHOLD;

  edge =
    bounds.x + bounds.width / 2 < workArea.x + workArea.width / 2
      ? "left"
      : "right";

  if (nearLeft || nearRight) {
    edge = nearLeft && (!nearRight || leftDistance <= rightDistance) ? "left" : "right";
    const x =
      edge === "left"
        ? workArea.x
        : workArea.x + workArea.width - bounds.width;
    mainWindow.setBounds({ ...bounds, x }, true);
  }

  saveState(mainWindow.getBounds());
  sendWindowState();
  return nearLeft || nearRight;
}

function setExpanded(expanded) {
  if (!mainWindow) return;
  if (
    expanded &&
    [BALL_STATES.HIDING, BALL_STATES.DOCKED_HIDDEN, BALL_STATES.REVEALING]
      .includes(dockedBall?.state)
  ) {
    dockedBall?.reveal();
    return;
  }
  const nextState = expanded ? "expanded" : "collapsed";
  if (viewState === nextState) return;

  const bounds = mainWindow.getBounds();
  viewState = nextState;
  const nextBounds = expanded
    ? expandedBoundsFromCollapsed(bounds)
    : collapsedBoundsFromExpanded(bounds);

  mainWindow.setBounds(nextBounds, true);
  saveState(mainWindow.getBounds());
  if (expanded) dockedBall?.menuOpened();
  else dockedBall?.menuClosed();
  sendWindowState();
}

function createWindow() {
  const initialBounds = collapsedBoundsFromSaved();
  mainWindow = new BrowserWindow({
    ...initialBounds,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  dockedBall?.dispose();
  dockedBall = new DockedBallStateMachine({
    ...DOCKED_BALL_CONFIG,
    onStateChange: handleDockedBallStateChange
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => {
    dockedBall?.setDocked(isBoundsDocked(mainWindow.getBounds()));
    mainWindow.showInactive();
    sendWindowState();
  });
  mainWindow.on("closed", () => {
    dockedBall?.dispose();
    dockedBall = null;
    mainWindow = null;
  });
}

function showFloatingBall(message) {
  if (regionCapture?.isActive()) return;
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    if (message) {
      mainWindow.webContents.once("did-finish-load", () => {
        mainWindow?.webContents.send("app-notice", message);
      });
    }
    return;
  }

  if (!mainWindow.isVisible()) mainWindow.showInactive();
  dockedBall?.reveal();
  if (message) mainWindow.webContents.send("app-notice", message);
}

function hideFloatingBallForCapture() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  dockedBall?.suspend();
  const bounds = mainWindow.getBounds();
  mainWindow.hide();
  if (viewState === "expanded") {
    viewState = "collapsed";
    const collapsedBounds = collapsedBoundsFromExpanded(bounds);
    mainWindow.setBounds(collapsedBounds, false);
    saveState(collapsedBounds);
    sendWindowState();
  }
}

function restoreFloatingBallAfterCapture() {
  if (isQuitting || !mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) mainWindow.showInactive();
  dockedBall?.resume();
  sendWindowState();
}

function handleFeatureAction(action) {
  if (regionCapture?.isActive()) return;
  if (action === "areaTranslation") {
    regionCapture?.start();
    return;
  }
  if (action === "textTranslation") {
    translationWindows?.openTextInput();
    return;
  }
  if (action === "settings") settingsWindow?.open();
}

function cleanupServices() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    hotkeyManager?.dispose();
    hotkeyManager = null;
    translationWindows?.closeAll();
    translationWindows = null;
    settingsWindow?.close();
    settingsWindow = null;
    regionCapture?.closeAll({ restoreBall: false });
    regionCapture = null;
    dockedBall?.dispose();
    const pending = [];
    if (ocrService) {
      pending.push(
        ocrService.dispose().catch((error) => {
          console.error("[ocr] shutdown failed", error?.message);
        })
      );
      ocrService = null;
    }
    if (translatorRuntime) {
      pending.push(
        translatorRuntime.dispose().catch((error) => {
          console.error("[qwen] shutdown failed", error?.message);
        })
      );
      translatorRuntime = null;
    }
    await Promise.all(pending);
  })();
  return cleanupPromise;
}

async function quitTranslator() {
  if (isQuitting) return;
  isQuitting = true;
  await cleanupServices();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.destroy();
  }
  app.quit();
}

app.setAppUserModelId(APP_ID);
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showFloatingBall("Translator 已开启");
  });

  app.whenReady().then(() => {
    translatorRuntime = createTranslatorRuntime();
    const { translatorService, translatorSettings } = translatorRuntime;
    translationWindows = new TranslationWindowController(
      translatorService,
      translatorSettings
    );
    createWindow();
    ocrService = createOcrRuntime(app.getPath("userData"));
    regionCapture = new RegionCaptureController({
      ocrService,
      translatorService,
      onHideBall: hideFloatingBallForCapture,
      onRestoreBall: restoreFloatingBallAfterCapture,
      onNotice: (message) => showFloatingBall(message)
    });
    hotkeyManager = new HotkeyManager(handleFeatureAction);
    hotkeyManager.start();
    settingsWindow = new SettingsWindowController(hotkeyManager, {
      translatorSettings,
      onShowBall: () => showFloatingBall(),
      onQuit: quitTranslator
    });
  });
}

app.on("window-all-closed", () => {});
app.on("before-quit", (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;
  cleanupServices().finally(() => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.destroy();
    }
    app.quit();
  });
});

ipcMain.on("expand-menu", () => setExpanded(true));
ipcMain.on("collapse-menu", () => setExpanded(false));

ipcMain.on("trigger-feature", (event, action) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return;
  handleFeatureAction(action);
});

ipcMain.on("set-menu-height", (_event, height) => {
  if (!Number.isFinite(height) || height <= 0) return;
  const nextHeight = Math.ceil(height);
  if (nextHeight === expandedHeight) return;

  if (viewState === "expanded" && mainWindow) {
    const collapsedBounds = collapsedBoundsFromExpanded(mainWindow.getBounds());
    expandedHeight = nextHeight;
    mainWindow.setBounds(expandedBoundsFromCollapsed(collapsedBounds), true);
  } else {
    expandedHeight = nextHeight;
  }
});

ipcMain.on("ball-pointer-presence", (event, inside) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return;
  if (inside) dockedBall?.pointerEntered();
  else dockedBall?.pointerLeft();
});

ipcMain.on("ball-animation-finished", (event, animationState) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return;
  dockedBall?.completeAnimation(animationState);
});

ipcMain.on("drag-start", (_event, point) => {
  if (!mainWindow) return;
  dockedBall?.dragStarted();
  dragState = {
    startPoint: point,
    startBounds: mainWindow.getBounds()
  };
});

ipcMain.on("drag-move", (_event, point) => {
  if (!mainWindow || !dragState) return;
  const dx = point.x - dragState.startPoint.x;
  const dy = point.y - dragState.startPoint.y;
  mainWindow.setBounds({
    ...dragState.startBounds,
    x: Math.round(dragState.startBounds.x + dx),
    y: Math.round(dragState.startBounds.y + dy)
  });
});

ipcMain.on("drag-end", (_event, moved) => {
  dragState = null;
  if (moved) {
    dockedBall?.dragEnded(snapToNearbyEdge());
  } else {
    dockedBall?.dragEnded(isBoundsDocked(mainWindow.getBounds()));
  }
});
