const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const assets = path.join(root, "src", "renderer", "assets");
const sourcePath = path.join(assets, "translator-empty-bag.png");
const backPath = path.join(assets, "translator-bag-back.png");
const frontPath = path.join(assets, "translator-bag-front.png");

// This curve follows the visible top edge of the front petal row. Pixels above
// it form the rear rim; every other source pixel belongs to the complete front.
const mouthCurve = [
  [0, 250],
  [80, 240],
  [150, 210],
  [240, 180],
  [315, 188],
  [390, 225],
  [455, 205],
  [540, 180],
  [590, 174],
  [650, 183],
  [730, 220],
  [790, 215],
  [870, 185],
  [940, 180],
  [1020, 200],
  [1100, 235],
  [1182, 250]
];

function boundaryAt(x) {
  for (let index = 1; index < mouthCurve.length; index += 1) {
    const [rightX, rightY] = mouthCurve[index];
    const [leftX, leftY] = mouthCurve[index - 1];
    if (x <= rightX) {
      const progress = (x - leftX) / (rightX - leftX);
      return Math.round(leftY + (rightY - leftY) * progress);
    }
  }
  return mouthCurve.at(-1)[1];
}

async function main() {
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const front = Buffer.alloc(data.length);
  const back = Buffer.alloc(data.length);

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * 4;
      const target = y < boundaryAt(x) ? back : front;
      data.copy(target, offset, offset, offset + 4);
    }
  }

  await Promise.all([
    sharp(back, { raw: info }).png().toFile(backPath),
    sharp(front, { raw: info }).png().toFile(frontPath)
  ]);

  // The two layers are disjoint, so source reconstruction must be exact.
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0) continue;
    const selected = back[offset + 3] > 0 ? back : front;
    for (let channel = 0; channel < 4; channel += 1) {
      if (selected[offset + channel] !== data[offset + channel]) {
        throw new Error(`Layer reconstruction mismatch at byte ${offset + channel}`);
      }
    }
  }

  console.log(`Generated ${path.basename(backPath)} and ${path.basename(frontPath)}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
