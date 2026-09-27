const test = require("node:test");
const assert = require("node:assert/strict");
const {
  OpenAICompatibleProvider,
  chatCompletionsUrl,
  errorFromResponse
} = require("../src/services/translator/providers/openai-compatible-provider");
const {
  TranslatorCancelledError
} = require("../src/services/translator/errors");

function response(body, init = {}) {
  return new Response(body, { status: 200, ...init });
}

test("builds the standard chat completions URL", () => {
  assert.equal(
    chatCompletionsUrl("https://api.openai.com/v1/"),
    "https://api.openai.com/v1/chat/completions"
  );
  assert.equal(
    chatCompletionsUrl("https://example.test/chat/completions"),
    "https://example.test/chat/completions"
  );
});

test("streams chat completion deltas in order", async () => {
  let request;
  const provider = new OpenAICompatibleProvider({
    baseUrl: "https://example.test/v1",
    apiKey: "secret",
    model: "example-model",
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return response(
        'data: {"choices":[{"delta":{"content":"材料"}}]}\n\n' +
          'data: {"choices":[{"delta":{"content":"科学"}}]}\n\n' +
          "data: [DONE]\n\n",
        { headers: { "Content-Type": "text/event-stream" } }
      );
    }
  });
  const chunks = [];
  const result = await provider.translate({
    text: "materials science",
    instructions: "translate",
    onChunk: (chunk) => chunks.push(chunk)
  });

  assert.equal(result, "材料科学");
  assert.deepEqual(chunks, ["材料", "科学"]);
  assert.equal(request.stream, true);
  assert.equal(request.tools, undefined);
});

test("classifies authentication and model errors", () => {
  assert.equal(errorFromResponse(401, null).code, "api-key-invalid");
  assert.equal(
    errorFromResponse(400, {
      error: { code: "model_not_found", message: "missing" }
    }).code,
    "model-unavailable"
  );
});

test("aborts an in-flight provider request", async () => {
  const provider = new OpenAICompatibleProvider({
    baseUrl: "https://example.test/v1",
    apiKey: "secret",
    model: "example-model",
    fetchImpl: (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true }
        );
      })
  });
  const controller = new AbortController();
  const pending = provider.translate({
    text: "text",
    instructions: "translate",
    signal: controller.signal,
    onChunk: () => {}
  });
  controller.abort();

  await assert.rejects(pending, TranslatorCancelledError);
});
