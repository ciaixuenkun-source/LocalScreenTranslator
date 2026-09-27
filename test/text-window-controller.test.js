const test = require("node:test");
const assert = require("node:assert/strict");
const {
  readClipboardTextOnce,
  TranslationWindowController
} = require("../src/windows/translation-window-controller");

test("reads clipboard text through the Electron 44 asynchronous API", async () => {
  let readCount = 0;
  const text = await readClipboardTextOnce({
    readText: async () => {
      readCount += 1;
      return "  scientific text  ";
    }
  });

  assert.equal(text, "  scientific text  ");
  assert.equal(readCount, 1);
});

test("treats an empty asynchronous clipboard result as no text", async () => {
  const text = await readClipboardTextOnce({
    readText: async () => " \r\n\t "
  });

  assert.equal(text, "");
});

test("treats an asynchronous clipboard read failure as no text", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const text = await readClipboardTextOnce({
      readText: async () => {
        throw new Error("clipboard unavailable");
      }
    });
    assert.equal(text, "");
  } finally {
    console.warn = originalWarn;
  }
});

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
