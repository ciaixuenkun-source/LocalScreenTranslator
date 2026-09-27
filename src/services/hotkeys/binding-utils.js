const { randomUUID } = require("crypto");

const MODIFIER_ORDER = ["Control", "Alt", "Shift", "Super"];
const MODIFIERS = new Set(MODIFIER_ORDER);
const KEY_PATTERN = /^(?:[A-Z]|[0-9]|num[0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Up|Down|Left|Right|Space|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Escape|Enter|Plus|Minus|Comma|Period|Slash|Backslash|Semicolon|Quote|LeftBracket|RightBracket)$/;

function keyboardLabel(accelerator) {
  return accelerator
    .split("+")
    .map((part) => {
      if (part === "Control") return "Ctrl";
      if (part === "Super") return "Win";
      if (/^num[0-9]$/.test(part)) return `小键盘 ${part.slice(-1)}`;
      return part;
    })
    .join(" + ");
}

function normalizeKeyboardAccelerator(value) {
  if (typeof value !== "string") throw new Error("键盘组合无效");
  const parts = value.split("+").filter(Boolean);
  const key = parts.at(-1);
  const modifiers = [...new Set(parts.slice(0, -1))];

  if (!KEY_PATTERN.test(key) || modifiers.some((part) => !MODIFIERS.has(part))) {
    throw new Error("该键盘组合暂不支持");
  }

  modifiers.sort(
    (left, right) => MODIFIER_ORDER.indexOf(left) - MODIFIER_ORDER.indexOf(right)
  );
  return [...modifiers, key].join("+");
}

function normalizeBinding(candidate, existingId) {
  if (candidate?.type === "keyboard") {
    const accelerator = normalizeKeyboardAccelerator(candidate.accelerator);
    return {
      id: existingId || randomUUID(),
      type: "keyboard",
      accelerator,
      label: keyboardLabel(accelerator)
    };
  }

  throw new Error("当前版本仅支持键盘快捷键");
}

function bindingKey(binding) {
  return `keyboard:${binding.accelerator.toLowerCase()}`;
}

function cloneBindings(bindings) {
  return JSON.parse(JSON.stringify(bindings));
}

module.exports = {
  bindingKey,
  cloneBindings,
  keyboardLabel,
  normalizeBinding
};
