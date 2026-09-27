const statusText = document.getElementById("statusText");
const previewImage = document.getElementById("previewImage");
const sizeText = document.getElementById("sizeText");
const ocrText = document.getElementById("ocrText");
const translatedText = document.getElementById("translatedText");
const warningNotice = document.getElementById("warningNotice");
const warningReasonButton = document.getElementById("warningReasonButton");
const warningReason = document.getElementById("warningReason");
const emptyState = document.getElementById("emptyState");
const emptyMessage = document.getElementById("emptyMessage");
const retranslateButton = document.getElementById("retranslateButton");
const aiTranslateButton = document.getElementById("aiTranslateButton");

let viewState = {};
let applyingSource = false;
let sourceDirty = false;

function warningCategories(warnings) {
  const categories = new Set();
  for (const warning of warnings || []) {
    if (/数字/.test(warning)) categories.add("数字");
    else if (/样品编号/.test(warning)) categories.add("样品编号");
    else if (/受保护表达/.test(warning)) categories.add("化学式、单位或缩写");
    else if (/否定/.test(warning)) categories.add("否定关系");
    else if (/比较|趋势|方向|条件|程度/.test(warning)) categories.add("比较、趋势或条件");
    else categories.add("关键信息");
  }
  return [...categories];
}

function renderWarnings(warnings) {
  const categories = warningCategories(warnings);
  warningNotice.hidden = categories.length === 0;
  warningReason.textContent = categories.length ? `可能遗漏：${categories.join("、")}` : "";
  warningReason.hidden = true;
  warningReasonButton.hidden = categories.length === 0;
  warningReasonButton.textContent = "查看原因";
  warningReasonButton.setAttribute("aria-expanded", "false");
}

function render(update) {
  if (!update) return;
  viewState = { ...viewState, ...update };
  if (typeof update.message === "string") statusText.textContent = update.message;
  if (typeof update.sourceText === "string") {
    applyingSource = true;
    ocrText.value = update.sourceText;
    applyingSource = false;
    sourceDirty = false;
  }
  if (typeof update.translatedText === "string") {
    translatedText.textContent = update.translatedText || "等待译文";
  }
  if (Array.isArray(update.warnings)) renderWarnings(update.warnings);

  const failed = viewState.state === "empty" || viewState.state === "error";
  const busy = viewState.state === "recognizing" || viewState.state === "translating";
  emptyState.hidden = !failed;
  if (failed) emptyMessage.textContent = viewState.message || "未识别到文字";
  ocrText.disabled = viewState.state === "recognizing" || failed;
  translatedText.classList.toggle("loading", busy);
  retranslateButton.hidden = !(sourceDirty || viewState.state === "translation-error");
  retranslateButton.disabled = busy || !ocrText.value.trim();
  aiTranslateButton.disabled = busy || failed || !ocrText.value.trim();
}

async function requestTranslation(mode) {
  const text = ocrText.value.trim();
  if (!text) return;
  sourceDirty = false;
  render({
    state: "translating",
    message: mode === "free" ? "正在翻译…" : "正在进行 AI 精译…",
    translatedText: ""
  });
  const result = await window.regionPreview.translate({ text, mode });
  if (!result?.ok && !result?.stale && result?.message) {
    render({ state: "translation-error", message: result.message });
  }
}

function reselect() {
  window.regionPreview.reselect();
}

ocrText.addEventListener("input", () => {
  if (applyingSource) return;
  sourceDirty = true;
  window.regionPreview.cancelTranslation();
  translatedText.textContent = "等待重新翻译";
  render({ state: "editing", message: "原文已修改" });
});

ocrText.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.key === "Enter") {
    event.preventDefault();
    requestTranslation("free");
  }
});

retranslateButton.addEventListener("click", () => requestTranslation("free"));
aiTranslateButton.addEventListener("click", () => requestTranslation("ai-precise"));
warningReasonButton.addEventListener("click", () => {
  const expanded = warningReasonButton.getAttribute("aria-expanded") === "true";
  warningReasonButton.setAttribute("aria-expanded", String(!expanded));
  warningReasonButton.textContent = expanded ? "查看原因" : "收起原因";
  warningReason.hidden = expanded;
});
document.getElementById("reselectButton").addEventListener("click", reselect);
document.getElementById("emptyReselectButton").addEventListener("click", reselect);
document.getElementById("closeButton").addEventListener("click", () => {
  window.regionPreview.close();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.regionPreview.close();
});

window.regionPreview.onUpdate(render);
window.regionPreview.getBootstrap().then((bootstrap) => {
  if (!bootstrap) return;
  previewImage.src = bootstrap.imageDataUrl;
  sizeText.textContent = `${bootstrap.width} × ${bootstrap.height}`;
  render(bootstrap);
});
