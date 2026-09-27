function cleanLine(value) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/[ \u00a0]+/g, " ")
    .trim();
}

const SAFE_DEHYPHENATED_SUFFIX = /^(?:tor|tion|tions|ment|ments|ing|ity|ities|ive|ives|ous)\b/i;

function normalizeCertainOcrSpacing(value) {
  return String(value)
    .replace(/\bVan\s+der(?=[A-Z])/g, "Van der ");
}

function joinVisualLine(current, next) {
  if (!current) return next;
  if (!current.endsWith("-")) return `${current} ${next}`;
  const leftWord = current.match(/([A-Za-z]{3,})-$/)?.[1];
  const removeSoftHyphen = leftWord && SAFE_DEHYPHENATED_SUFFIX.test(next);
  return removeSoftHyphen
    ? `${current.slice(0, -1)}${next}`
    : `${current}${next}`;
}

function normalizeOcrText(value) {
  const text = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/[ \u00a0]+/g, " ")
    .trim();

  if (!text) return "";

  return normalizeCertainOcrSpacing(text
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph
      .split("\n")
      .map(cleanLine)
      .filter(Boolean)
      .reduce(joinVisualLine, ""))
    .filter(Boolean)
    .join("\n\n"));
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function structuredLines(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .flatMap((block) => block?.paragraphs || [])
    .flatMap((paragraph) => paragraph?.lines || [])
    .map((line) => ({ text: cleanLine(line?.text), bbox: line?.bbox }))
    .filter((line) => (
      line.text &&
      Number.isFinite(line.bbox?.x0) &&
      Number.isFinite(line.bbox?.y0) &&
      Number.isFinite(line.bbox?.x1) &&
      Number.isFinite(line.bbox?.y1)
    ))
    .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
}

function startsNewParagraph(previous, next, medianHeight) {
  const verticalGap = Math.max(0, next.bbox.y0 - previous.bbox.y1);
  const indent = next.bbox.x0 - previous.bbox.x0;
  const horizontalOverlap = Math.min(previous.bbox.x1, next.bbox.x1) -
    Math.max(previous.bbox.x0, next.bbox.x0);

  return (
    verticalGap > medianHeight * 0.9 ||
    indent > medianHeight * 1.2 ||
    horizontalOverlap <= 0
  );
}

function normalizeStructuredOcr(blocks) {
  const lines = structuredLines(blocks);
  if (!lines.length) return "";
  const medianHeight = Math.max(
    1,
    median(lines.map((line) => line.bbox.y1 - line.bbox.y0))
  );
  const paragraphs = [];
  let paragraph = "";

  lines.forEach((line, index) => {
    const previous = lines[index - 1];
    if (previous && startsNewParagraph(previous, line, medianHeight)) {
      if (paragraph) paragraphs.push(paragraph);
      paragraph = line.text;
    } else {
      paragraph = joinVisualLine(paragraph, line.text);
    }
  });
  if (paragraph) paragraphs.push(paragraph);
  return normalizeCertainOcrSpacing(paragraphs.join("\n\n"));
}

function normalizeOcrResult(result) {
  if (typeof result === "string") return normalizeOcrText(result);
  const structured = normalizeStructuredOcr(result?.blocks);
  return structured || normalizeOcrText(result?.text);
}

module.exports = {
  normalizeOcrResult,
  normalizeOcrText,
  normalizeStructuredOcr
};
