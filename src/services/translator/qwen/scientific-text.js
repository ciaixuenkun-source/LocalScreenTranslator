const PROTECTED_EXPRESSIONS = Object.freeze([
  "CaSO4·2H2O",
  "mg·g−1",
  "CaCO3",
  "CaC03",
  "SiO2",
  "H2O2",
  "NH4+",
  "NH3",
  "mg/g",
  "m2/g",
  "FTIR",
  "BET",
  "XRD",
  "XPS",
  "SEM",
  "pH"
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PROTECTED_PATTERN = new RegExp(
  `${PROTECTED_EXPRESSIONS.map(escapeRegExp).join("|")}|样品[A-Za-z0-9]+`,
  "g"
);

function protectScientificText(input) {
  const values = [];
  const markers = [];
  const text = String(input || "").replace(PROTECTED_PATTERN, (value) => {
    const marker = `[[SCI_${String(values.length).padStart(3, "0")}]]`;
    values.push(value);
    markers.push(marker);
    return marker;
  });
  return { text, values, markers };
}

function restoreScientificText(input, protection) {
  let output = String(input || "");
  protection.markers.forEach((marker, index) => {
    output = output.replaceAll(marker, protection.values[index]);
  });
  return output;
}

function missingProtectedExpressions(output, protection) {
  return protection.values.filter((value) => !String(output).includes(value));
}

function partialMarkerSuffixLength(value) {
  const prefix = "[[SCI_";
  const limit = Math.min(prefix.length - 1, value.length);
  for (let length = limit; length > 0; length -= 1) {
    if (value.endsWith(prefix.slice(0, length))) return length;
  }
  return 0;
}

function createStreamingRestorer(protection) {
  const replacements = new Map(
    protection.markers.map((marker, index) => [marker, protection.values[index]])
  );
  let pending = "";

  return {
    push(delta) {
      pending += String(delta || "");
      let output = "";
      while (pending) {
        const markerStart = pending.indexOf("[[SCI_");
        if (markerStart < 0) {
          const heldLength = partialMarkerSuffixLength(pending);
          const emitLength = pending.length - heldLength;
          output += pending.slice(0, emitLength);
          pending = pending.slice(emitLength);
          break;
        }
        output += pending.slice(0, markerStart);
        pending = pending.slice(markerStart);
        const markerEnd = pending.indexOf("]]", 6);
        if (markerEnd < 0) break;
        const marker = pending.slice(0, markerEnd + 2);
        output += replacements.get(marker) || marker;
        pending = pending.slice(markerEnd + 2);
      }
      return output;
    },
    flush() {
      const output = restoreScientificText(pending, protection);
      pending = "";
      return output;
    }
  };
}

module.exports = {
  PROTECTED_EXPRESSIONS,
  createStreamingRestorer,
  missingProtectedExpressions,
  protectScientificText,
  restoreScientificText
};
