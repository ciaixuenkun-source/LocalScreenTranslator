const test = require("node:test");
const assert = require("node:assert/strict");
const {
  shouldCloseTextWindowOnBlur
} = require("../src/windows/text-input/window-close-policy");

test("an unpinned externally blurred text window closes in every phase", () => {
  for (const phase of ["idle", "translating", "complete", "error", "editing"]) {
    assert.equal(shouldCloseTextWindowOnBlur({
      state: { pinned: false, phase },
      windowFocused: false,
      windowMinimized: false
    }), true);
  }
});

test("pinned, focused, and minimized windows do not close on blur", () => {
  assert.equal(shouldCloseTextWindowOnBlur({
    state: { pinned: true }, windowFocused: false, windowMinimized: false
  }), false);
  assert.equal(shouldCloseTextWindowOnBlur({
    state: { pinned: false }, windowFocused: true, windowMinimized: false
  }), false);
  assert.equal(shouldCloseTextWindowOnBlur({
    state: { pinned: false }, windowFocused: false, windowMinimized: true
  }), false);
});

test("a pin toggle cannot be mistaken for an external click", () => {
  assert.equal(shouldCloseTextWindowOnBlur({
    state: {
      pinned: false,
      pinTransitionUntil: Date.now() + 500
    },
    windowFocused: false,
    windowMinimized: false
  }), false);
});
