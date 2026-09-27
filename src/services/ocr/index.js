const path = require("path");
const { OcrService } = require("./ocr-service");
const { TesseractOcrProvider } = require("./providers/tesseract-provider");

function createOcrRuntime(userDataPath) {
  const provider = new TesseractOcrProvider({
    modelDirectory: path.join(userDataPath, "ocr-models")
  });
  return new OcrService(provider);
}

module.exports = { createOcrRuntime };
