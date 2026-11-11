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
  assert.equal(parse([{ ...item, href: "/contact" }]).success, false);
});
test("template artwork enforces approved media and nonblank control-free bounded alternatives", () => {
  // Shopify's files are no longer approved media (owner, 11 Nov 2026), on either Shopify host or as an older copy path.
  for (const image of ["https://evil.invalid/art.jpg", "javascript:alert(1)", "/media/../secret", "/media/%2e%2e/secret", "//cdn.shopify.com/s/files/a.jpg",
    "https://cdn.shopify.com/s/files/1/0691/8651/9229/files/a.jpg", "https://shop.maplefurnishers.com/cdn/shop/files/a.png", "/media/shopify/0123456789abcdef0123456789abcdef.png"])
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
  const original = resolveTemplateMedia("home-hero-sofas");
  assert.deepEqual(original, { key: "home-hero-sofas", image: "/media/home/hero-sofas.webp", alt: "" });
  original.image = "/media/mutated.webp";
  assert.equal(resolveTemplateMedia("home-hero-sofas").image, "/media/home/hero-sofas.webp");
  // A placement whose original was a Shopify file has no bundled image any more.
  assert.deepEqual(resolveTemplateMedia("home-workshop-poster"), { key: "home-workshop-poster", image: "", alt: "Maple furniture" });
  assert.equal(resolveTemplateMedia("nimbus-room-living", [], "Evening lounge").alt, "Evening lounge");
  assert.equal(resolveTemplateMedia("nimbus-room-living").alt, "Living Room");
  const override = [{ key: "home-newsletter" as const, image: "/media/override.webp", alt: "Updated room" }];
  const selected = resolveTemplateMedia("home-newsletter", override, "Ignored fallback");
  assert.deepEqual(selected, { key: "home-newsletter", image: "/media/override.webp", alt: "Updated room" });
  selected.alt = "Mutated";
  assert.equal(override[0]!.alt, "Updated room");
  // Our Story's redesign (10 Nov 2026) traded the film poster for the belief photo and added seven chapter photos; the
  // contact redesign added two photos and the Bulk Enquiry redesign five (54 + 2 + 5).
  assert.equal(templateMediaSlots.length, 61);
  assert.deepEqual(templateMediaSlots.filter(slot => slot.key.startsWith("bulk-")).map(slot => [slot.key, slot.image]), [
    ["bulk-hero", "/media/bulk-enquiry/hero.webp"], ["bulk-step-meet", "/media/bulk-enquiry/step-meet.webp"],
    ["bulk-step-design", "/media/bulk-enquiry/step-design.webp"], ["bulk-step-deliver", "/media/bulk-enquiry/step-deliver.webp"],
    ["bulk-proposal", "/media/bulk-enquiry/proposal.webp"],
  ]);
  assert.equal(parse(templateMediaSlots.filter(slot => slot.image).map(({ label: _label, group: _group, product: _product, ...asset }) => asset)).success, true);
  assert.ok(templateMediaSlots.every(slot => !/shopify|\/cdn\/shop\//i.test(`${slot.image} ${slot.mobileImage ?? ""}`)), "no slot's original names Shopify");
});

test("a former Shopify placement shows staff's upload, else its Keeri product's photo for both crops, else nothing", async () => {
  const { resolveArtwork, artworkProducts, templateMediaSlots } = await import("../lib/template-media-defaults");
  const keeri = "https://store.maplefurnishers.com/media/keeri/aurevo.webp";
  const photos = new Map([["aurevo", keeri]]);
  assert.deepEqual(resolveArtwork("nimbus-slide-living", undefined, photos), { key: "nimbus-slide-living", image: keeri, mobileImage: keeri, alt: "Living room" });
  assert.equal(resolveArtwork("nimbus-slide-living", undefined, new Map()), null, "an unlisted product leaves the placement out");
  assert.equal(resolveArtwork("home-newsletter", undefined, photos), null, "a placement with no stand-in shows nothing until an upload");
  const upload = { key: "nimbus-slide-living" as const, image: "/media/uploads/" + "f".repeat(64) + ".webp", mobileImage: "/media/uploads/" + "e".repeat(64) + ".webp", alt: "Our living room" };
  assert.deepEqual(resolveArtwork("nimbus-slide-living", [upload], photos), upload);
  assert.deepEqual(resolveArtwork("home-hero-sofas", undefined, new Map()), { key: "home-hero-sofas", image: "/media/home/hero-sofas.webp", alt: "" }, "a bundled original needs no photo");
  assert.deepEqual(artworkProducts(["nimbus-slide-living", "nimbus-slide-dining", "home-hero-sofas", "home-newsletter"], [upload]), ["meridian-table"], "only placements without an upload or bundled original ask for a photo");
  // Every stand-in names a Keeri product, never a Shopify-only listing.
  assert.ok(templateMediaSlots.filter(slot => slot.product).every(slot => /^[a-z0-9-]+$/.test(slot.product!)));
});
