const test = require("node:test");
const assert = require("node:assert/strict");
const { TranslatorService } = require("../src/services/translator/translator-service");
const {
  TranslatorError,
  TranslatorCancelledError
} = require("../src/services/translator/errors");
const {
  UnconfiguredProvider
} = require("../src/services/translator/providers/unconfigured-provider");
const {
  AI_PRECISE_MODE,
  FREE_MODE
} = require("../src/services/translator/translation-modes");

test("retries one transient provider failure", async () => {
  let calls = 0;
  const provider = {
    displayName: "Test",
    isConfigured: () => true,
    translate: async () => {
      calls += 1;
      if (calls === 1) {
        throw new TranslatorError("temporary", { retryable: true });
      }
      return "测试译文";
    }
  };
  const service = new TranslatorService(provider, { retryDelayMs: 1 });

  assert.equal(await service.translate("Test text"), "测试译文");
  assert.equal(calls, 2);
});

test("does not retry a permanent provider failure", async () => {
  let calls = 0;
  const provider = {
    displayName: "Test",
    isConfigured: () => true,
    translate: async () => {
      calls += 1;
      throw new TranslatorError("permanent");
    }
  };
  const service = new TranslatorService(provider, { retryDelayMs: 1 });

  await assert.rejects(service.translate("Test text"), /permanent/);
  assert.equal(calls, 1);
});

test("honors cancellation before calling the provider", async () => {
  const provider = {
    displayName: "Test",
    isConfigured: () => true,
    translate: async () => "unused"
  };
  const service = new TranslatorService(provider);
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    service.translate("Test text", { signal: controller.signal }),
    TranslatorCancelledError
  );
});

test("default placeholder provider never performs a network translation", async () => {
  const service = new TranslatorService(new UnconfiguredProvider());

  await assert.rejects(service.translate("Test text"), (error) => {
    assert.equal(error.code, "provider-not-configured");
    return true;
  });
});

test("resets streamed output before retrying a transient failure", async () => {
  let calls = 0;
  const events = [];
  const provider = {
    displayName: "Test",
    isConfigured: () => true,
    translate: async ({ onChunk }) => {
      calls += 1;
      if (calls === 1) {
        onChunk("旧片段");
        throw new TranslatorError("temporary", { retryable: true });
      }
      onChunk("新译文");
      return "新译文";
    }
  };
  const service = new TranslatorService(provider, { retryDelayMs: 1 });

  const result = await service.translate("text", {
    onChunk: (chunk) => events.push(chunk),
    onStreamReset: () => events.push("reset")
  });

  assert.equal(result, "新译文");
  assert.deepEqual(events, ["旧片段", "reset", "新译文"]);
});

test("an explicit free request never falls back to the configured AI provider", async () => {
  let aiCalls = 0;
  const aiProvider = {
    displayName: "AI",
    isConfigured: () => true,
    translate: async () => {
      aiCalls += 1;
      return "不应调用";
    }
  };
  const freeProvider = {
    displayName: "免费翻译",
    isConfigured: () => false,
    translate: async () => {
      throw new TranslatorError("免费翻译暂未开发", {
        code: "provider-not-configured"
      });
    }
  };
  const service = new TranslatorService(aiProvider);
  service.setProviders({
    [AI_PRECISE_MODE]: aiProvider,
    [FREE_MODE]: freeProvider
  });

  await assert.rejects(
    service.translate("Test text", { mode: FREE_MODE }),
    /免费翻译暂未开发/
  );
  assert.equal(aiCalls, 0);
});

test("preserves provider warnings only when detailed results are requested", async () => {
  const provider = {
    displayName: "Local",
    isConfigured: () => true,
    translate: async () => ({
      text: "本地译文",
      warnings: ["可能遗漏比较关系"],
      provider: "qwen-local"
    })
  };
  const service = new TranslatorService(provider);
  assert.equal(await service.translate("source"), "本地译文");
  assert.deepEqual(
    await service.translate("source", { includeDetails: true }),
    {
      text: "本地译文",
      warnings: ["可能遗漏比较关系"],
      provider: "qwen-local"
    }
  );
});
