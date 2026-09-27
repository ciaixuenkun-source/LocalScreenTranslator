const FREE_MODE = "free";
const AI_PRECISE_MODE = "ai-precise";

const TRANSLATION_MODES = Object.freeze([
  Object.freeze({
    id: FREE_MODE,
    label: "免费翻译",
    description: "本地 / 免费",
    available: true,
    provider: "qwen-local"
  }),
  Object.freeze({
    id: AI_PRECISE_MODE,
    label: "AI 精译",
    description: "在线 AI / 可能产生费用",
    available: true,
    provider: "openai-compatible"
  })
]);

function getTranslationMode(modeId) {
  return TRANSLATION_MODES.find((mode) => mode.id === modeId) || null;
}

function resolveTranslationMode(config = {}) {
  if (getTranslationMode(config.mode)) return config.mode;

  // Existing installations predate mode selection. A saved model means the
  // current API setup must remain active after migration.
  if (String(config.model || "").trim()) return AI_PRECISE_MODE;
  return FREE_MODE;
}

function preferredModeFromConfig(config = {}) {
  if (typeof config.preferFree === "boolean") {
    return config.preferFree ? FREE_MODE : AI_PRECISE_MODE;
  }
  return FREE_MODE;
}

module.exports = {
  AI_PRECISE_MODE,
  FREE_MODE,
  TRANSLATION_MODES,
  getTranslationMode,
  preferredModeFromConfig,
  resolveTranslationMode
};
