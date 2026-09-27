const test = require("node:test");
const assert = require("node:assert/strict");
const {
  AI_PRECISE_MODE,
  FREE_MODE,
  TRANSLATION_MODES,
  preferredModeFromConfig,
  resolveTranslationMode
} = require("../src/services/translator/translation-modes");
const {
  DEFAULT_TRANSLATOR_CONFIG
} = require("../src/services/translator/translator-config-store");

test("keeps legacy configured API installations in AI precise mode", () => {
  assert.equal(
    resolveTranslationMode({
      provider: "openai-compatible",
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat"
    }),
    AI_PRECISE_MODE
  );
});

test("prefers free translation by default without changing saved AI credentials", () => {
  assert.equal(preferredModeFromConfig({ model: "example-model" }), FREE_MODE);
  assert.equal(
    preferredModeFromConfig({ preferFree: false, model: "example-model" }),
    AI_PRECISE_MODE
  );
});

test("keeps fresh online AI settings provider-neutral", () => {
  assert.equal(DEFAULT_TRANSLATOR_CONFIG.provider, "openai-compatible");
  assert.equal(DEFAULT_TRANSLATOR_CONFIG.baseUrl, "");
  assert.equal(DEFAULT_TRANSLATOR_CONFIG.model, "");
  assert.equal(DEFAULT_TRANSLATOR_CONFIG.preferFree, true);
});

test("uses the local free mode as the default for fresh installations", () => {
  assert.equal(resolveTranslationMode({}), FREE_MODE);
  assert.equal(
    TRANSLATION_MODES.find((mode) => mode.id === FREE_MODE).available,
    true
  );
});

test("honors an explicitly saved translation mode", () => {
  assert.equal(
    resolveTranslationMode({ mode: AI_PRECISE_MODE, model: "" }),
    AI_PRECISE_MODE
  );
});
