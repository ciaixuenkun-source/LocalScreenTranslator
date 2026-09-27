const { normalizeOcrResult } = require("./normalize-text");
const { OcrError } = require("./errors");
const {
  normalizeLocalTextPolarity
} = require("./preprocessing/local-polarity-normalizer");

class OcrService {
  constructor(provider, { preprocess = normalizeLocalTextPolarity } = {}) {
    this.provider = provider;
    this.preprocess = preprocess;
    this.activeRecognition = null;
  }

  recognize(image, options = {}) {
    if (this.activeRecognition) {
      throw new OcrError("已有文字识别任务正在进行", { code: "ocr-busy" });
    }

    const recognition = Promise.resolve()
      .then(() => this.preprocess(image))
      .then((preparedImage) => this.provider.recognize(preparedImage, options))
      .then((result) => normalizeOcrResult(result))
      .finally(() => {
        if (this.activeRecognition === recognition) this.activeRecognition = null;
      });
    this.activeRecognition = recognition;
    return recognition;
  }

  async dispose() {
    await this.provider.dispose();
  }
}

module.exports = { OcrService };
