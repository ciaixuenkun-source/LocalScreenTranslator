const path = require("path");

const RUNTIME_DIR = process.env.TRANSLATOR_LLAMA_RUNTIME_DIR ||
  "D:\\TranslatorRuntimes\\llama.cpp\\b11146-cuda-12.4";
const MODEL_DIR = process.env.TRANSLATOR_QWEN_MODEL_DIR ||
  "D:\\TranslatorModels\\Qwen3-4B-Instruct-2507";

const LOCAL_QWEN_CONFIG = Object.freeze({
  runtimeDirectory: RUNTIME_DIR,
  serverExecutable: path.join(RUNTIME_DIR, "llama-server.exe"),
  modelDirectory: MODEL_DIR,
  modelPath: path.join(MODEL_DIR, "Qwen3-4B-Instruct-2507-Q4_K_M.gguf"),
  modelAlias: "Qwen3-4B-Instruct-2507-Q4_K_M",
  host: "127.0.0.1",
  port: 18473,
  contextSize: 4096,
  idleTimeoutMs: 5 * 60 * 1000,
  startupTimeoutMs: 180000,
  requestTimeoutMs: 120000
});

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

module.exports = { LOCAL_QWEN_CONFIG, serverArguments };
