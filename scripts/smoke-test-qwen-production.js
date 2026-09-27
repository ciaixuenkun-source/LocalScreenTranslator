const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");
const { TranslatorService } = require("../src/services/translator/translator-service");
const { QwenLocalProvider } = require("../src/services/translator/providers/qwen-local-provider");
const { LlamaRuntimeManager } = require("../src/services/translator/qwen/llama-runtime-manager");
const { LOCAL_QWEN_CONFIG } = require("../src/services/translator/qwen/local-qwen-config");
const { AI_PRECISE_MODE, FREE_MODE } = require("../src/services/translator/translation-modes");

const ROOT = path.resolve(__dirname, "..");
const exitAfterSecond = process.env.QWEN_SMOKE_EXIT_AFTER_SECOND === "1";
const outputPath = path.join(
  ROOT,
  "artifacts",
  exitAfterSecond ? "qwen-production-exit-smoke.json" : "qwen-production-idle-smoke.json"
);
const idleTimeoutMs = Number(process.env.QWEN_SMOKE_IDLE_MS || LOCAL_QWEN_CONFIG.idleTimeoutMs);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTranslation(service, text, options = {}) {
  const statuses = [];
  const chunks = [];
  const started = performance.now();
  const result = await service.translate(text, {
    mode: FREE_MODE,
    includeDetails: true,
    signal: options.signal,
    onStatus: (status) => statuses.push({ ...status, atMs: Number((performance.now() - started).toFixed(1)) }),
    onChunk: (chunk) => chunks.push(chunk)
  });
  return {
    ...result,
    statuses,
    streamedText: chunks.join(""),
    durationMs: Number((performance.now() - started).toFixed(1))
  };
}

async function main() {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  let aiCalls = 0;
  const runtime = new LlamaRuntimeManager({
    config: { ...LOCAL_QWEN_CONFIG, idleTimeoutMs },
    logPath: path.join(ROOT, "artifacts", "qwen-production-smoke.log")
  });
  const freeProvider = new QwenLocalProvider(runtime);
  const aiProvider = {
    displayName: "AI route probe",
    isConfigured: () => true,
    translate: async () => {
      aiCalls += 1;
      return "AI route probe";
    }
  };
  const service = new TranslatorService(aiProvider);
  service.setProviders({ [FREE_MODE]: freeProvider, [AI_PRECISE_MODE]: aiProvider });

  const report = {
    startedAt: new Date().toISOString(),
    idleTimeoutMs,
    lazyBeforeFirstRequest: runtime.child === null,
    first: null,
    second: null,
    cancellation: null,
    aiCallsDuringFreeTranslation: null,
    idleReleased: false,
    exitAfterSecond,
    shutdown: null
  };

  try {
    report.first = await runTranslation(
      service,
      "The adsorption capacity of bentonite for NH4+ increased at a lower initial pH."
    );
    report.second = await runTranslation(
      service,
      "Bentonite mainly contains montmorillonite, and the BET specific surface area was 186 m2/g."
    );
    report.aiCallsDuringFreeTranslation = aiCalls;

    if (!exitAfterSecond) {
      const controller = new AbortController();
      const pending = runTranslation(
        service,
        "The electrical double layer and high-affinity sites affected adsorption. ".repeat(20),
        { signal: controller.signal }
      ).then(
        () => ({ cancelled: false }),
        (error) => ({ cancelled: error?.code === "translation-cancelled", code: error?.code })
      );
      setTimeout(() => controller.abort(), 120);
      report.cancellation = await pending;

      await delay(idleTimeoutMs + 1500);
      report.idleReleased = runtime.child === null && !runtime.isReady();
    }
  } finally {
    const shutdownStarted = performance.now();
    await runtime.dispose();
    report.shutdown = {
      childCleared: runtime.child === null,
      ready: runtime.isReady(),
      durationMs: Number((performance.now() - shutdownStarted).toFixed(1))
    };
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
