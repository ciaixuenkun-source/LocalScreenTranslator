const path = require("path");

function normalizeDirectory(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createLocalQwenConfig({
  runtimeDirectory = process.env.TRANSLATOR_LLAMA_RUNTIME_DIR,
  modelDirectory = process.env.TRANSLATOR_QWEN_MODEL_DIR
} = {}) {
  const normalizedRuntimeDirectory = normalizeDirectory(runtimeDirectory);
  const normalizedModelDirectory = normalizeDirectory(modelDirectory);
  return Object.freeze({
    runtimeDirectory: normalizedRuntimeDirectory,
    serverExecutable: normalizedRuntimeDirectory
      ? path.join(normalizedRuntimeDirectory, "llama-server.exe")
      : "",
    modelDirectory: normalizedModelDirectory,
    modelPath: normalizedModelDirectory
      ? path.join(
        normalizedModelDirectory,
        "Qwen3-4B-Instruct-2507-Q4_K_M.gguf"
      )
      : "",
    modelAlias: "Qwen3-4B-Instruct-2507-Q4_K_M",
    host: "127.0.0.1",
    port: 18473,
    contextSize: 4096,
    idleTimeoutMs: 5 * 60 * 1000,
    startupTimeoutMs: 180000,
    requestTimeoutMs: 120000
  });
}

const LOCAL_QWEN_CONFIG = createLocalQwenConfig();

function serverArguments(config = LOCAL_QWEN_CONFIG) {
  return [
    "--model", config.modelPath,
    "--alias", config.modelAlias,
    "--host", config.host,
    "--port", String(config.port),
    "--ctx-size", String(config.contextSize),
    "--parallel", "1",
    "--gpu-layers", "auto",
    "--fit", "on",
    "--fit-target", "1024",
    "--cache-type-k", "q8_0",
    "--cache-type-v", "q8_0",
    "--flash-attn", "on",
    "--jinja",
    "--poll", "0",
    "--poll-batch", "0"
  ];
}

module.exports = { createLocalQwenConfig, LOCAL_QWEN_CONFIG, serverArguments };
