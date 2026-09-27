# Third-Party Notices

LocalScreenTranslator 使用多个第三方开源项目、模型和数据资源。根目录中的 MIT License 仅适用于项目自身有权许可的代码与素材；第三方组件仍分别遵守其上游许可证、版权声明和使用条款。

本 GitHub 仓库不包含 Qwen GGUF 模型文件、llama.cpp runtime 或任何在线 AI 服务本身。

## Electron

- 项目：[`electron/electron`](https://github.com/electron/electron)
- 当前直接依赖版本：`33.4.11`
- 用途：Windows Electron 桌面运行框架
- License：MIT

如果以后发布包含 Electron 二进制的安装包，需要根据实际分发内容保留 Electron、Chromium 及其所含第三方组件对应的许可证文件和 notices。

## Tesseract.js

- 项目：[`naptha/tesseract.js`](https://github.com/naptha/tesseract.js)
- 当前版本：`7.0.0`
- 用途：本地 OCR
- License：Apache-2.0

## Tesseract OCR language data

- 包：`@tesseract.js-data/eng` `1.0.0`
- 包：`@tesseract.js-data/chi_sim` `1.0.0`
- 实际使用变体：`4.0.0_best_int`
- 来源：[`naptha/tessdata`](https://github.com/naptha/tessdata)
- 用途：英文和简体中文 OCR 语言数据

当前存在需要保留说明的许可证元数据差异：上述 npm 包及其 npm 发布元数据报告 License 为 MIT；实际安装的 `4.0.0_best_int` 文件与 npm `gitHead` 指向的 `naptha/tessdata` 提交 `b86746569320a6103cea84cc2b8d9ee74f0f45d3` 完全一致。该提交中的语言包生成脚本写入 MIT 元数据，但该提交本身没有仓库级 LICENSE；其后紧邻提交 `9c2fee3df42e6cdc19ebc1e4fb05a5bafa48dab0` 添加了 Apache-2.0 LICENSE。

因此，本项目同时保留 npm MIT 元数据事实和上游 Apache-2.0 许可证来源说明，不擅自宣称其中之一是唯一适用许可证。随包法律目录包含对应的上游 Apache-2.0 原文及更详细的文件哈希和提交记录。

## tr46

- 项目：[`jsdom/tr46`](https://github.com/jsdom/tr46)
- 当前传递依赖版本：`0.0.3`
- 用途：Tesseract.js 的网络依赖链所使用的 Unicode TR46 实现
- License：MIT

`tr46@0.0.3` 的 npm 元数据和版本提交 `a8009f9ce80ff5dbe71dd71e203afe4e4c878d28` 均标注 MIT，但该版本 tarball/提交未包含许可证文件。上游原作者 Sebastian Mayr 后续在提交 `3a6f29721e7063b9ffd421e461a54beae6170001` 中加入了 MIT License；随包法律目录原样保留该提交中的许可证正文。

## Sharp

- 项目：[`lovell/sharp`](https://github.com/lovell/sharp)
- 当前版本：`0.35.4`
- 用途：OCR 图像预处理
- License：Apache-2.0

如果以后随应用分发 Sharp、libvips 或相关原生组件，还需要遵守实际包含的第三方依赖许可证并附带相应声明。

## Qwen3-4B-Instruct-2507

- Base model：[`Qwen/Qwen3-4B-Instruct-2507`](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507)
- 用途：Translator 本地翻译基础模型
- License：Apache-2.0

Translator 没有训练、微调、LoRA、修改权重或重新量化该模型。本项目针对本地翻译所做的工作位于应用层，包括 prompt、科研表达保护、完整性检查、流式输出和生命周期管理。

## Unsloth GGUF

- 项目：[`unsloth/Qwen3-4B-Instruct-2507-GGUF`](https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF)
- 开发与测试使用文件：`Qwen3-4B-Instruct-2507-Q4_K_M.gguf`
- 上游页面标注 License：Apache-2.0

该 GGUF 文件不包含在本 GitHub 仓库中，由用户自行从相应来源获取，并遵守其上游许可证和使用条款。

## llama.cpp

- 项目：[`ggml-org/llama.cpp`](https://github.com/ggml-org/llama.cpp)
- 用途：通过本地 `llama-server` 运行 Qwen GGUF
- License：MIT

Translator GitHub 仓库不包含 llama.cpp 源码或二进制。如果以后随安装包分发 llama.cpp、CUDA DLL、LLVM OpenMP 或其他运行时组件，需要根据实际打包内容另外核对并附带相应许可证和 notices。

## Generated visual assets

以下核心视觉素材由项目作者使用生成式 AI 工具，根据 Translator 项目需求生成，并进行了裁切、透明背景、分层或尺寸适配等加工：

- `src/renderer/assets/translator-mascot.png`
- `src/renderer/assets/translator-jump-doll.png`
- `src/renderer/assets/translator-empty-bag.png`

以下文件由上述素材进一步生成或派生：

- `src/assets/icons/app-icon-256.png`
- `src/assets/icons/app-icon.ico`
- `src/renderer/assets/translator-bag-back.png`
- `src/renderer/assets/translator-bag-front.png`

这些视觉素材是为 Translator 项目制作的项目资产，不代表任何第三方品牌、游戏、作品或官方角色。

## Transitive dependencies

`package-lock.json` 中还包含 npm 传递依赖，它们继续遵守各自的上游许可证。本文件目前重点列出 Translator 的直接依赖、模型和主要 runtime。

未来如果发布打包后的二进制安装程序，应根据实际打包内容生成完整的第三方许可证清单，并随安装包一同提供相应许可证文本、版权声明和 notices。
