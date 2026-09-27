const COMPLETENESS_RULES = [
  {
    source: (text) => /\b(?:not|without)\b/i.test(text) || /\bno\b(?!\s*[.:：]?\s*\d)/i.test(text),
    target: /不|无|未|没有|并非|非|不含|未见|缺少|缺乏|不存在|无法|免于/,
    label: "否定信息"
  },
  { source: /\bhigher\b/i, target: /更高|较高|偏高|高于|升高|提高|增加|增大|上升|更大|较大/, label: "higher 比较关系" },
  { source: /\blower\b/i, target: /更低|较低|偏低|略低|稍低|低于|降低|下降|减少|减小|更小|较小/, label: "lower 比较关系" },
  { source: /\b(?:increase|increased|increases|increasing)\b/i, target: /增加|提高|升高|增强|上升|增大|提升|增长|增多|改善/, label: "增加趋势" },
  { source: /\b(?:decrease|decreased|decreases|decreasing)\b/i, target: /降低|减少|下降|减小|减弱|递减|衰减|下滑/, label: "降低趋势" },
  { source: /\babove\b/i, target: /高于|超过|以上|之上|大于/, label: "above 方向" },
  { source: /\bbelow\b/i, target: /低于|以下|之下|小于/, label: "below 方向" },
  { source: /\bbefore\b/i, target: /之前|以前|此前|前/, label: "before 条件" },
  { source: /\bafter\b/i, target: /之后|以后|随后|此后|后|经/, label: "after 条件" },
  { source: /\bsignificantly\b/i, target: /显著|明显|大幅|大大/, label: "显著程度" },
  { source: /\bslightly\b/i, target: /略|轻微|稍|小幅|少量/, label: "轻微程度" }
];

function normalizeNumber(value) {
  const normalized = String(value).replace(/[，,](?=\d{3}(?:\D|$))/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? String(number) : normalized;
}

const ELEMENT_SYMBOLS = new Set(
  "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og".split(" ")
);

function normalizeChemicalNotation(value) {
  return String(value)
    .normalize("NFKC")
    .replace(/[−–—]/g, "-")
    .replace(/\((\d*[+-])\)/g, "$1")
    .replace(/\((\d+)\)/g, "$1")
    .replace(/\^(?=\d*[+-])/g, "");
}

function extractChemicalFormulas(value) {
  const text = normalizeChemicalNotation(value);
  const formulas = [];
  const pattern = /(?<![A-Za-z])(?:[A-Z][a-z]?\d*)+(?:\d*[+-])?(?![A-Za-z])/g;
  let match;
  while ((match = pattern.exec(text))) {
    const formula = match[0];
    if (!/\d/.test(formula)) continue;
    const letters = formula.replace(/[\d+-]/g, "");
    const symbols = letters.match(/[A-Z][a-z]?/g) || [];
    if (symbols.join("") !== letters || !symbols.every((symbol) => ELEMENT_SYMBOLS.has(symbol))) {
      continue;
    }
    formulas.push({
      canonical: formula,
      start: match.index,
      end: match.index + formula.length
    });
  }
  return { text, formulas };
}

function maskEquivalentChemicalFormulas(source, output) {
  const sourceResult = extractChemicalFormulas(source);
  const outputResult = extractChemicalFormulas(output);
  const sourceFormulas = new Set(sourceResult.formulas.map(({ canonical }) => canonical));
  const outputFormulas = new Set(outputResult.formulas.map(({ canonical }) => canonical));
  const equivalent = new Set(
    [...sourceFormulas].filter((formula) => outputFormulas.has(formula))
  );

  function mask(result) {
    const characters = result.text.split("");
    for (const formula of result.formulas) {
      if (!equivalent.has(formula.canonical)) continue;
      characters.fill(" ", formula.start, formula.end);
    }
    return characters.join("");
  }

  return [mask(sourceResult), mask(outputResult)];
}

function normalizeCitation(value) {
  return String(value)
    .normalize("NFKC")
    .replace(/[，、；;]/g, ",")
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, "");
}

function extractCitationGroups(value) {
  const text = String(value);
  const citations = [];
  const patterns = [
    /[\[【]\s*(\d+(?:\s*(?:[,，、;；]|[-−–—])\s*\d+)*)\s*[\]】]/g,
    /(?<![\d.(（])(\d+(?:\s*(?:[,，、;；]|[-−–—])\s*\d+)*)\s*[)）]/g
  ];

  const superscriptPattern = /[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g;
  let superscriptMatch;
  while ((superscriptMatch = superscriptPattern.exec(text))) {
    const precedingToken = text.slice(0, superscriptMatch.index).match(/[A-Za-z0-9]+$/)?.[0] || "";
    const precedingSymbols = precedingToken.match(/[A-Z][a-z]?/g) || [];
    const followsChemicalFormula = precedingToken &&
      precedingSymbols.join("") === precedingToken &&
      precedingSymbols.every((symbol) => ELEMENT_SYMBOLS.has(symbol));
    if (followsChemicalFormula) continue;
    citations.push({
      canonical: normalizeCitation(superscriptMatch[0]),
      start: superscriptMatch.index,
      end: superscriptMatch.index + superscriptMatch[0].length
    });
  }

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) {
      const start = match.index;
      const end = start + match[0].length;
      if (citations.some((citation) => start < citation.end && end > citation.start)) continue;
      citations.push({
        canonical: normalizeCitation(match[1]),
        start,
        end
      });
    }
  }
  return { text, citations };
}

function analyzeCitations(source, output) {
  const sourceResult = extractCitationGroups(source);
  const outputResult = extractCitationGroups(output);
  const outputCitations = new Set(
    outputResult.citations.map(({ canonical }) => canonical)
  );
  const sourceCitations = new Set(
    sourceResult.citations.map(({ canonical }) => canonical)
  );

  function mask(result) {
    const characters = result.text.split("");
    for (const citation of result.citations) {
      characters.fill(" ", citation.start, citation.end);
    }
    return characters.join("");
  }

  return {
    source: mask(sourceResult),
    output: mask(outputResult),
    missing: [...sourceCitations].filter((citation) => !outputCitations.has(citation))
  };
}

function findMissingValues(sourceValues, outputValues, label) {
  const sourceSet = new Set(sourceValues);
  const outputSet = new Set(outputValues);
  const warnings = [];
  for (const value of sourceSet) {
    if (!outputSet.has(value)) warnings.push(`可能遗漏${label}：${value}`);
  }
  return warnings;
}

function extractNumbers(value) {
  const matches = String(value).normalize("NFKC")
    .match(/(?<![A-Za-z0-9])[-+]?\d+(?:[.,]\d+)?(?:e[-+]?\d+)?(?![A-Za-z0-9])/gi) || [];
  return matches.map(normalizeNumber);
}

function checkTranslationCompleteness(source, output, missingProtected = []) {
  const citationAnalysis = analyzeCitations(source, output);
  const [sourceForNumbers, outputForNumbers] = maskEquivalentChemicalFormulas(
    citationAnalysis.source,
    citationAnalysis.output
  );
  const warnings = [
    ...findMissingValues(
      extractNumbers(sourceForNumbers),
      extractNumbers(outputForNumbers),
      "数字"
    ),
    ...citationAnalysis.missing.map((value) => `可能遗漏引用编号：${value}`),
    ...findMissingValues(
      String(source).match(/样品[A-Za-z0-9]+/gu) || [],
      String(output).match(/样品[A-Za-z0-9]+/gu) || [],
      "样品编号"
    ),
    ...missingProtected.map((value) => `可能遗漏受保护表达：${value}`)
  ];

  for (const rule of COMPLETENESS_RULES) {
    const sourceMatched = typeof rule.source === "function"
      ? rule.source(String(source))
      : rule.source.test(source);
    if (sourceMatched && !rule.target.test(output)) warnings.push(`可能遗漏${rule.label}`);
  }
  return [...new Set(warnings)];
}

module.exports = { checkTranslationCompleteness, extractNumbers };
