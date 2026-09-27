const appEl = document.getElementById("app");
const ballEl = document.getElementById("ball");
const ballArtEl = ballEl.querySelector(".ball-art");
const edgeSensorEl = document.getElementById("edgeSensor");
const animationDollEl = document.getElementById("animationDoll");
const menuEl = document.querySelector(".menu");
const toastEl = document.getElementById("toast");
const DRAG_THRESHOLD = 3;

let expandTimer = null;
let collapseTimer = null;
let toastTimer = null;
let dragging = false;
let moved = false;
let dragOrigin = null;
let currentMode = "collapsed";
let currentBallState = "floating";
let pointerInside = false;
let dragTarget = null;

const BALL_STATE_CLASSES = [
  "ball-state-floating",
  "ball-state-docked-visible",
  "ball-state-hiding",
  "ball-state-docked-hidden",
  "ball-state-revealing"
];

function reportMenuHeight() {
  const menuStyles = window.getComputedStyle(menuEl);
  const menuTop = Number.parseFloat(menuStyles.top) || 0;
  const bottomPadding = menuTop;
  window.translatorShell.setMenuHeight(
    Math.ceil(menuTop + menuEl.offsetHeight + bottomPadding)
  );
}

reportMenuHeight();
window.addEventListener("resize", reportMenuHeight);

function screenPoint(event) {
  return { x: Math.round(event.screenX), y: Math.round(event.screenY) };
}

function clearHoverTimers() {
  window.clearTimeout(expandTimer);
  window.clearTimeout(collapseTimer);
}

function scheduleExpand() {
  clearHoverTimers();
  expandTimer = window.setTimeout(() => {
    if (
      !dragging &&
      ["floating", "docked-visible"].includes(currentBallState)
    ) {
      window.translatorShell.expandMenu();
    }
  }, 340);
}

function scheduleCollapse() {
  clearHoverTimers();
  collapseTimer = window.setTimeout(() => {
    if (!dragging) window.translatorShell.collapseMenu();
  }, 430);
}

function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.classList.remove("visible");
  }, 1500);
}

window.translatorShell.onWindowState((state) => {
  const previousBallState = currentBallState;
  const hidingPath = previousBallState === "hiding"
    ? animationDollEl.parentElement.getAnimations().find(
      (animation) => animation.animationName === "dock-doll-edge-path"
    )
    : null;
  const hidingPathTime = Number(hidingPath?.currentTime) || 0;
  currentMode = state.mode;
  currentBallState = state.ballState || "floating";
  appEl.classList.toggle("expanded", state.mode === "expanded");
  appEl.classList.toggle("collapsed", state.mode !== "expanded");
  appEl.classList.toggle("edge-left", state.edge === "left");
  appEl.classList.toggle("edge-right", state.edge !== "left");
  appEl.classList.remove(...BALL_STATE_CLASSES);
  appEl.classList.add(`ball-state-${currentBallState}`);
  if (state.ballConfig) {
    appEl.style.setProperty("--hide-duration", `${state.ballConfig.hideAnimationMs}ms`);
    appEl.style.setProperty("--reveal-duration", `${state.ballConfig.revealAnimationMs}ms`);
    appEl.style.setProperty("--reveal-entry-duration", `${state.ballConfig.revealEntryMs}ms`);
    appEl.style.setProperty("--reveal-settle-duration", `${state.ballConfig.revealSettleMs}ms`);
    appEl.style.setProperty("--reveal-settle-delay", `${state.ballConfig.revealEntryMs}ms`);
    appEl.style.setProperty("--reveal-bag-delay", `${state.ballConfig.revealBagDelayMs}ms`);
    appEl.style.setProperty("--hidden-scale", state.ballConfig.hiddenScale);
  }
  if (previousBallState === "hiding" && currentBallState === "revealing") {
    const entryDuration = state.ballConfig?.revealEntryMs || 500;
    const traversed = Math.min(entryDuration, hidingPathTime);
    appEl.style.setProperty("--reveal-settle-delay", `${traversed}ms`);
    window.requestAnimationFrame(() => {
      const reversePath = animationDollEl.parentElement.getAnimations().find(
        (animation) => animation.animationName === "dock-doll-edge-path"
      );
      if (!reversePath) return;
      reversePath.currentTime = entryDuration - traversed;
      reversePath.play();
    });
  }
  if (
    previousBallState === "revealing" &&
    currentBallState === "docked-visible" &&
    pointerInside
  ) {
    scheduleExpand();
  }
});

window.translatorShell.onAppNotice(showToast);

appEl.addEventListener("mouseenter", () => {
  pointerInside = true;
  window.translatorShell.setPointerPresence(true);
  if (["floating", "docked-visible"].includes(currentBallState)) scheduleExpand();
  else clearHoverTimers();
});
appEl.addEventListener("mouseleave", () => {
  pointerInside = false;
  window.translatorShell.setPointerPresence(false);
  scheduleCollapse();
});

function beginDrag(event) {
  if (event.button !== 0) return;
  dragging = true;
  moved = false;
  dragOrigin = screenPoint(event);
  dragTarget = event.currentTarget;
  appEl.classList.add("dragging");
  dragTarget.setPointerCapture(event.pointerId);
  window.translatorShell.startDrag(screenPoint(event));
}

ballEl.addEventListener("pointerdown", beginDrag);
edgeSensorEl.addEventListener("pointerdown", beginDrag);

function moveDrag(event) {
  if (!dragging) return;
  const point = screenPoint(event);
  if (
    !moved &&
    Math.hypot(point.x - dragOrigin.x, point.y - dragOrigin.y) < DRAG_THRESHOLD
  ) {
    return;
  }
  moved = true;
  window.translatorShell.moveDrag(point);
}

ballEl.addEventListener("pointermove", moveDrag);
edgeSensorEl.addEventListener("pointermove", moveDrag);

function finishDrag(event) {
  if (!dragging) return;
  dragging = false;
  appEl.classList.remove("dragging");
  if (dragTarget?.hasPointerCapture(event.pointerId)) {
    dragTarget.releasePointerCapture(event.pointerId);
  }
  window.translatorShell.endDrag(moved);
  dragOrigin = null;
  dragTarget = null;
}

ballEl.addEventListener("pointerup", finishDrag);
ballEl.addEventListener("pointercancel", finishDrag);
edgeSensorEl.addEventListener("pointerup", finishDrag);
edgeSensorEl.addEventListener("pointercancel", finishDrag);

ballEl.addEventListener("click", () => {
  if (moved || !["floating", "docked-visible"].includes(currentBallState)) return;
  ballArtEl.classList.remove("bouncing");
  void ballArtEl.offsetWidth;
  ballArtEl.classList.add("bouncing");
  if (currentMode !== "expanded") window.translatorShell.expandMenu();
});

edgeSensorEl.addEventListener("click", () => {
  if (!moved) window.translatorShell.setPointerPresence(true);
});

ballArtEl.addEventListener("animationend", () => {
  ballArtEl.classList.remove("bouncing");
});

animationDollEl.addEventListener("animationend", () => {
  if (["hiding", "revealing"].includes(currentBallState)) {
    window.translatorShell.animationFinished(currentBallState);
  }
});

document.querySelectorAll(".menu-item").forEach((button) => {
  button.addEventListener("click", () => {
    window.translatorShell.triggerFeature(button.dataset.action);
  });
});
