const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const {
  normalizeLocalTextPolarity
} = require("../src/services/ocr/preprocessing/local-polarity-normalizer");

test("normalizes dark and light regions without globally inverting the image", async () => {
  const input = await sharp({
    create: {
      width: 80,
      height: 40,
      channels: 3,
      background: "#ffffff"
    }
  })
    .composite([{
      input: Buffer.from('<svg width="40" height="40"><rect width="40" height="40" fill="#3367d1"/><rect x="18" width="4" height="40" fill="white"/></svg>'),
      left: 0,
      top: 0
    }, {
      input: Buffer.from('<svg width="40" height="40"><rect x="18" width="4" height="40" fill="black"/></svg>'),
      left: 40,
      top: 0
    }])
    .png()
    .toBuffer();

  const { data, info } = await sharp(await normalizeLocalTextPolarity(input))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => data[(y * info.width + x) * info.channels];

  assert.ok(pixel(20, 20) < 40, "white-on-dark glyph becomes dark");
  assert.ok(pixel(5, 20) > 200, "dark background becomes light");
  assert.ok(pixel(60, 20) < 40, "black-on-light glyph remains dark");
  assert.ok(pixel(75, 20) > 240, "light background remains light");
});
