const fs = require("fs");
const path = require("path");
const { createWorker, OEM, PSM } = require("tesseract.js");
const { OcrError } = require("../errors");

const LANGUAGES = ["eng", "chi_sim"];
const MODEL_VARIANT = "4.0.0_best_int";

function packageModelPath(packageName, language) {
  const packageRoot = path.dirname(require.resolve(`${packageName}/package.json`));
  return path.join(packageRoot, MODEL_VARIANT, `${language}.traineddata.gz`);
}

class TesseractOcrProvider {
  constructor({ modelDirectory }) {
    this.modelDirectory = modelDirectory;
    this.workerPromise = null;
    this.worker = null;
    this.progressListener = null;
    this.disposed = false;
  }

  prepareLocalModels() {
    fs.mkdirSync(this.modelDirectory, { recursive: true });
    const models = [
      ["@tesseract.js-data/eng", "eng"],
      ["@tesseract.js-data/chi_sim", "chi_sim"]
    ];

    for (const [packageName, language] of models) {
      const source = packageModelPath(packageName, language);
      const destination = path.join(
        this.modelDirectory,
        `${language}.traineddata.gz`
      );
      const sourceSize = fs.statSync(source).size;
      const destinationSize = fs.existsSync(destination)
        ? fs.statSync(destination).size
        : -1;
      if (sourceSize !== destinationSize) fs.copyFileSync(source, destination);
    }
  }

  async getWorker() {
    if (this.disposed) {
      throw new OcrError("本地 OCR 已停止", { code: "ocr-disposed" });
    }
    if (this.worker) return this.worker;
    if (!this.workerPromise) {
      this.workerPromise = this.createWorker().catch((error) => {
        this.workerPromise = null;
        throw error;
      });
    }
    return this.workerPromise;
  }

  async createWorker() {
    try {
      this.prepareLocalModels();
      const worker = await createWorker(LANGUAGES, OEM.LSTM_ONLY, {
        langPath: this.modelDirectory,
        cacheMethod: "none",
        gzip: true,
        logger: (message) => this.progressListener?.(message)
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: "1"
      });
      if (this.disposed) {
        await worker.terminate();
        throw new OcrError("本地 OCR 已停止", { code: "ocr-disposed" });
      }
      this.worker = worker;
      return worker;
    } catch (error) {
      throw new OcrError("本地 OCR 初始化失败", {
        code: "ocr-initialization-failed",
        cause: error
      });
    }
  }

  async recognize(image, { onProgress } = {}) {
    this.progressListener = onProgress || null;
    try {
      const worker = await this.getWorker();
      const result = await worker.recognize(image, {}, {
        text: true,
        blocks: true
      });
      return {
        text: result.data.text || "",
        blocks: result.data.blocks || []
      };
    } catch (error) {
      if (error instanceof OcrError) throw error;
      throw new OcrError("文字识别失败", { cause: error });
    } finally {
      this.progressListener = null;
    }
  }

  async dispose() {
    this.disposed = true;
    let worker = this.worker;
    if (!worker && this.workerPromise) {
      try {
        worker = await this.workerPromise;
      } catch {}
    }
    this.worker = null;
    this.workerPromise = null;
    this.progressListener = null;
    if (worker) await worker.terminate();
  }
}

module.exports = { TesseractOcrProvider };
