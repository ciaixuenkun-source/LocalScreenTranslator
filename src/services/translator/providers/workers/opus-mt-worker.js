const { parentPort, workerData } = require("node:worker_threads");

let translator = null;
let initializationPromise = null;
let queue = Promise.resolve();

async function initialize() {
  if (translator) return;
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    const { env, pipeline } = await import("@huggingface/transformers");
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.localModelPath = workerData.localModelPath;
    env.cacheDir = workerData.cacheDirectory;
    env.fetch = async (input) => {
      throw new Error(`OPUS-MT offline worker blocked network access: ${String(input)}`);
    };
    translator = await pipeline("translation", workerData.modelId, {
      dtype: workerData.dtype,
      device: "cpu"
    });
  })();
  return initializationPromise;
}

async function handleMessage(message) {
  if (message.type === "initialize") {
    const startedAt = performance.now();
    await initialize();
    return { loadMs: performance.now() - startedAt };
  }
  if (message.type === "translate") {
    await initialize();
    const result = await translator(message.text);
    return { text: result?.[0]?.translation_text || "" };
  }
  if (message.type === "dispose") {
    await translator?.dispose();
    translator = null;
    return { disposed: true };
  }
  throw new Error(`Unknown OPUS-MT worker message: ${message.type}`);
}

parentPort.on("message", (message) => {
  queue = queue
    .then(() => handleMessage(message))
    .then(
      (result) => parentPort.postMessage({ id: message.id, result }),
      (error) => parentPort.postMessage({
        id: message.id,
        error: {
          name: error?.name || "Error",
          message: error?.message || "OPUS-MT worker failed",
          stack: error?.stack || ""
        }
      })
    );
});
