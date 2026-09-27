const { TranslatorService } = require("./translator-service");
const { UnconfiguredProvider } = require("./providers/unconfigured-provider");
const { TranslatorSettingsService } = require("./translator-settings-service");
const path = require("path");
const { app } = require("electron");
const { LlamaRuntimeManager } = require("./qwen/llama-runtime-manager");
const { QwenLocalProvider } = require("./providers/qwen-local-provider");

function createTranslatorRuntime() {
  const translatorService = new TranslatorService(new UnconfiguredProvider());
  const qwenRuntime = new LlamaRuntimeManager({
    logPath: path.join(app.getPath("userData"), "qwen-llama-server.log")
  });
  const qwenProvider = new QwenLocalProvider(qwenRuntime);
  const translatorSettings = new TranslatorSettingsService(translatorService, {
    freeProvider: qwenProvider
  });
  return {
    translatorService,
    translatorSettings,
    qwenRuntime,
    dispose: () => qwenRuntime.dispose()
  };
}

module.exports = { createTranslatorRuntime };
