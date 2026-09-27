const {
  TranslatorCancelledError,
  TranslatorError
} = require("../errors");
const {
  QWEN_GENERATION_OPTIONS,
  QWEN_SCIENTIFIC_TRANSLATION_PROMPT
} = require("../qwen/prompt");
const {
  createStreamingRestorer,
  missingProtectedExpressions,
  protectScientificText,
  restoreScientificText
} = require("../qwen/scientific-text");
const {
  checkTranslationCompleteness
} = require("../qwen/completeness-check");

function normalizeSampleSpacing(text) {
  return String(text)
    .replace(/([\u3400-\u9fff])\s+(样品[A-Za-z0-9]+)/gu, "$1$2")
    .replace(/(样品[A-Za-z0-9]+)\s+([\u3400-\u9fff])/gu, "$1$2")
    .replace(/\s+([，。；：！？])/gu, "$1")
    .trim();
}

function parseSseData(block) {
  return block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();
}

async function readQwenStream(response, { signal, onChunk, protection }) {
  if (!response.body) {
    throw new TranslatorError("本地翻译没有返回有效译文", {
      code: "empty-response"
    });
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const restorer = createStreamingRestorer(protection);
  let buffer = "";
  let output = "";

  const consume = (block) => {
    const data = parseSseData(block);
    if (!data || data === "[DONE]") return;
    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
    const rawDelta = payload?.choices?.[0]?.delta?.content;
    if (!rawDelta) return;
    const delta = restorer.push(rawDelta);
    if (!delta) return;
    output += delta;
    onChunk?.(delta);
  };

  while (true) {
    if (signal?.aborted) throw new TranslatorCancelledError();
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    for (const block of blocks) consume(block);
    if (done) break;
  }
  if (buffer.trim()) consume(buffer);
  const tail = restorer.flush();
  if (tail) {
    output += tail;
    onChunk?.(tail);
  }
  return output;
}

class QwenLocalProvider {
  displayName = "免费翻译 · 本地";

  constructor(runtimeManager, { fetchImpl = fetch } = {}) {
    this.runtime = runtimeManager;
    this.fetchImpl = fetchImpl;
  }

  isConfigured() {
    return this.runtime.availability().available;
  }

  async translate({ text, signal, onChunk, onStatus }) {
    this.runtime.beginRequest();
    try {
      await this.runtime.ensureReady({ signal, onStatus });
      if (signal?.aborted) throw new TranslatorCancelledError();
      onStatus?.({ stage: "translating" });

      const protection = protectScientificText(text);
      const requestController = new AbortController();
      let timedOut = false;
      const abort = () => requestController.abort();
      signal?.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(() => {
        timedOut = true;
        requestController.abort();
      }, this.runtime.config.requestTimeoutMs);

      try {
        const response = await this.fetchImpl(`${this.runtime.baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: this.runtime.config.modelAlias,
            messages: [
              { role: "system", content: QWEN_SCIENTIFIC_TRANSLATION_PROMPT },
              { role: "user", content: protection.text }
            ],
            ...QWEN_GENERATION_OPTIONS,
            stream: Boolean(onChunk),
            stream_options: { include_usage: true },
            reasoning_effort: "none",
            chat_template_kwargs: { enable_thinking: false }
          }),
          signal: requestController.signal
        });
        if (!response.ok) {
          throw new TranslatorError("本地翻译暂时失败", {
            code: "local-request-failed"
          });
        }

        let output;
        if (onChunk) {
          output = await readQwenStream(response, {
            signal: requestController.signal,
            onChunk,
            protection
          });
        } else {
          const payload = await response.json();
          output = restoreScientificText(
            payload?.choices?.[0]?.message?.content || "",
            protection
          );
        }
        output = normalizeSampleSpacing(output);
        const missing = missingProtectedExpressions(output, protection);
        return {
          text: output,
          warnings: checkTranslationCompleteness(text, output, missing),
          provider: "qwen-local"
        };
      } catch (error) {
        if (timedOut) {
          throw new TranslatorError("本地翻译请求超时", {
            code: "request-timeout"
          });
        }
        if (signal?.aborted || error?.name === "AbortError") {
          throw new TranslatorCancelledError();
        }
        if (error instanceof TranslatorError) throw error;
        throw new TranslatorError("本地翻译暂时失败", {
          code: "local-request-failed"
        });
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
      }
    } finally {
      this.runtime.endRequest();
    }
  }
}

module.exports = { QwenLocalProvider, normalizeSampleSpacing, readQwenStream };
