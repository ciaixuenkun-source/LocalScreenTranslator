const screenImage = document.getElementById("screenImage");
const initialShade = document.getElementById("initialShade");
const selection = document.getElementById("selection");
const sizeLabel = document.getElementById("sizeLabel");
const controls = document.getElementById("controls");

let selecting = false;
let startPoint = null;
let selectedRect = null;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function pointFromEvent(event) {
  return {
    x: clamp(event.clientX, 0, window.innerWidth),
    y: clamp(event.clientY, 0, window.innerHeight)
  };
}

function normalizedRect(start, end) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  };
}

function renderSelection(rect, final = false) {
  selectedRect = rect;
  selection.hidden = false;
  initialShade.hidden = true;
  selection.style.left = `${rect.x}px`;
  selection.style.top = `${rect.y}px`;
  selection.style.width = `${rect.width}px`;
  selection.style.height = `${rect.height}px`;
  selection.classList.toggle("near-top", rect.y < 32);
  sizeLabel.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;

  controls.hidden = !final;
  if (!final) return;
  const controlWidth = 74;
  const controlHeight = 38;
  const left = clamp(
    rect.x + rect.width - controlWidth,
    8,
    window.innerWidth - controlWidth - 8
  );
  const preferredTop = rect.y + rect.height + 8;
  const top = preferredTop + controlHeight <= window.innerHeight
    ? preferredTop
    : Math.max(8, rect.y - controlHeight - 8);
  controls.style.left = `${left}px`;
  controls.style.top = `${top}px`;
}

function resetSelection() {
  selecting = false;
  startPoint = null;
  selectedRect = null;
  selection.hidden = true;
  controls.hidden = true;
  initialShade.hidden = false;
}

window.addEventListener("mousedown", (event) => {
  if (event.button !== 0 || event.target.closest(".controls")) return;
  selecting = true;
  startPoint = pointFromEvent(event);
  renderSelection({ ...startPoint, width: 0, height: 0 });
});

window.addEventListener("mousemove", (event) => {
  if (!selecting) return;
  renderSelection(normalizedRect(startPoint, pointFromEvent(event)));
});

window.addEventListener("mouseup", (event) => {
  if (event.button !== 0 || !selecting) return;
  selecting = false;
  const rect = normalizedRect(startPoint, pointFromEvent(event));
  if (rect.width < 3 || rect.height < 3) {
    resetSelection();
    return;
  }
  renderSelection(rect, true);
});

window.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  window.regionCapture.cancel("right-click");
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.regionCapture.cancel("escape");
});

document.getElementById("confirmButton").addEventListener("click", (event) => {
  event.stopPropagation();
  if (!selectedRect) return;
  window.regionCapture.confirm({
    rect: selectedRect,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio
    }
  });
});

document.getElementById("cancelButton").addEventListener("click", (event) => {
  event.stopPropagation();
  window.regionCapture.cancel("button");
});

window.regionCapture.getBootstrap().then((bootstrap) => {
  if (!bootstrap) return;
  screenImage.src = bootstrap.screenshotDataUrl;
  screenImage.addEventListener("load", () => window.focus(), { once: true });
});
