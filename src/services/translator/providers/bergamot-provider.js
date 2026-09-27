const fs = require("fs");
const path = require("path");
const { TranslatorCancelledError, TranslatorConfigurationError, TranslatorError } = require("../errors");
const {
  joinTranslatedChunks,
  protectScientificExpressions,
  splitProtectedSegments,
  splitScientificText
} = require("../bergamot/scientific-text");

const REQUIRED_MODEL_FILES = Object.freeze({
  model: "model.bin",
  shortlist: "lexical-shortlist.bin",
  sourceVocab: "source.spm",
  targetVocab: "target.spm"
});

function exactArrayBuffer(buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
}

class BergamotProvider {
  constructor({ modelDirectory, maxChunkChars = 420 } = {}) {
    this.displayName = "Bergamot 免费翻译（试验）";
    this.modelDirectory = modelDirectory;
    this.maxChunkChars = maxChunkChars;
    this.translator = null;
    this.backing = null;
    this.initializationPromise = null;
    this.initializationMs = null;
    this.requestSerial = 0;
  }

  isConfigured() {
    return Boolean(
      this.modelDirectory &&
      Object.values(REQUIRED_MODEL_FILES).every((file) =>
        fs.existsSync(path.join(this.modelDirectory, file))
      )
    );
  }

  async initialize() {
    if (this.translator) return this.initializationMs;
    if (this.initializationPromise) return this.initializationPromise;
    if (!this.isConfigured()) {
      throw new TranslatorConfigurationError("Bergamot 本地模型未安装");
    }

    this.initializationPromise = (async () => {
      const startedAt = performance.now();
      const { LatencyOptimisedTranslator, TranslatorBacking } = await import(
        "@browsermt/bergamot-translator/translator.js"
      );
      const modelDirectory = this.modelDirectory;

      class LocalModelBacking extends TranslatorBacking {
        async loadModelRegistery() {
          return [{ from: "en", to: "zh", files: {} }];
        }

        async loadTranslationModel() {
          const read = async (name) =>
            exactArrayBuffer(await fs.promises.readFile(path.join(modelDirectory, name)));
          const [model, shortlist, sourceVocab, targetVocab] = await Promise.all([
            read(REQUIRED_MODEL_FILES.model),
            read(REQUIRED_MODEL_FILES.shortlist),
            read(REQUIRED_MODEL_FILES.sourceVocab),
            read(REQUIRED_MODEL_FILES.targetVocab)
          ]);
          return {
            model,
            shortlist,
            vocabs: [sourceVocab, targetVocab],
            qualityModel: null,
            config: { "gemm-precision": "int8shiftAlphaAll" }
          };
        }
      }

      const options = {
        pivotLanguage: null,
        cacheSize: 4096,
        downloadTimeout: 0,
        useNativeIntGemm: false
      };
      this.backing = new LocalModelBacking(options);
      this.translator = new LatencyOptimisedTranslator(options, this.backing);
      this.initializationMs = performance.now() - startedAt;
      return this.initializationMs;
    })();

    try {
      return await this.initializationPromise;
    } catch (error) {
      this.initializationPromise = null;
      throw new TranslatorError("Bergamot 初始化失败", {
        code: "bergamot-initialization-failed"
      });
    }
  }

  assertCurrentRequest(requestId, signal) {
    if (signal?.aborted || requestId !== this.requestSerial) {
      throw new TranslatorCancelledError();
    }
  }

  async translateRaw(text) {
    const response = await this.translator.translate({
      from: "en",
      to: "zh",
      text,
      html: false,
      qualityScores: false
    });
    return response.target.text;
  }

  async translateChunkWithProtection(text, requestId, signal) {
    const { values } = protectScientificExpressions(text);
    const firstPass = await this.translateRaw(text);
    if (values.every((value) => firstPass.includes(value))) return firstPass;

    const translatedSegments = [];
    for (const segment of splitProtectedSegments(text)) {
      this.assertCurrentRequest(requestId, signal);
      if (segment.protected || !/[A-Za-z\u4e00-\u9fff]/.test(segment.text)) {
        translatedSegments.push(segment.text);
      } else {
        translatedSegments.push(await this.translateRaw(segment.text));
      }
    }
    return translatedSegments.join("");
  }

  async translate({ text, signal, onChunk }) {
    await this.initialize();
    const requestId = ++this.requestSerial;
    this.assertCurrentRequest(requestId, signal);

    const abort = () => {
      if (this.requestSerial === requestId) this.requestSerial += 1;
    };
    signal?.addEventListener("abort", abort, { once: true });

    try {
      const chunks = splitScientificText(text, {
        maxChars: this.maxChunkChars
      });
      const translatedChunks = [];
      for (const chunk of chunks) {
        this.assertCurrentRequest(requestId, signal);
        const translatedChunk = await this.translateChunkWithProtection(
          chunk.text,
          requestId,
          signal
        );
        this.assertCurrentRequest(requestId, signal);
        translatedChunks.push({
          paragraphIndex: chunk.paragraphIndex,
          text: translatedChunk
        });
      }

      const translatedText = joinTranslatedChunks(translatedChunks);
      this.backing?.buffers?.clear();
      onChunk?.(translatedText);
      return translatedText;
    } catch (error) {
      if (
        signal?.aborted ||
        requestId !== this.requestSerial ||
        error?.name === "CancelledError" ||
        error?.name === "SupersededError"
      ) {
        throw new TranslatorCancelledError();
      }
      throw new TranslatorError(error?.message || "Bergamot 翻译失败", {
        code: "bergamot-translation-failed"
      });
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  }

  dispose() {
    this.requestSerial += 1;
    this.translator?.delete();
    this.translator = null;
    this.backing = null;
    this.initializationPromise = null;
  }
}

module.exports = { BergamotProvider, REQUIRED_MODEL_FILES };
