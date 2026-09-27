const path = require("path");
const { app, globalShortcut } = require("electron");
const { ACTIONS, DEFAULT_BINDINGS } = require("./defaults");
const {
  bindingKey,
  cloneBindings,
  normalizeBinding
} = require("./binding-utils");
const { HotkeyStore } = require("./hotkey-store");

class HotkeyManager {
  constructor(onAction) {
    this.onAction = onAction;
    this.store = new HotkeyStore(
      path.join(app.getPath("userData"), "hotkeys.json"),
      DEFAULT_BINDINGS
    );
    this.bindings = this.store.load();
    this.registrationStatus = new Map();
    this.registeredAccelerators = new Set();
    this.captureActive = false;
  }

  start() {
    this.store.save(this.bindings);
    this.registerAllKeyboardBindings();
  }

  registerAllKeyboardBindings() {
    this.registrationStatus.clear();
    for (const [action, bindings] of Object.entries(this.bindings)) {
      for (const binding of bindings) {
        this.registerKeyboard(binding, action);
      }
    }
  }

  registerKeyboard(binding, action) {
    try {
      const registered = globalShortcut.register(binding.accelerator, () => {
        if (!this.captureActive) this.onAction(action);
      });
      this.registrationStatus.set(binding.id, {
        active: registered,
        error: registered ? "" : "该快捷键已被其他程序或 Windows 占用"
      });
      if (registered) this.registeredAccelerators.add(binding.accelerator);
      return registered;
    } catch {
      this.registrationStatus.set(binding.id, {
        active: false,
        error: "该快捷键无法注册"
      });
      return false;
    }
  }

  beginCapture() {
    this.captureActive = true;
  }

  endCapture() {
    this.captureActive = false;
  }

  findConflict(candidate, excludedBindingId) {
    const key = bindingKey(candidate);
    for (const [action, bindings] of Object.entries(this.bindings)) {
      const conflict = bindings.find(
        (binding) =>
          binding.id !== excludedBindingId && bindingKey(binding) === key
      );
      if (conflict) return { action, binding: conflict };
    }
    return null;
  }

  saveBinding(action, candidate, bindingId = null) {
    if (!(action in ACTIONS)) return { ok: false, message: "未知功能" };

    let binding;
    try {
      binding = normalizeBinding(candidate, bindingId || undefined);
    } catch (error) {
      return { ok: false, message: error.message };
    }

    const conflict = this.findConflict(binding, bindingId);
    if (conflict) {
      return {
        ok: false,
        message: `该按键已用于“${ACTIONS[conflict.action]}”`
      };
    }

    const currentBindings = this.bindings[action];
    const oldIndex = bindingId
      ? currentBindings.findIndex((item) => item.id === bindingId)
      : -1;
    const oldBinding = oldIndex >= 0 ? currentBindings[oldIndex] : null;

    if (
      oldBinding &&
      bindingKey(oldBinding) === bindingKey(binding)
    ) {
      this.endCapture();
      return { ok: true, snapshot: this.getSnapshot() };
    }

    if (!this.registerKeyboard(binding, action)) {
      return {
        ok: false,
        message: "该快捷键无法注册，可能已被其他程序或 Windows 占用"
      };
    }

    if (oldBinding) {
      globalShortcut.unregister(oldBinding.accelerator);
      this.registeredAccelerators.delete(oldBinding.accelerator);
    }

    if (oldIndex >= 0) currentBindings.splice(oldIndex, 1, binding);
    else currentBindings.push(binding);
    this.store.save(this.bindings);
    this.endCapture();
    return { ok: true, snapshot: this.getSnapshot() };
  }

  deleteBinding(action, bindingId) {
    if (!(action in ACTIONS)) return { ok: false, message: "未知功能" };
    const bindings = this.bindings[action];
    const index = bindings.findIndex((binding) => binding.id === bindingId);
    if (index < 0) return { ok: false, message: "绑定不存在" };

    const [binding] = bindings.splice(index, 1);
    globalShortcut.unregister(binding.accelerator);
    this.registeredAccelerators.delete(binding.accelerator);
    this.registrationStatus.delete(binding.id);
    this.store.save(this.bindings);
    return { ok: true, snapshot: this.getSnapshot() };
  }

  resetDefaults() {
    const previousBindings = cloneBindings(this.bindings);
    this.unregisterManagedKeyboardBindings();
    this.bindings = this.store.getDefaults();
    this.registerAllKeyboardBindings();

    const failed = [...this.registrationStatus.values()].some(
      (status) => !status.active
    );
    if (failed) {
      this.unregisterManagedKeyboardBindings();
      this.bindings = previousBindings;
      this.registerAllKeyboardBindings();
      return {
        ok: false,
        message: "默认快捷键中有按键被其他程序占用，未进行修改"
      };
    }

    this.store.save(this.bindings);
    this.endCapture();
    return { ok: true, snapshot: this.getSnapshot() };
  }

  getSnapshot() {
    const actions = Object.entries(ACTIONS).map(([id, name]) => ({
      id,
      name,
      bindings: this.bindings[id].map((binding) => ({
        ...binding,
        ...(this.registrationStatus.get(binding.id) || { active: false })
      }))
    }));
    return { actions };
  }

  unregisterManagedKeyboardBindings() {
    for (const accelerator of this.registeredAccelerators) {
      globalShortcut.unregister(accelerator);
    }
    this.registeredAccelerators.clear();
    this.registrationStatus.clear();
  }

  dispose() {
    this.endCapture();
    this.unregisterManagedKeyboardBindings();
  }
}

module.exports = { HotkeyManager };
