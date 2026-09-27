const sharp = require("sharp");

function buildIntegralImage(pixels, width, height) {
  const stride = width + 1;
  const integral = new Float64Array(stride * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= width; x += 1) {
      rowSum += pixels[(y - 1) * width + x - 1];
      integral[y * stride + x] = integral[(y - 1) * stride + x] + rowSum;
    }
  }
  return integral;
}

function localMean(integral, width, height, x, y, radius) {
  const stride = width + 1;
  const x0 = Math.max(0, x - radius);
  const y0 = Math.max(0, y - radius);
  const x1 = Math.min(width, x + radius + 1);
  const y1 = Math.min(height, y + radius + 1);
  const sum = integral[y1 * stride + x1] -
    integral[y0 * stride + x1] -
    integral[y1 * stride + x0] +
    integral[y0 * stride + x0];
  return sum / ((x1 - x0) * (y1 - y0));
}

async function normalizeLocalTextPolarity(
  image,
  { radius = 16, darkBackgroundThreshold = 175 } = {}
) {
  const { data, info } = await sharp(image)
    .flatten({ background: "#ffffff" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const integral = buildIntegralImage(data, width, height);
  const output = Buffer.allocUnsafe(data.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const value = data[index];
      const background = localMean(integral, width, height, x, y, radius);
      if (background < darkBackgroundThreshold) {
        const range = Math.max(24, 255 - background);
        output[index] = Math.max(
          0,
          Math.min(255, Math.round(((255 - value) * 255) / range))
        );
      } else {
        output[index] = value;
      }
    }
  }

  return sharp(output, {
    raw: { width, height, channels: 1 }
  }).withMetadata({ density: 144 }).png().toBuffer();
}

module.exports = {
  buildIntegralImage,
  normalizeLocalTextPolarity
};
