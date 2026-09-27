const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const sharp = require("sharp");

const assets = path.join(__dirname, "..", "src", "renderer", "assets");

async function raw(name) {
  return sharp(path.join(assets, name))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

test("bag layers are complementary and reconstruct the source bag exactly", async () => {
  const [source, back, front] = await Promise.all([
    raw("translator-empty-bag.png"),
    raw("translator-bag-back.png"),
    raw("translator-bag-front.png")
  ]);

  assert.deepEqual(back.info, source.info);
  assert.deepEqual(front.info, source.info);

  for (let offset = 0; offset < source.data.length; offset += 4) {
    const sourceAlpha = source.data[offset + 3];
    const backAlpha = back.data[offset + 3];
    const frontAlpha = front.data[offset + 3];
    assert.ok(!(backAlpha > 0 && frontAlpha > 0), `overlap at pixel ${offset / 4}`);
    if (sourceAlpha === 0) continue;
    const selected = backAlpha > 0 ? back.data : front.data;
    assert.equal(selected[offset + 3], sourceAlpha);
    assert.equal(selected[offset], source.data[offset]);
    assert.equal(selected[offset + 1], source.data[offset + 1]);
    assert.equal(selected[offset + 2], source.data[offset + 2]);
  }
});
