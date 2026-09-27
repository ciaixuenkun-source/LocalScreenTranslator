# Translator

这是一个面向科研阅读的 Windows 桌面翻译工具。

## 当前功能

- 文本翻译：本地 Qwen 免费翻译和可选 DeepSeek AI 精译
- 区域翻译：框选截图、本地 OCR、本地免费翻译和可选 AI 精译
- 可拖动悬浮球，靠近左右边缘时自动吸附
- 自定义全局键盘快捷键
- 单实例运行和正式退出

## 运行

第一次准备依赖：

```powershell
npm run setup
```

启动程序：

```powershell
npm start
```

也可以使用项目根目录的 `Translator.lnk`，或在 Windows 开始菜单中搜索
`Translator`。`启动Translator.bat` 仅作为备用启动方式。

## 测试

```powershell
npm test
```
