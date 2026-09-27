function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function mapCssRectToImagePixels(rect, viewport, imageSize) {
  if (
    !rect ||
    !viewport ||
    !imageSize ||
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    imageSize.width <= 0 ||
    imageSize.height <= 0
  ) {
    throw new Error("区域截图坐标无效");
  }

  const left = Math.min(rect.x, rect.x + rect.width);
  const top = Math.min(rect.y, rect.y + rect.height);
  const right = Math.max(rect.x, rect.x + rect.width);
  const bottom = Math.max(rect.y, rect.y + rect.height);
  const scaleX = imageSize.width / viewport.width;
  const scaleY = imageSize.height / viewport.height;

  const x1 = clamp(Math.round(left * scaleX), 0, imageSize.width);
  const y1 = clamp(Math.round(top * scaleY), 0, imageSize.height);
  const x2 = clamp(Math.round(right * scaleX), 0, imageSize.width);
  const y2 = clamp(Math.round(bottom * scaleY), 0, imageSize.height);

  return {
    x: x1,
    y: y1,
    width: Math.max(0, x2 - x1),
    height: Math.max(0, y2 - y1),
    scaleX,
    scaleY
  };
}

module.exports = { mapCssRectToImagePixels };
