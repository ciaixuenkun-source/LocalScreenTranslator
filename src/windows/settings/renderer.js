const hotkeyList = document.getElementById("hotkeyList");
const captureOverlay = document.getElementById("captureOverlay");
const capturedValue = document.getElementById("capturedValue");
const captureError = document.getElementById("captureError");
const confirmCapture = document.getElementById("confirmCapture");
const toast = document.getElementById("toast");
const apiBaseUrl = document.getElementById("apiBaseUrl");
const apiKey = document.getElementById("apiKey");
const modelName = document.getElementById("modelName");
const serviceStatus = document.getElementById("serviceStatus");
const testService = document.getElementById("testService");
const saveService = document.getElementById("saveService");
const defaultAiTranslation = document.getElementById("defaultAiTranslation");
const aiProviderFields = document.getElementById("aiProviderFields");

let snapshot = null;
let captureContext = null;
let capturedBinding = null;
let toastTimer = null;
let serviceBusy = false;

function translatorPayload() {
  return {
    mode: "ai-precise",
    preferFree: !defaultAiTranslation.checked,
    provider: "openai-compatible",
    baseUrl: apiBaseUrl.value.trim(),
    apiKey: apiKey.value.trim(),
    model: modelName.value.trim()
  };
}

function setServiceStatus(message, type = "") {
  serviceStatus.textContent = message;
  serviceStatus.className = `service-status${type ? ` ${type}` : ""}`;
}

function setServiceBusy(busy) {
  serviceBusy = busy;
  updateServiceControls();
}

function updateServiceControls() {
  defaultAiTranslation.disabled = serviceBusy;
  testService.disabled = serviceBusy;
  saveService.disabled = serviceBusy;
  apiBaseUrl.disabled = serviceBusy;
  apiKey.disabled = serviceBusy;
  modelName.disabled = serviceBusy;
  aiProviderFields.hidden = false;
}

function applyTranslatorSnapshot(config) {
  defaultAiTranslation.checked = config.preferFree === false;
  apiBaseUrl.value = config.baseUrl || "";
  modelName.value = config.model || "";
  apiKey.value = "";
  apiKey.placeholder = config.hasApiKey
    ? "已安全保存，留空表示不修改"
    : "请输入 API Key";
  updateServiceControls();
}

const CODE_TO_KEY = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Space: "Space",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Escape: "Escape",
  Enter: "Enter",
  NumpadEnter: "Enter",
  Minus: "Minus",
  Comma: "Comma",
  Period: "Period",
  Slash: "Slash",
  Backslash: "Backslash",
  Semicolon: "Semicolon",
  Quote: "Quote",
  BracketLeft: "LeftBracket",
  BracketRight: "RightBracket"
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 1800);
}

function keyboardBindingFromEvent(event) {
  if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) return null;
  let key = CODE_TO_KEY[event.code];
  if (/^Key[A-Z]$/.test(event.code)) key = event.code.slice(3);
  if (/^Digit[0-9]$/.test(event.code)) key = event.code.slice(5);
  if (/^Numpad[0-9]$/.test(event.code)) key = `num${event.code.slice(6)}`;
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(event.code)) key = event.code;
  if (!key) return null;

  const modifiers = [];
  if (event.ctrlKey) modifiers.push("Control");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (event.metaKey) modifiers.push("Super");
  return { type: "keyboard", accelerator: [...modifiers, key].join("+") };
}

function bindingLabel(binding) {
  if (binding.label) return binding.label;
  return binding.accelerator
    .split("+")
    .map((part) => {
      if (part === "Control") return "Ctrl";
      if (part === "Super") return "Win";
      if (/^num[0-9]$/.test(part)) return `小键盘 ${part.slice(-1)}`;
      return part;
    })
    .join(" + ");
}

function setCapturedBinding(binding) {
  capturedBinding = binding;
  capturedValue.textContent = bindingLabel(binding);
  captureError.textContent = "";
  confirmCapture.disabled = false;
}

function openCapture(action, bindingId = null) {
  captureContext = { action, bindingId };
  capturedBinding = null;
  capturedValue.textContent = "等待输入…";
  captureError.textContent = "";
  confirmCapture.disabled = true;
  captureOverlay.hidden = false;
  window.translatorSettings.beginCapture();
}

function closeCapture() {
  captureOverlay.hidden = true;
  captureContext = null;
  capturedBinding = null;
  window.translatorSettings.cancelCapture();
}

function render() {
  hotkeyList.replaceChildren();
  for (const action of snapshot.actions) {
    const row = document.createElement("div");
    row.className = "hotkey-row";

    const name = document.createElement("div");
    name.className = "action-name";
    name.textContent = action.name;

    const bindings = document.createElement("div");
    bindings.className = "bindings";
    if (action.bindings.length === 0) {
      const empty = document.createElement("span");
      empty.className = "empty-binding";
      empty.textContent = "未设置";
      bindings.append(empty);
    }

    for (const binding of action.bindings) {
      const item = document.createElement("div");
      item.className = `binding${binding.active === false ? " inactive" : ""}`;
      if (binding.error) item.title = binding.error;

      const label = document.createElement("span");
      label.className = "binding-label";
      label.textContent = binding.label;

      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "修改";
      edit.addEventListener("click", () => openCapture(action.id, binding.id));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "删除";
      remove.addEventListener("click", async () => {
        const result = await window.translatorSettings.deleteBinding({
          action: action.id,
          bindingId: binding.id
        });
        if (result.ok) {
          snapshot = result.snapshot;
          render();
          showToast("绑定已删除");
        } else {
          showToast(result.message);
        }
      });

      item.append(label, edit, remove);
      bindings.append(item);
    }

    const add = document.createElement("button");
    add.type = "button";
    add.className = "add-button";
    add.textContent = "添加绑定";
    add.addEventListener("click", () => openCapture(action.id));

    row.append(name, bindings, add);
    hotkeyList.append(row);
  }
}

window.addEventListener("keydown", (event) => {
  if (captureOverlay.hidden || event.repeat) return;
  event.preventDefault();
  event.stopPropagation();
  const binding = keyboardBindingFromEvent(event);
  if (binding) setCapturedBinding(binding);
});

confirmCapture.addEventListener("click", async () => {
  if (!captureContext || !capturedBinding) return;
  const result = await window.translatorSettings.saveBinding({
    ...captureContext,
    binding: capturedBinding
  });
  if (!result.ok) {
    captureError.textContent = result.message;
    return;
  }
  snapshot = result.snapshot;
  captureOverlay.hidden = true;
  captureContext = null;
  capturedBinding = null;
  render();
  showToast("绑定已保存");
});

document.getElementById("cancelCapture").addEventListener("click", closeCapture);

document.getElementById("resetDefaults").addEventListener("click", async () => {
  const result = await window.translatorSettings.resetDefaults();
  if (result.ok) {
    snapshot = result.snapshot;
    render();
    showToast("已恢复默认键位");
  } else {
    showToast(result.message);
  }
});

defaultAiTranslation.addEventListener("change", () => {
  setServiceStatus("设置已修改，点击保存后生效");
});

testService.addEventListener("click", async () => {
  setServiceBusy(true);
  setServiceStatus("正在测试连接…");
  try {
    const result = await window.translatorSettings.testTranslator(
      translatorPayload()
    );
    setServiceStatus(result.message, result.ok ? "success" : "error");
  } catch {
    setServiceStatus("网络连接失败", "error");
  } finally {
    setServiceBusy(false);
  }
});

saveService.addEventListener("click", async () => {
  setServiceBusy(true);
  setServiceStatus("正在保存…");
  try {
    const result = await window.translatorSettings.saveTranslator(
      translatorPayload()
    );
    setServiceStatus(result.message, result.ok ? "success" : "error");
    if (result.ok) applyTranslatorSnapshot(result.snapshot);
  } catch {
    setServiceStatus("保存失败", "error");
  } finally {
    setServiceBusy(false);
  }
});

document.getElementById("showBall").addEventListener("click", () => {
  window.translatorSettings.showBall();
  showToast("球球已显示");
});

document.getElementById("quitTranslator").addEventListener("click", () => {
  window.translatorSettings.quitTranslator();
});

document.getElementById("minimizeButton").addEventListener("click", () => {
  window.translatorSettings.minimize();
});

document.getElementById("closeButton").addEventListener("click", () => {
  window.translatorSettings.close();
});

Promise.all([
  window.translatorSettings.getSnapshot(),
  window.translatorSettings.getTranslatorConfig()
]).then(([hotkeySnapshot, translatorConfig]) => {
  snapshot = hotkeySnapshot;
  render();
  applyTranslatorSnapshot(translatorConfig);
});
