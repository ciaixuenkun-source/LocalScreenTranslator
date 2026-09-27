const test = require("node:test");
const assert = require("node:assert/strict");
const {
  mapCssRectToImagePixels
} = require("../src/services/region-capture/geometry");

test("maps CSS selection coordinates using the actual screenshot size", () => {
  const mapped = mapCssRectToImagePixels(
    { x: 100, y: 80, width: 640, height: 320 },
    { width: 1536, height: 864 },
    { width: 1920, height: 1080 }
  );

  assert.deepEqual(mapped, {
    x: 125,
    y: 100,
    width: 800,
    height: 400,
    scaleX: 1.25,
    scaleY: 1.25
  });
});

test("normalizes reverse dragging and clamps to the screenshot", () => {
  const mapped = mapCssRectToImagePixels(
    { x: 900, y: 700, width: -1000, height: -800 },
    { width: 1000, height: 800 },
    { width: 1500, height: 1200 }
  );

  assert.deepEqual(mapped, {
    x: 0,
    y: 0,
    width: 1350,
    height: 1050,
    scaleX: 1.5,
    scaleY: 1.5
  });
});

test("uses independent X and Y ratios when the capture size differs", () => {
  const mapped = mapCssRectToImagePixels(
    { x: 10, y: 10, width: 100, height: 100 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1088 }
  );

  assert.equal(mapped.x, 15);
  assert.equal(mapped.y, 15);
  assert.equal(mapped.width, 150);
  assert.equal(mapped.height, 151);
});
