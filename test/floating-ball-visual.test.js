const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("animation markup uses complementary back, doll, and front layers", () => {
  const html = fs.readFileSync(path.join(root, "src/renderer/index.html"), "utf8");
  const back = html.indexOf('class="animation-bag animation-bag-back"');
  const motion = html.indexOf('class="animation-doll-motion"');
  const doll = html.indexOf('id="animationDoll"');
  const front = html.indexOf('class="animation-bag animation-bag-front"');

  assert.ok(back >= 0 && motion > back && doll > motion && front > doll);
  assert.equal((html.match(/translator-bag-back\.png/g) || []).length, 1);
  assert.equal((html.match(/translator-bag-front\.png/g) || []).length, 1);
  assert.doesNotMatch(html, /translator-empty-bag\.png/);
  assert.match(html, /translator-jump-doll\.png/g);
  assert.doesNotMatch(html, /left-doll\.png|right-doll\.png/);
});

test("left and right edge poses mirror one shared doll", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");

  assert.match(css, /\.edge-left[\s\S]*--edge-jump-x:\s*-72px/);
  assert.match(css, /\.edge-right[\s\S]*--edge-jump-x:\s*72px/);
  assert.match(css, /\.edge-left[\s\S]*--edge-turn:\s*-90deg/);
  assert.match(css, /\.edge-right[\s\S]*--edge-turn:\s*90deg/);
  assert.match(css, /\.edge-left[\s\S]*--peek-turn:\s*90deg/);
  assert.match(css, /\.edge-right[\s\S]*--peek-turn:\s*-90deg/);
});

test("bag layers are fixed and never clipped or animated", () => {
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");
  const bagRule = css.match(/\.animation-bag\s*\{([^}]*)\}/)?.[1] || "";

  assert.doesNotMatch(bagRule, /clip-path|mask|overflow/);
  assert.match(css, /\.animation-bag-back\s*\{[\s\S]*z-index:\s*1/);
  assert.match(css, /\.animation-bag-front\s*\{[\s\S]*z-index:\s*3/);
  assert.doesNotMatch(css, /bag-mouth|bag-mask|dock-bag-(?:hide|reveal)/);
  assert.match(css, /show-static-bag/);
});

test("the doll uses one reversible edge path plus a separate landing bounce", () => {
  const html = fs.readFileSync(path.join(root, "src/renderer/index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");

  assert.match(html, /class="animation-doll-motion"[\s\S]*id="animationDoll"/);
  assert.match(css, /--doll-visible-low-one:\s*28\.125%/);
  assert.match(css, /--doll-visible-high-one:\s*51\.5%/);
  assert.match(css, /--doll-visible-low-two:\s*29\.6875%/);
  assert.match(css, /--doll-visible-rest:\s*45\.5%/);
  assert.match(css, /@keyframes dock-doll-edge-path/);
  assert.match(css, /\.ball-state-hiding \.animation-doll-motion[\s\S]*dock-doll-edge-path/);
  assert.match(css, /\.ball-state-revealing \.animation-doll-motion[\s\S]*reverse both/);
  assert.match(css, /--reveal-settle-delay:\s*var\(--reveal-entry-duration\)/);
  assert.match(css, /dock-doll-settle[\s\S]*var\(--reveal-settle-delay\)/);
  assert.match(css, /16%\s*\{[\s\S]*var\(--doll-visible-low-one\)/);
  assert.match(css, /39%\s*\{[\s\S]*var\(--doll-visible-high-one\)/);
  assert.match(css, /57%\s*\{[\s\S]*var\(--doll-visible-low-two\)/);
  assert.doesNotMatch(css, /bag-mouth-cutoff|bag-interior-clip|contain-doll-in-bag|release-doll-from-bag/);
});

test("a hide interrupted by pointer return resumes the shared path in reverse", () => {
  const renderer = fs.readFileSync(path.join(root, "src/renderer/renderer.js"), "utf8");

  assert.match(renderer, /previousBallState === "hiding" && currentBallState === "revealing"/);
  assert.match(renderer, /reversePath\.currentTime = entryDuration - traversed/);
  assert.match(renderer, /--reveal-settle-delay/);
});
