const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { DEFAULT_BINDINGS } = require("../src/services/hotkeys/defaults");
const { HotkeyStore } = require("../src/services/hotkeys/hotkey-store");

test("removes the retired fullscreen action without changing custom shortcuts", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translator-hotkeys-"));
  const filePath = path.join(directory, "hotkeys.json");
  fs.writeFileSync(filePath, JSON.stringify({
    version: 2,
    bindings: {
      areaTranslation: [{ id: "area", type: "keyboard", accelerator: "Alt+2" }],
      fullscreenTranslation: [{ id: "fullscreen", type: "keyboard", accelerator: "Alt+4" }],
      textTranslation: [{ id: "text", type: "keyboard", accelerator: "Alt+1" }]
    }
  }));

  try {
    const loaded = new HotkeyStore(filePath, DEFAULT_BINDINGS).load();
    assert.deepEqual(Object.keys(loaded), ["areaTranslation", "textTranslation"]);
    assert.equal(loaded.areaTranslation[0].accelerator, "Alt+2");
    assert.equal(loaded.textTranslation[0].accelerator, "Alt+1");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
