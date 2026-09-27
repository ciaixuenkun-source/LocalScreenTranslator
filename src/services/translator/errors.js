class TranslatorError extends Error {
  constructor(message, { code = "translation-failed", retryable = false } = {}) {
    super(message);
    this.name = "TranslatorError";
    this.code = code;
    this.retryable = retryable;
  }
}

class TranslatorConfigurationError extends TranslatorError {
  constructor(message = "尚未配置翻译服务") {
    super(message, { code: "provider-not-configured", retryable: false });
    this.name = "TranslatorConfigurationError";
  }
}

class TranslatorCancelledError extends TranslatorError {
  constructor() {
    super("翻译已取消", { code: "translation-cancelled", retryable: false });
    this.name = "TranslatorCancelledError";
  }
}

module.exports = {
  TranslatorError,
  TranslatorConfigurationError,
  TranslatorCancelledError
};
