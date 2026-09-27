const fs = require("fs");
const path = require("path");
const { app, safeStorage } = require("electron");

class SecureCredentialStore {
  constructor(fileName = "translator-credentials.bin") {
    this.filePath = path.join(app.getPath("userData"), fileName);
  }

  readAll() {
    try {
      if (!safeStorage.isEncryptionAvailable()) return {};
      const encrypted = fs.readFileSync(this.filePath);
      return JSON.parse(safeStorage.decryptString(encrypted));
    } catch {
      return {};
    }
  }

  get(key) {
    return this.readAll()[key] || null;
  }

  set(key, value) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("当前系统无法安全保存凭据");
    }

    const credentials = this.readAll();
    credentials[key] = value;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const encrypted = safeStorage.encryptString(JSON.stringify(credentials));
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, encrypted);
    fs.renameSync(temporaryPath, this.filePath);
  }

  delete(key) {
    const credentials = this.readAll();
    if (!(key in credentials)) return;
    delete credentials[key];
    const encrypted = safeStorage.encryptString(JSON.stringify(credentials));
    fs.writeFileSync(this.filePath, encrypted);
  }

  has(key) {
    return Boolean(this.get(key));
  }
}

module.exports = { SecureCredentialStore };
