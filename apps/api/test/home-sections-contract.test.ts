import assert from "node:assert/strict";
import { test } from "node:test";
import { homeSectionKeys, storefrontContentSchema } from "@shopmaple/contracts";

const base = { schemaVersion: 1, homeSections: [{ key: "hero", enabled: true }], homeCopy: { categoryHeading: "Rooms", bestsellersHeading: "Favourites", socialHeading: "At home", ticker: "Furniture", testimonialHeading: "Customers", testimonialSubheading: "Stories" }, campaigns: [], instagramPosts: [{ href: "https://www.instagram.com/p/test/", src: "/media/room.webp", alt: "Room" }], pages: [], motion: { autoplaySocial: false, autoplayCities: false, revealSections: false } };
const legacyKeys = [
  "hero", "announcement", "difference", "categories", "ticker", "offers", "nimbus", "dining-banner", "instagram", "bestsellers",
  "seating-banner", "chairs", "promos", "cities", "testimonial", "project", "values", "newsletter",
];
const editorial = {
  title: "Pull up a chair", text: "There is always something worth staying for.", cta: "Shop Dining", href: "/collections/dinings",
  leftImage: "/media/home/editorial-left.webp", leftAlt: "A marble table by a window",
  rightImage: "/media/home/editorial-right.webp", rightAlt: "Coffee being poured at a dining table",
};
const compare = {
  eyebrow: "Find your feel", heading: "Two ways to unwind", lede: "Explore distinct silhouettes.",
  left: { handle: "aera-swivel-lounge-chair", label: "Aera" }, right: { handle: "caro", label: "Caro" },
};
const parse = (patch: Record<string, unknown>) => storefrontContentSchema.safeParse({ ...base, ...patch });

test("a document published before the editorial and compare sections still parses", () => {
  const result = parse({ homeSections: legacyKeys.map((key) => ({ key, enabled: true })) });
  assert.equal(result.success, true, "eighteen sections without the new keys stay valid");
  if (result.success) assert.deepEqual(result.data.homeSections.map((s) => s.key), legacyKeys);
});

test("editorial and compare are section keys, and a page may use all twenty", () => {
  assert.ok((homeSectionKeys as readonly string[]).includes("editorial"));
  assert.ok((homeSectionKeys as readonly string[]).includes("compare"));
  const all = parse({ homeSections: [...legacyKeys, "editorial", "compare"].map((key) => ({ key, enabled: true })) });
  assert.equal(all.success, true, "twenty sections fit");
  assert.equal(parse({ homeSections: [...legacyKeys, "editorial", "compare", "hero"].map((key) => ({ key, enabled: true })) }).success, false, "a repeated section is still refused");
});

test("editorial and compare copy is optional and, when present, bounded and approved", () => {
  const withBoth = parse({ homeDetails: { ...legacyDetails(), editorial, compare } });
  assert.equal(withBoth.success, true, "both parts pass");
  if (withBoth.success) {
    assert.deepEqual(withBoth.data.homeDetails?.editorial, editorial);
    assert.deepEqual(withBoth.data.homeDetails?.compare, compare);
  }
  assert.equal(parse({ homeDetails: legacyDetails() }).success, true, "details published earlier carry neither part");
  const bad = (part: "editorial" | "compare", value: unknown) => parse({ homeDetails: { ...legacyDetails(), [part]: value } }).success;
  assert.equal(bad("editorial", { ...editorial, leftImage: "https://example.com/a.webp" }), false, "an unapproved image host is refused");
  assert.equal(bad("editorial", { ...editorial, href: "https://example.com/" }), false, "only store links");
  assert.equal(bad("editorial", { ...editorial, title: " " }), false, "blank text is refused");
  assert.equal(bad("editorial", { ...editorial, rightAlt: "x".repeat(201) }), false, "alt text is bounded");
  assert.equal(bad("compare", { ...compare, left: { handle: "Not A Handle", label: "Aera" } }), false, "a handle must be a catalogue handle");
  assert.equal(bad("compare", { ...compare, right: { handle: "caro", label: "" } }), false, "a label is needed");
  assert.equal(bad("compare", { ...compare, extra: true }), false, "unknown fields are refused");
});

function legacyDetails() {
  return {
    hero: { cta: "Explore", tiles: [{ key: "sofas", label: "Sofas", priceLabel: "A" }, { key: "chairs", label: "Chairs", priceLabel: "B" }, { key: "tables", label: "Tables", priceLabel: "C" }, { key: "beds", label: "Beds", priceLabel: "D" }] },
    difference: { eyebrow: "E", heading: "H", cta: "C", promises: ["a", "b", "c", "d"] },
    nimbus: { heading: "N", tagline: "T", features: ["a", "b", "c", "d"], cta: "C" },
    testimonial: { title: "T", paragraphs: ["p"], name: "N", attribution: "A" },
    newsletter: { heading: "H", body: "B", signupHeading: "S" },
    values: [{ key: "quiet-luxury", title: "a", body: "b" }, { key: "real-living", title: "a", body: "b" }, { key: "ages-beautifully", title: "a", body: "b" }, { key: "strength", title: "a", body: "b" }],
    cities: { eyebrow: "E", heading: "H" },
    project: { heading: "H", introBefore: "a", responseTime: "b", introAfter: "c", body: "d" },
  };
}
