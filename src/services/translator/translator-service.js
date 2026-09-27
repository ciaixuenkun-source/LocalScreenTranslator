const {
  TranslatorError,
  TranslatorCancelledError
} = require("./errors");
const { SCIENTIFIC_TRANSLATION_INSTRUCTIONS } = require("./prompt");
const {
  AI_PRECISE_MODE,
  FREE_MODE,
  getTranslationMode
} = require("./translation-modes");

function waitBeforeRetry(signal, delayMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new TranslatorCancelledError());
      },
      { once: true }
    );
  });
}

class TranslatorService {
  constructor(provider, { retryCount = 1, retryDelayMs = 350 } = {}) {
    this.provider = provider;
    this.providers = new Map([[AI_PRECISE_MODE, provider]]);
    this.defaultMode = AI_PRECISE_MODE;
    this.retryCount = retryCount;
    this.retryDelayMs = retryDelayMs;
  }

  getProvider(mode = this.defaultMode) {
    return this.providers.get(mode) || null;
  }

  getStatus(mode = this.defaultMode) {
    const provider = this.getProvider(mode);
    return {
      configured: Boolean(provider?.isConfigured()),
      providerName: provider?.displayName || "未配置",
      mode
    };
  }

  setProvider(provider) {
    this.provider = provider;
    this.providers.set(AI_PRECISE_MODE, provider);
  }

  setProviders(providers) {
    for (const [mode, provider] of Object.entries(providers)) {
      if (getTranslationMode(mode) && provider) this.providers.set(mode, provider);
    }
    this.provider = this.providers.get(AI_PRECISE_MODE) || this.provider;
  }

  setDefaultMode(mode) {
    if (!getTranslationMode(mode)) return;
    this.defaultMode = mode;
  }

  async translate(text, {
    mode = this.defaultMode,
    signal,
    onChunk,
    onStreamReset,
    onStatus,
    includeDetails = false
  } = {}) {
    const sourceText = typeof text === "string" ? text.trim() : "";
    if (!sourceText) {
      throw new TranslatorError("请输入需要翻译的文字", {
        code: "empty-input"
      });
    }

    const provider = this.getProvider(mode);
    if (!provider) {
      throw new TranslatorError(
        mode === FREE_MODE ? "本地翻译模型不可用" : "尚未配置翻译服务",
        { code: "provider-not-configured" }
      );
    }

    for (let attempt = 0; attempt <= this.retryCount; attempt += 1) {
      if (signal?.aborted) throw new TranslatorCancelledError();

      try {
        if (attempt > 0) onStreamReset?.();
        const providerResult = await provider.translate({
          text: sourceText,
          targetLanguage: "zh-CN",
          instructions: SCIENTIFIC_TRANSLATION_INSTRUCTIONS,
          signal,
          onChunk,
          onStatus
        });
        const translatedText = typeof providerResult === "string"
          ? providerResult
          : providerResult?.text;

        if (signal?.aborted) throw new TranslatorCancelledError();

        if (typeof translatedText !== "string" || !translatedText.trim()) {
          throw new TranslatorError("翻译服务没有返回有效译文", {
            code: "empty-response",
            retryable: true
          });
        }

        const textResult = translatedText.trim();
        if (!includeDetails) return textResult;
        return {
          text: textResult,
          warnings: Array.isArray(providerResult?.warnings)
            ? providerResult.warnings
            : [],
          provider: providerResult?.provider || provider.displayName || "unknown"
        };
      } catch (error) {
        if (signal?.aborted || error?.name === "AbortError") {
          throw new TranslatorCancelledError();
        }

        const canRetry = Boolean(error?.retryable) && attempt < this.retryCount;
        if (!canRetry) throw error;
        await waitBeforeRetry(signal, this.retryDelayMs);
      }
    }

    throw new TranslatorError("翻译失败，请稍后重试");
  }
}

module.exports = { TranslatorService };
