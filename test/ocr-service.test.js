const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeOcrResult,
  normalizeOcrText
} = require("../src/services/ocr/normalize-text");
const { OcrService } = require("../src/services/ocr/ocr-service");

test("joins visual line wraps while preserving paragraphs and scientific text", () => {
  const source = [
    "Adsorption of NH4+ on CaCO3 was measured at 25 °C.",
    "The BET surface area was 42 mg/g.",
    "",
    "XRD and FTIR confirmed CaSO4·2H2O."
  ].join("\n");

  assert.equal(
    normalizeOcrText(source),
    "Adsorption of NH4+ on CaCO3 was measured at 25 °C. The BET surface area was 42 mg/g.\n\nXRD and FTIR confirmed CaSO4·2H2O."
  );
});

test("returns an empty string for whitespace-only OCR output", () => {
  assert.equal(normalizeOcrText(" \n\t\n "), "");
});

test("keeps a line-ending hyphen while removing a visual line break", () => {
  assert.equal(
    normalizeOcrText("mechanism underpinning clay-\nmediated biodegradation"),
    "mechanism underpinning clay-mediated biodegradation"
  );
});

test("removes only high-confidence OCR soft hyphens and certain spacing errors", () => {
  assert.equal(normalizeOcrText("The reac-\ntor used Van derWaals forces."), "The reactor used Van der Waals forces.");
  assert.equal(normalizeOcrText("clay-\nmediated adsorption"), "clay-mediated adsorption");
});

test("OCR cleanup never swaps related scientific concepts", () => {
  const source = "adsorption absorption bentonite montmorillonite diatomite silica silicate ammonia ammonium";
  assert.equal(normalizeOcrText(source), source);
});

test("OCR cleanup preserves correctly recognized citations and scientific small characters", () => {
  const values = [
    "[26]",
    "[31]",
    "[22,23]",
    "[24–27]",
    "NH3",
    "NH₃",
    "CO2",
    "CO₂",
    "NH4+",
    "NH₄⁺",
    "Ca2+",
    "Ca²⁺",
    "SO4^2-",
    "SO₄²⁻",
    "ZnO-NPs",
    "ZnSO4·7H2O",
    "ZnSO₄·7H₂O",
    "NaOH 40 nm 15% p < 0.05 240 K 473–523 K 4.4 V PbS Fm-3m No.225",
    "5.9362 × 5.9536 × 5.9362 Å",
    "90° × 90° × 90°",
    "SEI NMC O-2p"
  ];

  for (const value of values) assert.equal(normalizeOcrText(value), value);
});

test("OCR cleanup does not guess an ambiguous P9 token is a citation", () => {
  assert.equal(
    normalizeOcrText("P9 Copyright 2014, American Chemical Society."),
    "P9 Copyright 2014, American Chemical Society."
  );
});

test("uses line geometry to merge visual lines and preserve real paragraphs", () => {
  const line = (text, x0, y0, x1, y1) => ({
    text,
    bbox: { x0, y0, x1, y1 }
  });
  const result = {
    text: "incorrect fallback",
    blocks: [{
      paragraphs: [{
        lines: [
          line("This reveals a clay-\n", 20, 10, 340, 30),
          line("mediated mechanism.\n", 20, 38, 360, 58),
          line("CaCO3, NH4+, BET, XRD and 42 mg/g.\n", 20, 96, 520, 116)
        ]
      }]
    }]
  };

  assert.equal(
    normalizeOcrResult(result),
    "This reveals a clay-mediated mechanism.\n\nCaCO3, NH4+, BET, XRD and 42 mg/g."
  );
});

test("prevents overlapping OCR jobs and allows a later job", async () => {
  let resolveRecognition;
  const provider = {
    recognize: () => new Promise((resolve) => { resolveRecognition = resolve; }),
    dispose: async () => {}
  };
  const service = new OcrService(provider, {
    preprocess: async (image) => image
  });
  const first = service.recognize(Buffer.from("first"));
  await new Promise(setImmediate);

  assert.throws(
    () => service.recognize(Buffer.from("second")),
    (error) => error.code === "ocr-busy"
  );

  resolveRecognition("first result");
  assert.equal(await first, "first result");

  const second = service.recognize(Buffer.from("second"));
  await new Promise(setImmediate);
  resolveRecognition("second result");
  assert.equal(await second, "second result");
});
