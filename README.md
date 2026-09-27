# Translator

Translator 是一款面向 Windows 的 Electron 桌面翻译工具，主要服务于科研论文阅读、技术资料查阅和日常翻译。它将本地 OCR、本地大语言模型翻译和可选的在线 AI 精译整合到轻量的悬浮球工作流中。

Translator 不是自研大语言模型。本项目使用现有开源模型和第三方组件，并在应用层实现窗口交互、翻译流程、科研表达保护、完整性检查和本地模型生命周期管理。

## 主要功能

- **文本翻译**：默认快捷键 `Alt+1`，读取剪贴板文字并直接翻译。
- **区域翻译**：默认快捷键 `Alt+2`，框选屏幕区域后执行本地 OCR 和翻译。
- **本地 OCR**：使用 Tesseract.js 识别英文、简体中文及中英文混排内容。
- **本地 Qwen 翻译**：界面中的“免费翻译”指本机运行的 Qwen3-4B-Instruct-2507 GGUF，不是在线免费 API，也不会调用 DeepSeek。
- **AI 精译**：可选用 DeepSeek/OpenAI-compatible API，适合需要进一步复核的内容。
- **科研翻译规则**：针对论文和技术资料使用简洁的科研翻译提示词。
- **科学表达保护**：尽量保护数字、单位、化学式、科研缩写、样品编号和引用编号。
- **完整性检查**：对可能遗漏的数字、单位、化学式、否定或比较关系给出提示，不自动篡改译文。
- **桌面悬浮球**：支持拖动、左右吸边、贴边隐藏、菜单展开及动画反馈。
- **快捷键设置**：支持在设置页修改和持久化键盘快捷键。
- **单实例运行**：重复启动时不会创建第二个 Translator 实例。
- **按需加载 Qwen**：启动 Translator 时不会立即加载本地模型，首次使用本地翻译时才启动。
- **共享 llama-server**：文本翻译和区域翻译复用同一个本地服务。
- **自动释放资源**：连续 5 分钟没有本地翻译请求时关闭 llama-server；退出 Translator 时立即清理该进程。

## 使用方式

### 文本翻译

1. 在网页、PDF 阅读器或其他程序中复制文字。
2. 按下 `Alt+1`。
3. Translator 自动读取剪贴板并开始翻译。
4. 可在窗口中临时切换“免费翻译”或“AI 精译”。

### 区域翻译

1. 按下 `Alt+2`。
2. 拖动鼠标框选需要识别的区域。
3. 确认选区后，Translator 执行本地 OCR，并默认使用本地 Qwen 翻译。
4. 可以编辑 OCR 原文后重新翻译，也可以主动选择“AI 精译”复核当前内容。

以上是默认快捷键。用户修改快捷键并保存后，以本机设置为准。

## 技术组成

### Qwen 本地翻译

- Base model：[`Qwen/Qwen3-4B-Instruct-2507`](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507)
- 开发与测试所用 GGUF：[`unsloth/Qwen3-4B-Instruct-2507-GGUF`](https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF)
- 文件：`Qwen3-4B-Instruct-2507-Q4_K_M.gguf`

本项目没有训练、微调、LoRA、修改权重或重新量化该模型。对 Qwen 的改进位于应用层，包括科研翻译 prompt、确定性科学表达保护、完整性检查、流式输出和模型服务生命周期管理。

### llama.cpp

本地 Qwen 通过 [`ggml-org/llama.cpp`](https://github.com/ggml-org/llama.cpp) 的 `llama-server` 运行。

Translator 仓库不包含 llama.cpp 源码或二进制文件。程序从用户本机的外置目录启动 `llama-server`，等待服务就绪后通过本机 HTTP 接口请求翻译，并在空闲或退出时关闭进程。

### OCR

- OCR 引擎：Tesseract.js 7
- 英文数据：`@tesseract.js-data/eng`
- 简体中文数据：`@tesseract.js-data/chi_sim`
- 实际模型变体：`4.0.0_best_int`

首次需要 OCR 时，程序将 npm 包中的语言模型复制到 Translator 用户数据目录，再从该本地目录加载。正式运行不依赖 Tesseract OCR CDN。

## 安装与运行

当前版本主要在 **Windows 10** 上开发和测试，尚未声明其他操作系统支持。

### 1. 准备 Node.js 和 npm

安装可用的 Node.js/npm 环境，然后在项目目录安装依赖：

```powershell
npm install
```

也可以运行：

```powershell
npm run setup
```

当前 `npm run setup` 只会在该 PowerShell 进程中设置 Electron 下载镜像，然后执行 `npm install`。它不会下载 Qwen GGUF、不会下载或安装 llama.cpp，也不会自动配置模型和 runtime 路径。

### 2. 准备本地 Qwen 模型

自行下载以下 GGUF 文件，并保存到项目目录之外的本地模型目录：

```text
Qwen3-4B-Instruct-2507-Q4_K_M.gguf
```

模型文件不包含在本仓库中。

### 3. 准备 llama.cpp runtime

自行准备与 Windows 和本机硬件兼容的 llama.cpp runtime，确保运行目录中包含：

```text
llama-server.exe
```

llama.cpp 二进制不包含在本仓库中，也不会由 Translator 设置为开机启动服务。

### 4. 配置本地路径

启动前可通过环境变量指定外置 runtime 和模型目录：

```powershell
$env:TRANSLATOR_LLAMA_RUNTIME_DIR = "<llama.cpp runtime 目录>"
$env:TRANSLATOR_QWEN_MODEL_DIR = "<Qwen GGUF 所在目录>"
npm start
```

- `TRANSLATOR_LLAMA_RUNTIME_DIR` 指向包含 `llama-server.exe` 的目录。
- `TRANSLATOR_QWEN_MODEL_DIR` 指向包含上述 GGUF 文件的目录。

路径可以按用户自己的磁盘布局设置，不要求使用开发者电脑上的目录。环境变量需要在启动 Electron 进程前设置。

以上 `$env:` 设置仅对当前 PowerShell 会话有效。关闭该终端后需要重新设置；如需长期使用，可在 Windows 中配置持久环境变量。

### 5. 启动 Translator

```powershell
npm start
```

项目根目录的 `启动Translator.bat` 可作为依赖安装后的 Windows 备用启动入口。快捷方式和开始菜单入口可通过项目内的维护脚本创建。

### 6. 配置 AI 精译（可选）

DeepSeek/OpenAI-compatible API 仅用于用户主动选择的“AI 精译”。API Base URL、模型和 API Key 可在 Translator 设置页配置。

本地 Qwen 翻译不需要 DeepSeek API Key。API Key 使用 Electron `safeStorage` 保存在本机，不应写入源码或提交到 GitHub。

## 测试

运行正式自动测试：

```powershell
npm test
```

当前正式版本为 **66/66** 项自动测试通过。

## 已知限制

- 复杂二维表格的 OCR 阅读顺序和单元格对应关系可能不准确。
- 极小字符、上下标、引用编号和低清晰度截图可能出现 OCR 错误。
- 为避免错误修改科研内容，程序不会对可疑化学式、专业术语或 OCR 字符进行高风险猜测修正。
- Translator 面向眼前文本和屏幕区域的快速翻译，不是全文 PDF 文档解析器。
- 本地翻译质量受模型能力、截图质量和 OCR 结果影响；重要科研内容仍建议核对原文。

## 隐私说明

- Tesseract OCR 和 Qwen 本地翻译均在用户本机运行。
- 区域截图只在当前截图/OCR session 内以 Electron `nativeImage`、内存 Buffer 和 Data URL 使用。
- Translator 不会把区域截图写入磁盘翻译历史。关闭区域结果窗口、开始新的区域任务或退出 Translator 后，程序会清除相关 session 和预览数据引用，随后由 Electron/JavaScript 运行时回收内存。
- 使用“AI 精译”时，当前待翻译文本会发送到用户所配置的 DeepSeek/OpenAI-compatible 在线服务，请同时遵守对应服务的隐私政策和使用条款。
- GitHub 仓库不包含 API Key、credentials、本地 Qwen 模型、llama.cpp runtime 或用户运行配置。

## 视觉素材

以下核心视觉素材由项目作者使用生成式 AI 工具，根据 Translator 项目需求生成，并经过透明背景、裁切、分层或尺寸适配：

- `translator-mascot.png`
- `translator-jump-doll.png`
- `translator-empty-bag.png`

应用图标和袋子前后层素材由这些核心素材进一步生成。它们是 Translator 的项目视觉资产，不代表任何第三方品牌或官方角色。

## 开发说明

本项目根据作者的实际科研阅读和桌面使用需求设计，并在持续的真实材料、化学、环境及技术资料测试中逐步完善。OpenAI Codex 协助完成了代码实现、调试、重构和自动测试；功能取舍、交互目标和实际验收由项目需求与使用反馈驱动。

## 第三方组件

Translator 使用或调用以下第三方项目与资源，它们不属于本项目原创成果：

- [Electron](https://github.com/electron/electron)：Windows 桌面应用运行框架
- [Tesseract.js](https://github.com/naptha/tesseract.js)：本地 OCR 引擎
- [`@tesseract.js-data/eng`](https://www.npmjs.com/package/@tesseract.js-data/eng)：英文 OCR 语言数据
- [`@tesseract.js-data/chi_sim`](https://www.npmjs.com/package/@tesseract.js-data/chi_sim)：简体中文 OCR 语言数据
- [Sharp](https://github.com/lovell/sharp)：OCR 图像预处理
- [Qwen3-4B-Instruct-2507](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507)：本地翻译所用基础模型
- [Unsloth Qwen3 GGUF](https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF)：开发与测试所用 GGUF 发布版本
- [llama.cpp](https://github.com/ggml-org/llama.cpp)：本地 GGUF 推理服务

## 许可证

Translator 自身有权许可的代码和素材采用 [MIT License](LICENSE)。第三方组件、模型和数据仍遵循各自的上游许可证。详细信息见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 当前状态

Translator 当前已进入可日常使用阶段，重点覆盖科研论文、技术资料、网页、说明书和无法直接复制文字的 PDF。后续维护以实际使用中发现的问题为主，不承诺对复杂文档布局或所有 OCR 场景提供完全准确的解析。
