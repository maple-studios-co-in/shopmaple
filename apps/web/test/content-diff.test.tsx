import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { diffContent } from "../lib/content-diff";

// The history diff lists what a restore would change, grouped by admin screen, with the
// field path and both values; unchanged content produces no rows.
test("identical content has no changes", () => {
  assert.deepEqual(diffContent(defaultStorefrontContent, structuredClone(defaultStorefrontContent)), []);
});

test("changed, added and removed values are listed under the screen that edits them", () => {
  const current = structuredClone(defaultStorefrontContent);
  const revision = structuredClone(defaultStorefrontContent);
  revision.homeCopy.chairsHeading = "Lounge chairs";
  revision.homeSections = revision.homeSections.map((section) => section.key === "ticker" ? { ...section, enabled: false } : section);
  revision.pages = [...revision.pages, { slug: "care-guide", title: "Care guide", description: "Caring for wood", body: "Keep dry.", banner: null }];
  const changes = diffContent(revision, current);
  assert.deepEqual(changes.find((change) => change.path === "homeCopy > chairsHeading"), { area: "Homepage", path: "homeCopy > chairsHeading", label: "Homepage copy: Chairs heading", revision: "Lounge chairs", current: "Chairs" });
  const ticker = revision.homeSections.findIndex((section) => section.key === "ticker");
  assert.deepEqual(changes.find((change) => change.path === `homeSections > ${ticker} > enabled`), { area: "Homepage", path: `homeSections > ${ticker} > enabled`, label: "Homepage sections: Ticker: Enabled", revision: "false", current: "true" });
  const page = changes.find((change) => change.path === `pages > ${revision.pages.length - 1}`);
  assert.equal(page?.area, "Pages");
  assert.equal(page?.current, "(none)");
  assert.match(page?.revision ?? "", /Care guide/);
  assert.equal(changes.every((change) => change.area !== "Campaigns"), true, "Untouched areas are not listed");
});

test("each change carries a readable label instead of the raw content path", () => {
  const revision = structuredClone(defaultStorefrontContent);
  revision.homeCopy.chairsHeading = "Lounge chairs";
  revision.homeSections = revision.homeSections.map((section) => section.key === "ticker" ? { ...section, enabled: false } : section);
  revision.pages = [...revision.pages, { slug: "care-guide", title: "Care guide", description: "Caring for wood", body: "Keep dry.", banner: null }];
  const changes = diffContent(revision, defaultStorefrontContent);
  const label = (path: string) => changes.find((change) => change.path === path)?.label;
  assert.equal(label("homeCopy > chairsHeading"), "Homepage copy: Chairs heading");
  const ticker = revision.homeSections.findIndex((section) => section.key === "ticker");
  assert.equal(label(`homeSections > ${ticker} > enabled`), "Homepage sections: Ticker: Enabled");
  assert.equal(label(`pages > ${revision.pages.length - 1}`), "Pages: Care guide");
  assert.ok(changes.every((change) => change.label && !/[a-z][A-Z]/.test(change.label.split(": ")[0]!)), "No camelCase keys reach the sheet");
});

test("long values are shortened so the sheet stays readable", () => {
  const revision = structuredClone(defaultStorefrontContent);
  revision.homeCopy.ticker = "x".repeat(400);
  const [change] = diffContent(revision, defaultStorefrontContent);
  assert.ok(change && change.revision.length <= 161 && change.revision.endsWith("…"));
});
