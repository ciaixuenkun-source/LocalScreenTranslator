const { TranslatorConfigurationError } = require("../errors");

class UnconfiguredProvider {
  displayName = "未配置";

  isConfigured() {
    return false;
  }

  async translate() {
    throw new TranslatorConfigurationError();
  }
}

module.exports = { UnconfiguredProvider };
