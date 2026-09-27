const test = require("node:test");
const assert = require("node:assert/strict");
const {
  TranslationWindowController
} = require("../src/windows/translation-window-controller");

test("closing a text window aborts and invalidates every active request", () => {
  const controller = Object.create(TranslationWindowController.prototype);
  let abortCount = 0;
  controller.activeRequests = new Map([
    ["request-a", { abort: () => { abortCount += 1; } }],
    ["request-b", { abort: () => { abortCount += 1; } }]
  ]);

  controller.cancelActiveRequests();

  assert.equal(abortCount, 2);
  assert.equal(controller.activeRequests.size, 0);
});
