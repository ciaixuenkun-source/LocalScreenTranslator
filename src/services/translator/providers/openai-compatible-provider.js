const {
  TranslatorError,
  TranslatorConfigurationError,
  TranslatorCancelledError
} = require("../errors");

function chatCompletionsUrl(baseUrl) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/chat/completions")
    ? normalized
    : `${normalized}/chat/completions`;
}

function lowReasoningEffort(model) {
  if (/^gpt-5\.(?:[1-9]\d*)/i.test(model)) return "none";
  if (/^(?:gpt-5|o[134])(?:-|$)/i.test(model)) return "low";
  return null;
}

function errorFromResponse(status, payload) {
  const apiCode = payload?.error?.code;
  const apiMessage = payload?.error?.message || "";

  if (status === 401 || status === 403) {
    return new TranslatorError("API Key 无效", { code: "api-key-invalid" });
  }
  if (
    status === 404 ||
    apiCode === "model_not_found" ||
    /model.+(?:not found|does not exist|unavailable)/i.test(apiMessage)
  ) {
    return new TranslatorError("模型不可用", { code: "model-unavailable" });
  }
  if (status === 408 || status === 504) {
    return new TranslatorError("请求超时", {
      code: "request-timeout",
      retryable: true
    });
  }
  if (status === 429) {
    return new TranslatorError("请求过于频繁，请稍后重试", {
      code: "rate-limited",
      retryable: true
    });
  }
  if (status >= 500) {
    return new TranslatorError("网络连接失败", {
      code: "network-error",
      retryable: true
    });
  }
  return new TranslatorError("翻译服务拒绝了请求", {
    code: "provider-request-failed"
  });
}

async function readErrorPayload(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function readSseStream(response, { signal, onChunk }) {
  if (!response.body) {
    throw new TranslatorError("翻译服务没有返回有效译文", {
      code: "empty-response",
      retryable: true
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let translatedText = "";

  const consumeEvent = (eventBlock) => {
    const data = eventBlock
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!data || data === "[DONE]") return;

    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
    const content = payload?.choices?.[0]?.delta?.content;
    if (typeof content !== "string" || !content) return;
    translatedText += content;
    onChunk?.(content);
  };

  while (true) {
    if (signal?.aborted) throw new TranslatorCancelledError();
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";
    for (const eventBlock of events) consumeEvent(eventBlock);
    if (done) break;
  }
  if (buffer.trim()) consumeEvent(buffer);
  return translatedText;
}

class OpenAICompatibleProvider {
  displayName = "OpenAI Compatible";

  constructor({ baseUrl, apiKey, model, timeoutMs = 30000, fetchImpl = fetch }) {
    this.baseUrl = baseUrl?.trim() || "";
    this.apiKey = apiKey?.trim() || "";
    this.model = model?.trim() || "";
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.apiKey && this.model);
  }

  buildRequestBody({ text, instructions, stream }) {
    const body = {
      model: this.model,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: text }
      ],
      stream
    };
    let isOfficialOpenAI = false;
    try {
      isOfficialOpenAI = new URL(this.baseUrl).hostname === "api.openai.com";
    } catch {}
    const reasoningEffort = isOfficialOpenAI
      ? lowReasoningEffort(this.model)
      : null;
    if (reasoningEffort) body.reasoning_effort = reasoningEffort;
    return body;
  }

  async request({ text, instructions, signal, onChunk, stream }) {
    if (!this.isConfigured()) throw new TranslatorConfigurationError();

    const requestController = new AbortController();
    let timedOut = false;
    const abortRequest = () => requestController.abort();
    signal?.addEventListener("abort", abortRequest, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      requestController.abort();
    }, this.timeoutMs);

    try {
      const response = await this.fetchImpl(chatCompletionsUrl(this.baseUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(
          this.buildRequestBody({ text, instructions, stream })
        ),
        signal: requestController.signal
      });

      if (!response.ok) {
        throw errorFromResponse(response.status, await readErrorPayload(response));
      }
      if (stream) {
        return await readSseStream(response, { signal, onChunk });
      }

      const payload = await response.json();
      return payload?.choices?.[0]?.message?.content || "";
    } catch (error) {
      if (timedOut) {
        throw new TranslatorError("请求超时", {
          code: "request-timeout",
          retryable: true
        });
      }
      if (signal?.aborted || error?.name === "AbortError") {
        throw new TranslatorCancelledError();
      }
      if (error instanceof TranslatorError) throw error;
      throw new TranslatorError("网络连接失败", {
        code: "network-error",
        retryable: true
      });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortRequest);
    }
  }

  translate({ text, instructions, signal, onChunk }) {
    return this.request({
      text,
      instructions,
      signal,
      onChunk,
      stream: Boolean(onChunk)
    });
  }

  testConnection({ signal, instructions }) {
    return this.request({
      text: "Translate this word into Simplified Chinese: material",
      instructions,
      signal,
      stream: false
    });
  }
}

module.exports = {
  OpenAICompatibleProvider,
  chatCompletionsUrl,
  errorFromResponse,
  readSseStream
};
