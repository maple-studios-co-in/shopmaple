import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Owner, 10 Nov 2026: the journey's Next arrow sat under the floating "Contact us" button, and the section ran past
// one screen. The arrows now stand beside the heading, and the whole section fits the window.
const css = readFileSync(new URL("../styles/our-story.css", import.meta.url), "utf8");
const block = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `no rule for ${selector}`);
  return css.slice(at, css.indexOf("}", at) + 1);
};

test("the journey's arrows stand beside its heading, at the top right, away from the floating Contact us button", () => {
  assert.match(block(".story-journey"), /position: relative;/);
  const arrows = block(".story-timeline-arrows");
  assert.match(arrows, /position: absolute;/);
  assert.match(arrows, /right: var\(--story-gutter\);/);
  assert.match(arrows, /top: calc\(var\(--journey-pad\) \+ var\(--journey-eyebrow\) \+ var\(--journey-gap\)/, "level with the heading");
  assert.match(block(".story-page .story-journey-title"), /padding-right: calc\(2 \* var\(--journey-arrow\)/, "the heading wraps before the arrows");
});

test("the heading, the chapter and its years fit one screen: spacing and the photo give way on short windows", () => {
  const journey = block(".story-journey");
  assert.match(journey, /--journey-pad: min\(clamp\(44px, 4\.444vw, 85px\), \d+(\.\d+)?svh\);/);
  assert.match(journey, /--journey-gap: min\(clamp\(24px, 2\.778vw, 53px\), \d+(\.\d+)?svh\);/);
  assert.match(journey, /--journey-chrome: calc\(/, "everything in the section but the photo");
  // The photo's column is the design's share of the row, or what the window's height leaves for it, whichever is less
  // (never under 240px).
  assert.match(block(".story-chapter"), /grid-template-columns: max\(240px, min\(calc\(\(100% - var\(--story-chapter-gap\)\) \* 0\.46667\), calc\(\(100svh - var\(--journey-chrome\)\) \* 560 \/ 540\)\)\) minmax\(0, 1fr\);/);
});
