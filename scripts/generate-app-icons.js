const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "src", "renderer", "assets", "translator-mascot.png");
const OUTPUT_DIRECTORY = path.join(ROOT, "src", "assets", "icons");
const PNG_PATH = path.join(OUTPUT_DIRECTORY, "app-icon-256.png");
const ICO_PATH = path.join(OUTPUT_DIRECTORY, "app-icon.ico");
const SIZES = [16, 24, 32, 48, 64, 128, 256];

async function renderPng(size) {
  let pipeline = sharp(SOURCE)
    .ensureAlpha()
    .resize({
      width: size,
      height: size,
      fit: "contain",
      kernel: sharp.kernel.lanczos3,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    });
  if (size <= 64) pipeline = pipeline.sharpen({ sigma: size <= 24 ? 0.7 : 0.5 });
  return pipeline.png({ compressionLevel: 9 }).toBuffer();
}

function createIco(images) {
  const headerSize = 6 + images.length * 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = headerSize;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map(({ data }) => data)]);
}

async function main() {
  fs.mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
  const images = [];
  for (const size of SIZES) images.push({ size, data: await renderPng(size) });
  fs.writeFileSync(PNG_PATH, images.at(-1).data);
  fs.writeFileSync(ICO_PATH, createIco(images));
  console.log(JSON.stringify({ source: SOURCE, png: PNG_PATH, ico: ICO_PATH, sizes: SIZES }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
