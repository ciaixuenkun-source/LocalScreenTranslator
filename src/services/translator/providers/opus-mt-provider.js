const path = require("path");
const { Worker } = require("node:worker_threads");
const {
  TranslatorCancelledError,
  TranslatorConfigurationError,
  TranslatorError
} = require("../errors");
const {
  joinTranslatedChunks,
  protectScientificExpressions,
  splitProtectedSegments,
  splitScientificText
} = require("../bergamot/scientific-text");

class OpusMtProvider {
  constructor({
    localModelPath,
    cacheDirectory = path.join(localModelPath || "", ".cache"),
    modelId = "Xenova/opus-mt-en-zh",
    dtype = "q8",
    maxChunkChars = 400
  } = {}) {
    this.displayName = "Transformers.js + OPUS-MT（试验）";
    this.localModelPath = localModelPath;
    this.cacheDirectory = cacheDirectory;
    this.modelId = modelId;
    this.dtype = dtype;
    this.maxChunkChars = maxChunkChars;
    this.worker = null;
    this.initializationPromise = null;
    this.initializationMs = null;
    this.messageSerial = 0;
    this.requestSerial = 0;
    this.pending = new Map();
  }

  isConfigured() {
    return Boolean(this.localModelPath);
  }

  createWorker() {
    const worker = new Worker(
      path.join(__dirname, "workers", "opus-mt-worker.js"),
      {
        workerData: {
          localModelPath: this.localModelPath,
          cacheDirectory: this.cacheDirectory,
          modelId: this.modelId,
          dtype: this.dtype
        }
      }
    );
    worker.on("message", (message) => {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(Object.assign(new Error(message.error.message), message.error));
      } else {
        pending.resolve(message.result);
      }
    });
    worker.on("error", (error) => this.failPending(error));
    worker.on("exit", (code) => {
      if (code !== 0) this.failPending(new Error(`OPUS-MT worker exited with code ${code}`));
      if (this.worker === worker) this.worker = null;
    });
    this.worker = worker;
  }

  failPending(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  send(type, payload = {}, signal) {
    if (signal?.aborted) return Promise.reject(new TranslatorCancelledError());
    const id = ++this.messageSerial;
    return new Promise((resolve, reject) => {
      const abort = () => {
        this.pending.delete(id);
        reject(new TranslatorCancelledError());
      };
      signal?.addEventListener("abort", abort, { once: true });
      this.pending.set(id, {
        resolve: (value) => {
          signal?.removeEventListener("abort", abort);
          resolve(value);
        },
        reject: (error) => {
          signal?.removeEventListener("abort", abort);
          reject(error);
        }
      });
      this.worker.postMessage({ id, type, ...payload });
    });
  }

  async initialize() {
    if (this.initializationPromise) return this.initializationPromise;
    if (!this.isConfigured()) {
      throw new TranslatorConfigurationError("OPUS-MT 本地模型未安装");
    }
    if (!this.worker) this.createWorker();
    this.initializationPromise = this.send("initialize")
      .then(({ loadMs }) => {
        this.initializationMs = loadMs;
        return loadMs;
      })
      .catch((error) => {
        this.initializationPromise = null;
        throw new TranslatorError(error?.message || "OPUS-MT 初始化失败", {
          code: "opus-mt-initialization-failed"
        });
      });
    return this.initializationPromise;
  }

  assertCurrentRequest(requestId, signal) {
    if (signal?.aborted || requestId !== this.requestSerial) {
      throw new TranslatorCancelledError();
    }
  }

  async translateRaw(text, signal) {
    const result = await this.send("translate", { text }, signal);
    return result.text;
  }

  async translateChunkWithProtection(text, requestId, signal) {
    const { values } = protectScientificExpressions(text);
    const firstPass = await this.translateRaw(text, signal);
    if (values.every((value) => firstPass.includes(value))) return firstPass;

    const translatedSegments = [];
    for (const segment of splitProtectedSegments(text)) {
      this.assertCurrentRequest(requestId, signal);
      if (segment.protected || !/[A-Za-z\u4e00-\u9fff]/.test(segment.text)) {
        translatedSegments.push(segment.text);
      } else {
        translatedSegments.push(await this.translateRaw(segment.text, signal));
      }
    }
    return translatedSegments.join("");
  }

  async translate({ text, signal, onChunk }) {
    await this.initialize();
    const requestId = ++this.requestSerial;
    this.assertCurrentRequest(requestId, signal);
    const invalidate = () => {
      if (requestId === this.requestSerial) this.requestSerial += 1;
    };
    signal?.addEventListener("abort", invalidate, { once: true });

    try {
      const chunks = splitScientificText(text, { maxChars: this.maxChunkChars });
      const translatedChunks = [];
      for (const chunk of chunks) {
        this.assertCurrentRequest(requestId, signal);
        translatedChunks.push({
          paragraphIndex: chunk.paragraphIndex,
          text: await this.translateChunkWithProtection(chunk.text, requestId, signal)
        });
      }
      this.assertCurrentRequest(requestId, signal);
      const translatedText = joinTranslatedChunks(translatedChunks);
      onChunk?.(translatedText);
      return translatedText;
    } catch (error) {
      if (signal?.aborted || requestId !== this.requestSerial || error?.code === "translation-cancelled") {
        throw new TranslatorCancelledError();
      }
      throw new TranslatorError(error?.message || "OPUS-MT 翻译失败", {
        code: "opus-mt-translation-failed"
      });
    } finally {
      signal?.removeEventListener("abort", invalidate);
    }
  }

  async dispose() {
    this.requestSerial += 1;
    if (this.worker) {
      try {
        await this.send("dispose");
      } catch {}
      await this.worker.terminate();
    }
    this.worker = null;
    this.initializationPromise = null;
    this.failPending(new TranslatorCancelledError());
  }
}

module.exports = { OpusMtProvider };
