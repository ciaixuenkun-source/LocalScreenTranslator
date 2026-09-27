const test = require("node:test");
const assert = require("node:assert/strict");
const {
  AI_PRECISE_MODE,
  FREE_MODE,
  TRANSLATION_MODES,
  preferredModeFromConfig,
  resolveTranslationMode
} = require("../src/services/translator/translation-modes");

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
  assert.equal(preferredModeFromConfig({ model: "deepseek-chat" }), FREE_MODE);
  assert.equal(
    preferredModeFromConfig({ preferFree: false, model: "deepseek-chat" }),
    AI_PRECISE_MODE
  );
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
