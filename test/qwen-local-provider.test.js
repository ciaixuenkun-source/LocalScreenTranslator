const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createStreamingRestorer,
  missingProtectedExpressions,
  protectScientificText,
  restoreScientificText
} = require("../src/services/translator/qwen/scientific-text");
const {
  checkTranslationCompleteness
} = require("../src/services/translator/qwen/completeness-check");
const {
  LlamaRuntimeManager
} = require("../src/services/translator/qwen/llama-runtime-manager");
const {
  createLocalQwenConfig
} = require("../src/services/translator/qwen/local-qwen-config");
const {
  QwenLocalProvider
} = require("../src/services/translator/providers/qwen-local-provider");

function sseResponse(parts) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    }
  }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

test("protects scientific text and restores markers split across stream chunks", () => {
  const protection = protectScientificText("样品A contains CaCO3 at pH 7.");
  assert.equal(protection.values.join("|"), "样品A|CaCO3|pH");
  const restorer = createStreamingRestorer(protection);
  const output = [
    restorer.push("样品为 [[SC"),
    restorer.push("I_000]]，含 [[SCI_001]]，"),
    restorer.push("[[SCI_002]] 为 7。"),
    restorer.flush()
  ].join("");
  assert.equal(output, "样品为 样品A，含 CaCO3，pH 为 7。");
  assert.deepEqual(missingProtectedExpressions(output, protection), []);
  assert.equal(restoreScientificText(protection.text, protection), "样品A contains CaCO3 at pH 7.");
});

test("completeness checker warns without changing the translation", () => {
  const output = "第二个实验采用相同温度和初始 pH。";
  const warnings = checkTranslationCompleteness(
    "The second experiment used the same temperature but a lower initial pH.",
    output
  );
  assert.equal(output, "第二个实验采用相同温度和初始 pH。");
  assert.ok(warnings.some((warning) => warning.includes("lower")));
});

test("completeness checker keeps strong omissions while tolerating normal Chinese phrasing", () => {
  assert.ok(checkTranslationCompleteness("The value was 42 mg/g.", "该值为 mg/g。")
    .some((warning) => warning.includes("数字：42")));
  assert.ok(checkTranslationCompleteness("CaCO3 remained stable.", "体系保持稳定。", ["CaCO3"])
    .some((warning) => warning.includes("受保护表达：CaCO3")));
  assert.ok(checkTranslationCompleteness("No increase was observed without treatment.", "处理后观察到增加。")
    .some((warning) => warning.includes("否定信息")));

  assert.deepEqual(
    checkTranslationCompleteness(
      "The higher dosage significantly increased removal, while the lower value slightly decreased.",
      "较大投加量使去除量大幅提升，而较小值则小幅下滑。"
    ),
    []
  );
});

test("completeness checker ignores formatting, duplicate counts, and numbered No. labels", () => {
  assert.deepEqual(
    checkTranslationCompleteness(
      "Sample No. 3 was tested twice at 6.0 and 6.0 mg/g.",
      "对3号样品进行了两次测试，测试值为6 mg/g。"
    ),
    []
  );
});

test("completeness checker treats equivalent chemical formula notation as the same expression", () => {
  const equivalentFormulas = [
    ["NH(4)(+)", "NH4+"],
    ["NH(4)(+)", "NH₄⁺"],
    ["CO(2)", "CO2"],
    ["CO(2)", "CO₂"],
    ["Ca(2+)", "Ca2+"],
    ["Ca(2+)", "Ca²⁺"],
    ["Ca²⁺", "Ca2+"],
    ["Fe(3+)", "Fe3+"],
    ["Fe(3+)", "Fe³⁺"],
    ["Al(3+)", "Al3+"],
    ["Al(3+)", "Al³⁺"],
    ["SO4(2-)", "SO4^2-"],
    ["SO4(2-)", "SO₄²⁻"]
  ];

  for (const [source, output] of equivalentFormulas) {
    const warnings = checkTranslationCompleteness(source, output);
    assert.ok(
      !warnings.some((warning) => warning.includes("数字")),
      `${source} -> ${output}: ${warnings.join("; ")}`
    );
  }

  const sentenceWarnings = checkTranslationCompleteness(
    "high concentrations of NH(4)(+) which can generate NH4+-exchanged clays",
    "高浓度的NH₄⁺，可生成NH4+-交换黏土"
  );
  assert.ok(!sentenceWarnings.some((warning) => warning.includes("数字")));
});

test("completeness checker still reports missing experimental numbers", () => {
  const cases = [
    ["The sample was cooled to 240 K.", "样品经过冷却。"],
    ["The range was 473–523 K.", "记录了温度范围。"],
    ["The sample was held at 25 °C.", "样品在规定温度下保持。"],
    ["The adsorption capacity was 5.6 mg/g.", "记录了吸附容量。"],
    ["Removal reached 90%.", "达到了预期去除率。"],
    ["The solution was adjusted to pH 7.0.", "调节了溶液的pH。"],
    ["The reaction continued for 20 min.", "反应继续进行。"]
  ];

  for (const [source, output] of cases) {
    const warnings = checkTranslationCompleteness(source, output);
    assert.ok(
      warnings.some((warning) => warning.includes("数字")),
      `${source} should report a missing number`
    );
  }
});

test("completeness checker tolerates citation formatting but keeps locator numbers strict", () => {
  const citationPairs = [
    ["The result was reported previously [22].", "该结果此前已有报道22)。"],
    ["The mechanism was reported previously [22,23].", "该机制此前已有报道22,23)。"],
    ["Several studies support this conclusion [24–27].", "多项研究支持该结论24-27)。"],
    ["The result was reported previously 20).", "该结果此前已有报道[20]。"],
    ["The mechanism was reported previously 22,23).", "该机制此前已有报道[22，23]。"],
    ["Several studies support this conclusion 24–27).", "多项研究支持该结论[24-27]。"],
    ["This behavior was reported previously²².", "该行为此前已有报道[22]。"]
  ];
  for (const [source, output] of citationPairs) {
    assert.ok(!checkTranslationCompleteness(source, output)
      .some((warning) => warning.includes("数字")));
  }

  const locatorCases = [
    ["See Fig. 3.", "参见该图。"],
    ["See Table 2.", "参见该表。"],
    ["Use Eq. (5).", "使用该方程。"],
    ["Read Section 4.2.", "阅读本节。"],
    ["Follow Step 3.", "按照该步骤操作。"]
  ];
  for (const [source, output] of locatorCases) {
    assert.ok(checkTranslationCompleteness(source, output)
      .some((warning) => warning.includes("数字")));
  }

  assert.ok(checkTranslationCompleteness(
    "This behavior was reported previously²².",
    "该行为此前已有报道。"
  ).some((warning) => warning.includes("引用编号：22")));
});

test("runtime manager is lazy and shuts down only after idle timeout", async () => {
  const manager = new LlamaRuntimeManager({
    config: {
      runtimeDirectory: "C:\\unused",
      serverExecutable: "C:\\unused\\llama-server.exe",
      modelPath: "C:\\unused\\model.gguf",
      host: "127.0.0.1",
      port: 18473,
      idleTimeoutMs: 20,
      startupTimeoutMs: 100,
      requestTimeoutMs: 100
    }
  });
  assert.equal(manager.child, null);
  let stops = 0;
  manager.child = { exitCode: null };
  manager.ready = true;
  manager.stop = async () => {
    stops += 1;
    manager.child = null;
    manager.ready = false;
  };
  manager.beginRequest();
  manager.endRequest();
  await new Promise((resolve) => setTimeout(resolve, 45));
  assert.equal(stops, 1);
});

test("concurrent users share one llama-server startup", async () => {
  const manager = new LlamaRuntimeManager({
    config: {
      runtimeDirectory: "C:\\shared-runtime",
      serverExecutable: "C:\\shared-runtime\\llama-server.exe",
      modelPath: "C:\\shared-model\\model.gguf",
      host: "127.0.0.1",
      port: 18473,
      idleTimeoutMs: 50,
      startupTimeoutMs: 100,
      requestTimeoutMs: 100
    }
  });
  manager.availability = () => ({ available: true, missing: [] });
  let starts = 0;
  manager.startServer = async () => {
    starts += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    manager.child = { exitCode: null };
    manager.ready = true;
  };
  await Promise.all([manager.ensureReady(), manager.ensureReady()]);
  assert.equal(starts, 1);
  manager.child = null;
  manager.ready = false;
});

test("empty local paths do not fall back to developer directories", () => {
  const config = createLocalQwenConfig({
    runtimeDirectory: "",
    modelDirectory: ""
  });
  assert.equal(config.runtimeDirectory, "");
  assert.equal(config.serverExecutable, "");
  assert.equal(config.modelDirectory, "");
  assert.equal(config.modelPath, "");
});

test("unconfigured local translation reports the required environment variables", async () => {
  const manager = new LlamaRuntimeManager({
    config: createLocalQwenConfig({
      runtimeDirectory: "",
      modelDirectory: ""
    })
  });
  await assert.rejects(manager.ensureReady(), (error) => {
    assert.equal(error.code, "local-model-not-configured");
    assert.match(error.message, /TRANSLATOR_LLAMA_RUNTIME_DIR/);
    assert.match(error.message, /TRANSLATOR_QWEN_MODEL_DIR/);
    return true;
  });
});

test("missing llama runtime and model files report distinct errors", async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "translator-qwen-config-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runtimeDirectory = path.join(root, "runtime");
  const modelDirectory = path.join(root, "model");
  fs.mkdirSync(runtimeDirectory);
  fs.mkdirSync(modelDirectory);

  const runtimeMissing = new LlamaRuntimeManager({
    config: createLocalQwenConfig({ runtimeDirectory, modelDirectory })
  });
  await assert.rejects(runtimeMissing.ensureReady(), (error) => {
    assert.equal(error.code, "local-runtime-unavailable");
    assert.match(error.message, /llama-server\.exe/);
    return true;
  });

  fs.writeFileSync(path.join(runtimeDirectory, "llama-server.exe"), "test");
  const modelMissing = new LlamaRuntimeManager({
    config: createLocalQwenConfig({ runtimeDirectory, modelDirectory })
  });
  await assert.rejects(modelMissing.ensureReady(), (error) => {
    assert.equal(error.code, "local-model-unavailable");
    assert.match(error.message, /TRANSLATOR_QWEN_MODEL_DIR/);
    return true;
  });
});

test("missing local files fail without starting a process", async () => {
  let spawnCalls = 0;
  const manager = new LlamaRuntimeManager({
    config: {
      runtimeDirectory: "C:\\definitely-missing-translator-runtime",
      serverExecutable: "C:\\definitely-missing-translator-runtime\\llama-server.exe",
      modelDirectory: "C:\\definitely-missing-translator-model",
      modelPath: "C:\\definitely-missing-translator-model\\model.gguf",
      host: "127.0.0.1",
      port: 18473,
      idleTimeoutMs: 20,
      startupTimeoutMs: 100,
      requestTimeoutMs: 100
    },
    spawnImpl: () => {
      spawnCalls += 1;
    }
  });
  await assert.rejects(manager.ensureReady(), (error) => {
    assert.equal(error.code, "local-runtime-unavailable");
    return true;
  });
  assert.equal(spawnCalls, 0);
  assert.equal(manager.child, null);
});

test("Qwen provider reports startup, streams restored text, and returns warnings", async () => {
  const statuses = [];
  const chunks = [];
  const runtime = {
    config: { modelAlias: "qwen", requestTimeoutMs: 1000 },
    baseUrl: "http://127.0.0.1:18473",
    beginRequest() {},
    endRequest() {},
    availability: () => ({ available: true, missing: [] }),
    ensureReady: async ({ onStatus }) => onStatus({ stage: "starting" })
  };
  const provider = new QwenLocalProvider(runtime, {
    fetchImpl: async () => sseResponse([
      'data: {"choices":[{"delta":{"content":"膨润土中的 [[SCI_"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"000]] 保持不变。"}}]}\n\n',
      "data: [DONE]\n\n"
    ])
  });
  const result = await provider.translate({
    text: "CaCO3 in bentonite remains unchanged.",
    onStatus: (status) => statuses.push(status.stage),
    onChunk: (chunk) => chunks.push(chunk)
  });
  assert.deepEqual(statuses, ["starting", "translating"]);
  assert.equal(result.text, "膨润土中的 CaCO3 保持不变。");
  assert.equal(chunks.join(""), result.text);
  assert.deepEqual(result.warnings, []);
});
