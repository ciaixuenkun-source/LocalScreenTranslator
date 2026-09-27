const fs = require("fs");
const path = require("path");
const { spawn, execFile } = require("child_process");
const {
  TranslatorCancelledError,
  TranslatorError
} = require("../errors");
const { LOCAL_QWEN_CONFIG, serverArguments } = require("./local-qwen-config");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitWithSignal(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new TranslatorCancelledError());
  return new Promise((resolve, reject) => {
    const abort = () => reject(new TranslatorCancelledError());
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function execFileAsync(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
  });
}

class LlamaRuntimeManager {
  constructor({
    config = LOCAL_QWEN_CONFIG,
    logPath,
    spawnImpl = spawn,
    fetchImpl = fetch,
    now = () => Date.now()
  } = {}) {
    this.config = config;
    this.logPath = logPath || path.join(config.runtimeDirectory, "translator-llama-server.log");
    this.spawnImpl = spawnImpl;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.child = null;
    this.startPromise = null;
    this.ready = false;
    this.activeRequests = 0;
    this.idleTimer = null;
    this.logStream = null;
  }

  get baseUrl() {
    return `http://${this.config.host}:${this.config.port}`;
  }

  availability() {
    const missing = [];
    if (!fs.existsSync(this.config.serverExecutable)) missing.push(this.config.serverExecutable);
    if (!fs.existsSync(this.config.modelPath)) missing.push(this.config.modelPath);
    return { available: missing.length === 0, missing };
  }

  isReady() {
    return Boolean(this.ready && this.child && this.child.exitCode === null);
  }

  beginRequest() {
    this.activeRequests += 1;
    this.clearIdleTimer();
  }

  endRequest() {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    if (this.activeRequests === 0) this.scheduleIdleShutdown();
  }

  clearIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  scheduleIdleShutdown() {
    this.clearIdleTimer();
    if (this.activeRequests > 0) return;
    if (this.startPromise && !this.isReady()) {
      this.startPromise.finally(() => this.scheduleIdleShutdown()).catch(() => undefined);
      return;
    }
    if (!this.child) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.activeRequests === 0) {
        this.stop("idle-timeout").catch((error) => {
          console.error("[qwen] idle shutdown failed", error?.message);
        });
      }
    }, this.config.idleTimeoutMs);
    this.idleTimer.unref?.();
  }

  async ensureReady({ signal, onStatus } = {}) {
    if (signal?.aborted) throw new TranslatorCancelledError();
    if (this.isReady()) return;
    const availability = this.availability();
    if (!availability.available) {
      console.error("[qwen] local runtime unavailable", availability.missing);
      throw new TranslatorError("本地翻译模型不可用", {
        code: "local-model-unavailable"
      });
    }

    onStatus?.({ stage: "starting" });
    if (!this.startPromise) {
      this.startPromise = this.startServer()
        .catch(async (error) => {
          await this.stop("startup-failed").catch(() => undefined);
          throw error;
        })
        .finally(() => {
          this.startPromise = null;
        });
    }
    await waitWithSignal(this.startPromise, signal);
  }

  async startServer() {
    fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
    this.logStream = fs.createWriteStream(this.logPath, { flags: "a" });
    const child = this.spawnImpl(
      this.config.serverExecutable,
      serverArguments(this.config),
      {
        cwd: this.config.runtimeDirectory,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    this.child = child;
    child.stdout?.pipe(this.logStream);
    child.stderr?.pipe(this.logStream);
    child.once("exit", () => {
      if (this.child === child) {
        this.child = null;
        this.ready = false;
      }
      this.closeLogStream();
    });

    const deadline = this.now() + this.config.startupTimeoutMs;
    while (this.now() < deadline) {
      if (child.exitCode !== null) {
        throw new TranslatorError("本地翻译模型启动失败", {
          code: "local-model-start-failed"
        });
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      try {
        const response = await this.fetchImpl(`${this.baseUrl}/health`, {
          signal: controller.signal
        });
        if (response.status === 200) {
          this.ready = true;
          return;
        }
      } catch {
        // The server socket is unavailable while the model is loading.
      } finally {
        clearTimeout(timer);
      }
      await delay(350);
    }
    throw new TranslatorError("本地翻译模型启动超时", {
      code: "local-model-start-failed"
    });
  }

  closeLogStream() {
    if (!this.logStream) return;
    this.logStream.end();
    this.logStream = null;
  }

  async stop(_reason = "manual") {
    this.clearIdleTimer();
    const child = this.child;
    this.ready = false;
    if (!child || child.exitCode !== null) {
      this.child = null;
      this.closeLogStream();
      return;
    }

    const pid = child.pid;
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    let completed = await Promise.race([exited.then(() => true), delay(8000).then(() => false)]);
    if (!completed && pid) {
      await execFileAsync("taskkill.exe", ["/PID", String(pid), "/T", "/F"])
        .catch((error) => console.error("[qwen] forced shutdown failed", error?.message));
      completed = await Promise.race([exited.then(() => true), delay(5000).then(() => false)]);
    }
    if (!completed) console.error("[qwen] llama-server did not exit cleanly", pid);
    if (this.child === child) this.child = null;
    this.closeLogStream();
  }

  dispose() {
    return this.stop("translator-exit");
  }
}

module.exports = { LlamaRuntimeManager, waitWithSignal };
