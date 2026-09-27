class OcrError extends Error {
  constructor(message, { code = "ocr-failed", cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "OcrError";
    this.code = code;
  }
}

module.exports = { OcrError };
