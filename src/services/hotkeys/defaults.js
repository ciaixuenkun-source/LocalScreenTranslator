const ACTIONS = {
  areaTranslation: "区域翻译",
  textTranslation: "文本翻译"
};

const DEFAULT_BINDINGS = {
  areaTranslation: [
    {
      id: "default-area-alt-1",
      type: "keyboard",
      accelerator: "Alt+1"
    }
  ],
  textTranslation: [
    {
      id: "default-text-alt-2",
      type: "keyboard",
      accelerator: "Alt+2"
    }
  ]
};

module.exports = { ACTIONS, DEFAULT_BINDINGS };
