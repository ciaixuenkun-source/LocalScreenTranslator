const assert = require("node:assert/strict");
const test = require("node:test");
const {
  PROTECTED_EXPRESSIONS,
  joinTranslatedChunks,
  protectScientificExpressions,
  restoreScientificExpressions,
  splitProtectedSegments,
  splitScientificText
} = require("../src/services/translator/bergamot/scientific-text");

test("protects and restores exact scientific expressions", () => {
  const source = `${PROTECTED_EXPRESSIONS.join(" | ")} | CaC03`;
  const { protectedText, values } = protectScientificExpressions(source);

  for (const expression of PROTECTED_EXPRESSIONS) {
    assert.equal(protectedText.includes(expression), false);
  }
  assert.equal(protectedText.includes("CaC03"), true);
  assert.equal(restoreScientificExpressions(protectedText, values), source);
});

test("splits protected expressions into exact deterministic segments", () => {
  assert.deepEqual(splitProtectedSegments("A CaCO3 and NH4+ sample."), [
    { text: "A ", protected: false },
    { text: "CaCO3", protected: true },
    { text: " and ", protected: false },
    { text: "NH4+", protected: true },
    { text: " sample.", protected: false }
  ]);
});

test("restores local URL placeholders without network access", () => {
  const { values } = protectScientificExpressions("CaCO3 and NH4+");
  assert.equal(
    restoreScientificExpressions(
      "https://sci.invalid/a 和 https://sci.invalid/b",
      values
    ),
    "CaCO3 和 NH4+"
  );
});

test("splits long scientific text without changing order or paragraphs", () => {
  const source =
    "The first sentence contains CaCO3 and adsorption data. " +
    "The second sentence contains NH4+ and a long explanation of the measured surface properties.\n\n" +
    "A separate paragraph contains BET and XRD results.";
  const chunks = splitScientificText(source, { maxChars: 85 });

  assert.ok(chunks.length >= 3);
  assert.deepEqual([...new Set(chunks.map((chunk) => chunk.paragraphIndex))], [0, 1]);
  assert.equal(chunks.map((chunk) => chunk.text).join(" ").includes("CaCO3"), true);
  assert.equal(chunks.map((chunk) => chunk.text).join(" ").includes("NH4+"), true);
  assert.equal(
    joinTranslatedChunks(chunks).includes("\n\nA separate paragraph"),
    true
  );
});
