const fs = require("fs");
const path = require("path");
const { cloneBindings, normalizeBinding } = require("./binding-utils");

class HotkeyStore {
  constructor(filePath, defaults) {
    this.filePath = filePath;
    this.defaults = defaults;
  }

  getDefaults() {
    const cloned = cloneBindings(this.defaults);
    for (const bindings of Object.values(cloned)) {
      for (const binding of bindings) {
        Object.assign(binding, normalizeBinding(binding, binding.id));
      }
    }
    return cloned;
  }

  load() {
    try {
      const payload = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      if (![1, 2].includes(payload.version) || typeof payload.bindings !== "object") {
        return this.getDefaults();
      }

      const result = {};
      for (const action of Object.keys(this.defaults)) {
        const savedBindings = Array.isArray(payload.bindings[action])
          ? payload.bindings[action]
          : [];
        result[action] = savedBindings
          .filter((binding) => binding.type === "keyboard")
          .filter(
            (binding) =>
              !["default-area-alt-num1", "default-text-alt-num2"].includes(
                binding.id
              )
          )
          .map((binding) => normalizeBinding(binding, binding.id));
      }
      return result;
    } catch {
      return this.getDefaults();
    }
  }

  save(bindings) {
    const directory = path.dirname(this.filePath);
    const temporaryPath = `${this.filePath}.tmp`;
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      temporaryPath,
      JSON.stringify({ version: 2, bindings }, null, 2)
    );
    fs.renameSync(temporaryPath, this.filePath);
  }
}

module.exports = { HotkeyStore };
