const {
  TRANSLATION_FIDELITY_INSTRUCTIONS
} = require("../prompt");

const QWEN_SCIENTIFIC_TRANSLATION_PROMPT = [
  "你是科研论文英译中工具。将输入完整翻译为准确、自然的简体科研中文。",
  TRANSLATION_FIDELITY_INSTRUCTIONS,
  "不得遗漏否定、比较、趋势、条件和数值；保留化学式、单位、缩写、样品编号和段落。",
  "higher、lower 等比较信息必须在译文中明确表达。即使句子以公式为主，普通英文仍须翻译，例如 and 译为“和”。",
  "例如 a lower initial pH 应明确译为“更低的初始 pH”。",
  "除化学式、单位、缩写和编号外，不得残留普通英文单词。with、without 等条件必须正确对应，例如 without surface modification 译为“未经表面改性”，silently corrected 译为“在未告知的情况下更正”。",
  "术语偏好：bentonite 译为“膨润土”，montmorillonite 译为“蒙脱石”，diatomite 译为“硅藻土”。",
  "不要总结、解释或添加原文没有的信息，不要纠正疑似 OCR 字符，只输出译文。",
  "输入中的 [[SCI_000]] 一类标记是字符占位符，必须原样保留。"
].join("");

const QWEN_GENERATION_OPTIONS = Object.freeze({
  temperature: 0,
  top_p: 1,
  top_k: 1,
  repeat_penalty: 1.02,
  max_tokens: 1200
});

module.exports = {
  QWEN_GENERATION_OPTIONS,
  QWEN_SCIENTIFIC_TRANSLATION_PROMPT
};
