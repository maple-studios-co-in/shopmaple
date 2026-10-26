import assert from "node:assert/strict";
import test from "node:test";
import { storefrontContentSchema } from "../../../packages/contracts/src/content";
import { defaultStorefrontContent } from "../lib/content-defaults";

const item = { key: "home-newsletter", image: "/media/artwork.webp", alt: "Maple room" };
const parse = (templateMedia: unknown) => storefrontContentSchema.safeParse({ ...defaultStorefrontContent, templateMedia });

test("legacy content keeps optional template media absent and empty overrides are valid", () => {
  const legacy = storefrontContentSchema.parse(defaultStorefrontContent);
  assert.equal((legacy as Record<string, unknown>).templateMedia, undefined);
  assert.equal(parse([]).success, true);
});
test("template artwork accepts fixed image slots and requires complete responsive pairs", () => {
  assert.equal(parse([item]).success, true);
  const responsive = ["home-nimbus", "nimbus-room-collection", "nimbus-slide-living", "nimbus-slide-bedroom", "nimbus-slide-dining", "nimbus-hero-poster"];
  for (const key of responsive) {
    assert.equal(parse([{ ...item, key, mobileImage: "/media/mobile.webp" }]).success, true, key);
    assert.equal(parse([{ ...item, key }]).success, false, key);
  }
  assert.equal(parse([{ ...item, mobileImage: "/media/mobile.webp" }]).success, false);
});
test("template artwork rejects duplicate unknown or excessive identities and extra fields", () => {
  assert.equal(parse([item, item]).success, false);
  for (const key of ["unknown", "Home-newsletter", "../home-newsletter", "home_newsletter"])
    assert.equal(parse([{ ...item, key }]).success, false, key);
  assert.equal(parse(Array.from({ length: 48 }, () => item)).success, false);
  assert.equal(parse([{ ...item, href: "/pages/contact" }]).success, false);
});
test("template artwork enforces approved media and nonblank control-free bounded alternatives", () => {
  for (const image of ["https://evil.invalid/art.jpg", "javascript:alert(1)", "/media/../secret", "/media/%2e%2e/secret", "//cdn.shopify.com/s/files/a.jpg"])
    assert.equal(parse([{ ...item, image }]).success, false, image);
  for (const alt of ["", "  ", "line\nfeed", "tab\tstop", "nul\0", "x".repeat(201)])
    assert.equal(parse([{ ...item, alt }]).success, false, JSON.stringify(alt));
  for (const key of ["home-hero-sofas", "home-hero-chairs", "home-hero-tables", "home-hero-beds"])
    assert.equal(parse([{ ...item, key, alt: "" }]).success, true, key);
  assert.equal(parse([{ ...item, alt: "x".repeat(200) }]).success, true);
  assert.equal(parse([{ ...item, key: "home-nimbus", mobileImage: "https://evil.invalid/mobile.jpg" }]).success, false);
});
test("template media remains within the whole-document 128 KiB bound", () => {
  const content = { ...defaultStorefrontContent, templateMedia: [item], pages: Array.from({ length: 20 }, (_, index) => ({ slug: `guide-${index}`, title: "Guide", description: "", body: "x".repeat(8000), banner: null })) };
  const result = storefrontContentSchema.safeParse(content);
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.error.issues.some(issue => issue.message === "Content exceeds 128 KiB"));
});

test("template fallback resolution preserves original assets and caller labels without sharing mutable items", async () => {
  const { resolveTemplateMedia, templateMediaSlots } = await import("../lib/template-media-defaults");
  const original = resolveTemplateMedia("home-workshop-poster");
  assert.deepEqual(original, { key: "home-workshop-poster", image: "/media/workshop-poster.webp", alt: "Furniture craftsmanship at Maple" });
  original.image = "/media/mutated.webp";
  assert.equal(resolveTemplateMedia("home-workshop-poster").image, "/media/workshop-poster.webp");
  assert.equal(resolveTemplateMedia("nimbus-room-living", [], "Evening lounge").alt, "Evening lounge");
  assert.equal(resolveTemplateMedia("nimbus-room-living").alt, "Living Room");
  const override = [{ key: "home-newsletter" as const, image: "/media/override.webp", alt: "Updated room" }];
  const selected = resolveTemplateMedia("home-newsletter", override, "Ignored fallback");
  assert.deepEqual(selected, { key: "home-newsletter", image: "/media/override.webp", alt: "Updated room" });
  selected.alt = "Mutated";
  assert.equal(override[0]!.alt, "Updated room");
  assert.equal(templateMediaSlots.length, 47);
  assert.equal(parse(templateMediaSlots.map(({ label: _label, group: _group, ...asset }) => asset)).success, true);
});
