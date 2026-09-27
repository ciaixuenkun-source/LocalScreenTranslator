const { SecureCredentialStore } = require("./secure-credential-store");
const {
  DEFAULT_TRANSLATOR_CONFIG,
  TranslatorConfigStore
} = require("./translator-config-store");
const { TranslatorError } = require("./errors");
const { SCIENTIFIC_TRANSLATION_INSTRUCTIONS } = require("./prompt");
const {
  OpenAICompatibleProvider
} = require("./providers/openai-compatible-provider");
const { UnconfiguredProvider } = require("./providers/unconfigured-provider");
const {
  AI_PRECISE_MODE,
  FREE_MODE,
  TRANSLATION_MODES,
  getTranslationMode,
  preferredModeFromConfig
} = require("./translation-modes");

const API_KEY_CREDENTIAL = "openai-compatible.api-key";

function validateBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TranslatorError("API 地址无效", { code: "invalid-base-url" });
  }

  const localHttp =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new TranslatorError("API 地址必须使用 HTTPS", {
      code: "invalid-base-url"
    });
  }
  if (url.username || url.password) {
    throw new TranslatorError("API 地址中不能包含账号或密码", {
      code: "invalid-base-url"
    });
  }
  return value.trim().replace(/\/+$/, "");
}

class TranslatorSettingsService {
  constructor(
    translatorService,
    {
      configStore = new TranslatorConfigStore(),
      credentialStore = new SecureCredentialStore(),
      freeProvider
    } = {}
  ) {
    this.translatorService = translatorService;
    this.configStore = configStore;
    this.credentialStore = credentialStore;
    this.freeProvider = freeProvider;
    this.applySavedConfiguration();
  }

  normalizedConfig(input = {}) {
    const timeoutMs = Number(input.timeoutMs || DEFAULT_TRANSLATOR_CONFIG.timeoutMs);
    return {
      mode: getTranslationMode(input.mode)?.id || AI_PRECISE_MODE,
      preferFree: Boolean(input.preferFree),
      provider: "openai-compatible",
      baseUrl: validateBaseUrl(input.baseUrl || ""),
      model: String(input.model || "").trim(),
      timeoutMs: Number.isFinite(timeoutMs)
        ? Math.min(Math.max(timeoutMs, 5000), 120000)
        : DEFAULT_TRANSLATOR_CONFIG.timeoutMs
    };
  }

  buildProvider(config, apiKey) {
    return new OpenAICompatibleProvider({ ...config, apiKey });
  }

  applyProviders(config, apiKey) {
    const aiProvider = this.buildProvider(config, apiKey);
    this.translatorService.setProviders({
      [FREE_MODE]: this.freeProvider,
      [AI_PRECISE_MODE]: aiProvider.isConfigured()
        ? aiProvider
        : new UnconfiguredProvider()
    });
    this.translatorService.setDefaultMode(preferredModeFromConfig(config));
  }

  applySavedConfiguration() {
    const config = this.configStore.read();
    const apiKey = this.credentialStore.get(API_KEY_CREDENTIAL);
    this.applyProviders(config, apiKey);
  }

  getSnapshot() {
    const config = this.configStore.read();
    return {
      mode: preferredModeFromConfig(config),
      preferredMode: preferredModeFromConfig(config),
      preferFree: config.preferFree,
      modes: TRANSLATION_MODES,
      provider: config.provider,
      providerLabel: "OpenAI Compatible",
      baseUrl: config.baseUrl,
      model: config.model,
      hasApiKey: this.credentialStore.has(API_KEY_CREDENTIAL)
    };
  }

  resolveApiKey(inputKey) {
    return String(inputKey || "").trim() ||
      this.credentialStore.get(API_KEY_CREDENTIAL) || "";
  }

  async testConnection(input, { signal } = {}) {
    try {
      const config = this.normalizedConfig(input);
      if (!config.model) {
        return { ok: false, code: "model-unavailable", message: "请填写模型名称" };
      }
      const apiKey = this.resolveApiKey(input.apiKey);
      if (!apiKey) {
        return { ok: false, code: "api-key-invalid", message: "请填写 API Key" };
      }
      const provider = this.buildProvider(config, apiKey);
      await provider.testConnection({
        signal,
        instructions: SCIENTIFIC_TRANSLATION_INSTRUCTIONS
      });
      return { ok: true, message: "连接成功" };
    } catch (error) {
      return {
        ok: false,
        code: error?.code || "network-error",
        message: error?.message || "网络连接失败"
      };
    }
  }

  save(input) {
    try {
      const config = this.normalizedConfig(input);
      if (!config.model) {
        return { ok: false, message: "请填写模型名称" };
      }
      const newApiKey = String(input.apiKey || "").trim();
      const apiKey = this.resolveApiKey(newApiKey);
      if (!apiKey) return { ok: false, message: "请填写 API Key" };

      if (newApiKey) this.credentialStore.set(API_KEY_CREDENTIAL, newApiKey);
      this.configStore.write(config);
      this.applyProviders(config, apiKey);
      return { ok: true, message: "翻译服务设置已保存", snapshot: this.getSnapshot() };
    } catch (error) {
      return { ok: false, message: error?.message || "保存失败" };
    }
  }

}

module.exports = {
  API_KEY_CREDENTIAL,
  TranslatorSettingsService,
  validateBaseUrl
};
