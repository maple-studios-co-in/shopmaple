import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { defaultNimbusPage, resolveNimbusLanding, resolveNimbusPageContent } from "../lib/nimbus-content-defaults";
import { defaultTerraPage, resolveTerraLanding, resolveTerraPageContent } from "../lib/terra-content-defaults";

// The Nimbus and Terra frames' update (Figma 311:548, 311:921; owner, 12 Nov 2026): duotone illustrations in place of the
// line icons, and a new third "How it feels" card on each page.

test("a saved page still in the earlier design's words takes the new third card; words staff wrote stay", () => {
  const nimbus = structuredClone(defaultNimbusPage);
  nimbus.feeling.items[2] = { title: "Quiet luxury", body: "Refined in every detail." };
  assert.deepEqual(resolveNimbusPageContent(nimbus).feeling.items[2], { title: "Sculpted silhouettes", body: "Soft curves. Considered proportions." });
  nimbus.feeling.items[2] = { title: "Calm luxury", body: "Refined in every detail." };
  assert.deepEqual(resolveNimbusPageContent(nimbus).feeling.items[2], { title: "Calm luxury", body: "Soft curves. Considered proportions." },
    "a title staff rewrote stays; the untouched line follows the design");
  nimbus.feeling.items[2] = { title: "Calm luxury", body: "Made for lingering." };
  assert.deepEqual(resolveNimbusPageContent(nimbus).feeling.items[2], { title: "Calm luxury", body: "Made for lingering." });

  const terra = structuredClone(defaultTerraPage);
  terra.feeling.items[2] = { title: "Connected", body: "Closer to the outdoors." };
  assert.deepEqual(resolveTerraPageContent(terra).feeling.items[2], { title: "Open-air living", body: "Woven seating for outdoor spaces." });
  terra.feeling.items[2] = { title: "Outdoors", body: "Closer to the outdoors." };
  assert.deepEqual(resolveTerraPageContent(terra).feeling.items[2], { title: "Outdoors", body: "Woven seating for outdoor spaces." });
  assert.deepEqual(resolveTerraPageContent().feeling.items[2], { title: "Open-air living", body: "Woven seating for outdoor spaces." });
  assert.notEqual(resolveTerraPageContent(terra), terra, "always a fresh copy");
});

test("every illustration the pages name is a bundled, script-free SVG drawn at the design's size", () => {
  const pages = [resolveNimbusLanding(defaultStorefrontContent), resolveTerraLanding(defaultStorefrontContent)];
  const cards = pages.flatMap(page => page.feeling.items.map(item => item.art));
  const small = pages.flatMap(page => [...page.material.notes, ...page.promise].map(item => item.art));
  assert.equal(new Set([...cards, ...small]).size, 15, "six per page, and the promise strip's three shared");
  for (const [arts, size] of [[cards, 112], [small, 40]] as const) {
    for (const src of arts) {
      const file = new URL(`../public${src}`, import.meta.url);
      assert.ok(existsSync(file), `${src} is bundled`);
      const svg = readFileSync(file, "utf8");
      assert.match(svg, new RegExp(`^<svg[^>]* width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"`), `${src} is ${size}px`);
      assert.doesNotMatch(svg, /<script|<foreignObject|\son[a-z]+=|href="(?!#)/i, `${src} draws only shapes`);
    }
  }
});
