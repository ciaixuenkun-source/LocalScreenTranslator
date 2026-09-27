const PROTECTED_EXPRESSIONS = [
  "CaSO4·2H2O",
  "mg·g−1",
  "CaCO3",
  "H2O2",
  "NH4+",
  "NH3",
  "mg/g",
  "FTIR",
  "BET",
  "XRD",
  "XPS",
  "SEM",
  "pH"
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PROTECTED_PATTERN = new RegExp(
  PROTECTED_EXPRESSIONS.map(escapeRegExp).join("|"),
  "g"
);

const PROTECTED_SET = new Set(PROTECTED_EXPRESSIONS);

function protectScientificExpressions(text) {
  const values = [];
  const protectedText = text.replace(PROTECTED_PATTERN, (value) => {
    const index = values.push(value) - 1;
    const marker = String.fromCharCode(65 + index);
    return `https://sci.invalid/${marker.toLowerCase()}`;
  });
  return { protectedText, values };
}

function restoreScientificExpressions(text, values) {
  let restored = text;
  values.forEach((value, index) => {
    const marker = String.fromCharCode(65 + index);
    const token = new RegExp(`https?://sci\\.invalid/${marker}`, "gi");
    restored = restored.replace(token, value);
  });
  return restored;
}

function splitProtectedSegments(text) {
  const capturePattern = new RegExp(
    `(${PROTECTED_EXPRESSIONS.map(escapeRegExp).join("|")})`,
    "g"
  );
  return String(text || "")
    .split(capturePattern)
    .filter(Boolean)
    .map((value) => ({
      text: value,
      protected: PROTECTED_SET.has(value)
    }));
}

function splitOversizedSentence(sentence, maxChars) {
  const chunks = [];
  let remaining = sentence.trim();
  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars + 1);
    let splitAt = Math.max(window.lastIndexOf(";"), window.lastIndexOf(":"));
    if (splitAt < Math.floor(maxChars * 0.55)) splitAt = window.lastIndexOf(",");
    if (splitAt < Math.floor(maxChars * 0.55)) splitAt = window.lastIndexOf(" ");
    if (splitAt <= 0) splitAt = maxChars;
    chunks.push(remaining.slice(0, splitAt + 1).trim());
    remaining = remaining.slice(splitAt + 1).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function splitScientificText(text, { maxChars = 420 } = {}) {
  const paragraphs = String(text || "").split(/\n\s*\n/);
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  const output = [];

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const sentences = Array.from(segmenter.segment(paragraph.trim()), ({ segment }) =>
      segment.trim()
    ).filter(Boolean);
    const pieces = sentences.flatMap((sentence) =>
      sentence.length > maxChars
        ? splitOversizedSentence(sentence, maxChars)
        : [sentence]
    );

    let current = "";
    for (const piece of pieces) {
      const candidate = current ? `${current} ${piece}` : piece;
      if (current && candidate.length > maxChars) {
        output.push({ text: current, paragraphIndex });
        current = piece;
      } else {
        current = candidate;
      }
    }
    if (current) output.push({ text: current, paragraphIndex });
  });

  return output;
}

function joinTranslatedChunks(chunks) {
  let result = "";
  let previousParagraph = null;
  for (const chunk of chunks) {
    const separator =
      previousParagraph === null
        ? ""
        : chunk.paragraphIndex === previousParagraph
          ? ""
          : "\n\n";
    result += separator + chunk.text.trim();
    previousParagraph = chunk.paragraphIndex;
  }
  return result.trim();
}

module.exports = {
  PROTECTED_EXPRESSIONS,
  joinTranslatedChunks,
  protectScientificExpressions,
  restoreScientificExpressions,
  splitProtectedSegments,
  splitScientificText
};
