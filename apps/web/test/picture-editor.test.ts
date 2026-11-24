import assert from "node:assert/strict";
import { test } from "node:test";
import { fitRect, moveRect, outputSize, resizeRect, turnedSize } from "../components/admin/picture-editor";
import { countMediaReferences, replaceMediaReferences } from "../lib/media-references";

// The media library's picture editor (owner, 23 Nov 2026): crop, turn and flip, saved as a new picture.
const picture = { width: 1200, height: 800 };

test("a quarter turn swaps the picture's sides", () => {
  assert.deepEqual(turnedSize(1200, 800, 0), { width: 1200, height: 800 });
  assert.deepEqual(turnedSize(1200, 800, 1), { width: 800, height: 1200 });
  assert.deepEqual(turnedSize(1200, 800, 2), { width: 1200, height: 800 });
  assert.deepEqual(turnedSize(1200, 800, 3), { width: 800, height: 1200 });
});

test("a shape starts as the largest such area in the middle; free starts as the whole picture", () => {
  assert.deepEqual(fitRect(picture, null), { x: 0, y: 0, w: 1200, h: 800 });
  const banner = fitRect(picture, 2784 / 400);
  assert.equal(banner.w, 1200);
  assert.ok(Math.abs(banner.h - 1200 / (2784 / 400)) < 1e-9);
  assert.ok(Math.abs(banner.y - (800 - banner.h) / 2) < 1e-9, "centred");
  assert.deepEqual(fitRect(picture, 1), { x: 200, y: 0, w: 800, h: 800 });
});

test("the area moves inside the picture and never past its edges", () => {
  const area = { x: 100, y: 100, w: 400, h: 300 };
  assert.deepEqual(moveRect(area, 50, -20, picture), { x: 150, y: 80, w: 400, h: 300 });
  assert.deepEqual(moveRect(area, -500, -500, picture), { x: 0, y: 0, w: 400, h: 300 });
  assert.deepEqual(moveRect(area, 5000, 5000, picture), { x: 800, y: 500, w: 400, h: 300 });
});

test("a corner resizes the area with the opposite corner fixed, keeps a chosen shape, and stays inside the picture", () => {
  const area = { x: 100, y: 100, w: 400, h: 300 };
  assert.deepEqual(resizeRect(area, "se", 100, 50, picture, null), { x: 100, y: 100, w: 500, h: 350 });
  assert.deepEqual(resizeRect(area, "nw", -50, -50, picture, null), { x: 50, y: 50, w: 450, h: 350 });
  const square = resizeRect({ x: 100, y: 100, w: 300, h: 300 }, "se", 200, 10, picture, 1);
  assert.equal(square.w, square.h, "a square stays square");
  assert.equal(square.w, 500);
  const capped = resizeRect({ x: 600, y: 400, w: 300, h: 300 }, "se", 2000, 2000, picture, 1);
  assert.ok(capped.x + capped.w <= 1200 && capped.y + capped.h <= 800, "inside the picture");
  assert.equal(capped.w, capped.h);
  assert.equal(resizeRect(area, "se", -1000, -1000, picture, null).w, 16, "never smaller than 16 px");
});

test("the copy is a banner size exactly, or the chosen area's own pixels", () => {
  assert.deepEqual(outputSize({ x: 0, y: 0, w: 1200, h: 172.4 }, { kind: "exact", width: 2784, height: 400 }), { width: 2784, height: 400 });
  assert.deepEqual(outputSize({ x: 3, y: 4, w: 640.4, h: 359.6 }, { kind: "free" }), { width: 640, height: 360 });
});

test("an edited copy can take the original's place everywhere the draft uses it, and nowhere else", () => {
  const old = `/media/uploads/${"a".repeat(64)}.webp`, copy = `/media/uploads/${"b".repeat(64)}.webp`, other = `/media/uploads/${"c".repeat(64)}.webp`;
  const draft = { campaigns: [{ key: "beds-hero", artwork: { desktopImage: old, mobileImage: other } }], pages: [{ content: [{ tag: "p", children: [{ tag: "img", src: old }] }] }], instagramPosts: [{ src: other }], label: "old" };
  assert.equal(countMediaReferences(draft, old), 2);
  const next = replaceMediaReferences(draft, old, copy);
  assert.equal(countMediaReferences(next, old), 0);
  assert.equal(countMediaReferences(next, copy), 2);
  assert.equal(next.campaigns[0]!.artwork.mobileImage, other, "other pictures untouched");
  assert.equal(next.instagramPosts, draft.instagramPosts, "unchanged parts are the same objects");
  assert.equal(replaceMediaReferences(draft, `/media/uploads/${"d".repeat(64)}.webp`, copy), draft, "nothing to change: the same document");
});
