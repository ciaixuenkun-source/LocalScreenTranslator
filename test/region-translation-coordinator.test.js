const test = require("node:test");
const assert = require("node:assert/strict");
const {
  RegionTranslationCoordinator
} = require("../src/services/region-capture/region-translation-coordinator");
const {
  AI_PRECISE_MODE,
  FREE_MODE
} = require("../src/services/translator/translation-modes");

test("region translation defaults can route explicitly to the shared free provider", async () => {
  const calls = [];
  const service = {
    translate: async (text, options) => {
      calls.push({ text, mode: options.mode, detailed: options.includeDetails });
      options.onStatus({ stage: "starting" });
      options.onChunk("本地译文");
      return { text: "本地译文", warnings: [], provider: "qwen-local" };
    }
  };
  const statuses = [];
  const chunks = [];
  const coordinator = new RegionTranslationCoordinator(service);
  const outcome = await coordinator.translate({
    sessionId: 1,
    text: "source",
    mode: FREE_MODE,
    onStatus: (status) => statuses.push(status.stage),
    onChunk: (chunk) => chunks.push(chunk)
  });
  assert.equal(outcome.ok, true);
  assert.deepEqual(calls, [{ text: "source", mode: FREE_MODE, detailed: true }]);
  assert.deepEqual(statuses, ["starting"]);
  assert.equal(chunks.join(""), "本地译文");
});

test("AI precise is used only when the region request explicitly selects it", async () => {
  const modes = [];
  const coordinator = new RegionTranslationCoordinator({
    translate: async (_text, options) => {
      modes.push(options.mode);
      return { text: "AI译文", warnings: [], provider: "AI" };
    }
  });
  await coordinator.translate({ sessionId: 2, text: "source", mode: AI_PRECISE_MODE });
  assert.deepEqual(modes, [AI_PRECISE_MODE]);
});

test("a newer region request invalidates an older result", async () => {
  const pending = [];
  const service = {
    translate: (text, options) => new Promise((resolve, reject) => {
      const item = { text, resolve, reject };
      pending.push(item);
      options.signal.addEventListener("abort", () => {
        const error = new Error("cancelled");
        error.code = "translation-cancelled";
        reject(error);
      }, { once: true });
    })
  };
  const coordinator = new RegionTranslationCoordinator(service);
  const first = coordinator.translate({ sessionId: 10, text: "A", mode: FREE_MODE });
  const second = coordinator.translate({ sessionId: 11, text: "B", mode: FREE_MODE });
  pending.find((item) => item.text === "B").resolve({
    text: "B译文",
    warnings: [],
    provider: "qwen-local"
  });
  assert.equal((await first).stale, true);
  assert.equal((await second).result.text, "B译文");
});
