const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SCIENTIFIC_TRANSLATION_INSTRUCTIONS,
  TRANSLATION_FIDELITY_INSTRUCTIONS
} = require("../src/services/translator/prompt");
const {
  QWEN_SCIENTIFIC_TRANSLATION_PROMPT
} = require("../src/services/translator/qwen/prompt");

test("formal prompts share concise fidelity and concept-preservation rules", () => {
  for (const prompt of [SCIENTIFIC_TRANSLATION_INSTRUCTIONS, QWEN_SCIENTIFIC_TRANSLATION_PROMPT]) {
    assert.match(prompt, /不得补充、推断、总结或删减信息/);
    assert.match(prompt, /相关但不同的专业概念互换/);
    assert.match(prompt, /数字、单位、化学式、型号、缩写、编号和引用关系/);
    assert.ok(prompt.includes(TRANSLATION_FIDELITY_INSTRUCTIONS));
  }
});

test("formal prompts forbid adding groundwater meaning and confusing key concept pairs", () => {
  for (const prompt of [SCIENTIFIC_TRANSLATION_INSTRUCTIONS, QWEN_SCIENTIFIC_TRANSLATION_PROMPT]) {
    assert.match(prompt, /water.+groundwater/);
    assert.match(prompt, /bentonite、montmorillonite、diatomite/);
    assert.match(prompt, /adsorption、absorption/);
    assert.match(prompt, /ammonia、ammonium/);
  }
});
