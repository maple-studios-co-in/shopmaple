import assert from "node:assert/strict";
import { test } from "node:test";
import { storefrontContentSchema } from "@shopmaple/contracts";
import { defaultStorefrontContent } from "../lib/content-defaults";

const tile = () => ({ key: "living", title: "Living room", collectionHandle: "living-room", image: "/media/living.webp", alt: "A living room", enabled: true });
const merchandising = () => ({ bestsellers: ["second-product", "first-product"], chairs: ["chair-two", "chair-one"], categories: [tile(), { ...tile(), key: "dining", enabled: false }], offers: [{ ...tile(), key: "sale" }] });

test("legacy documents remain valid without merchandising", () => {
  const legacy = { ...defaultStorefrontContent };
  delete legacy.homeMerchandising;
  const result = storefrontContentSchema.safeParse(legacy);
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.homeMerchandising, undefined);
});

test("homepage selections preserve product and tile order, hidden tiles and intentionally empty rails", () => {
  const result = storefrontContentSchema.safeParse({ ...defaultStorefrontContent, homeMerchandising: merchandising() });
  assert.equal(result.success, true, "valid merchandising must be accepted");
  if (!result.success) return;
  assert.deepEqual(result.data.homeMerchandising?.bestsellers, ["second-product", "first-product"]);
  assert.deepEqual(result.data.homeMerchandising?.categories.map(value => [value.key, value.enabled]), [["living", true], ["dining", false]]);
  assert.equal(storefrontContentSchema.safeParse({ ...defaultStorefrontContent, homeMerchandising: { bestsellers: [], chairs: [], categories: [], offers: [] } }).success, true);
});

test("merchandising rejects duplicate identities, invalid slugs, oversized arrays and unsafe or unexpected tile fields", () => {
  const value = merchandising();
  const badTiles = [
    ...["", " ", "Capital", "-leading", "trailing-", "two--hyphens", "path/segment", "x".repeat(81)].map(key => ({ ...tile(), key })),
    ...["", "../private", "bad?query=1", "x".repeat(201)].map(collectionHandle => ({ ...tile(), collectionHandle })),
    ...["", "   ", "x".repeat(121), "bad\u0000text", "bad\ttext", "bad\ntext", "bad\u007ftext"].map(title => ({ ...tile(), title })),
    ...["", "  ", "x".repeat(201), "bad\u000btext"].map(alt => ({ ...tile(), alt })),
    ...["https://evil.invalid/image.webp", "javascript:alert(1)", "/media/../private", "https://cdn.shopify.com.evil.invalid/s/files/x", "https://user:pass@cdn.shopify.com/s/files/x"].map(image => ({ ...tile(), image })),
    { ...tile(), enabled: "true" }, { ...tile(), href: "/checkout" },
  ];
  const invalid = [null, {}, { ...value, extra: true },
    ...["bestsellers", "chairs"].flatMap(rail => [
      { ...value, [rail]: ["duplicate", "duplicate"] },
      { ...value, [rail]: Array.from({ length: 13 }, (_, i) => `product-${i}`) },
      ...["", "UPPER", "one--two", "../cart", "x".repeat(201)].map(handle => ({ ...value, [rail]: [handle] })),
    ]),
    ...["categories", "offers"].flatMap(rail => [
      { ...value, [rail]: [tile(), tile()] },
      { ...value, [rail]: Array.from({ length: 13 }, (_, i) => ({ ...tile(), key: `tile-${i}` })) },
      ...badTiles.map(item => ({ ...value, [rail]: [item] })),
    ]),
  ];
  for (const homeMerchandising of invalid) assert.equal(storefrontContentSchema.safeParse({ ...defaultStorefrontContent, homeMerchandising }).success, false);
});

test("merchandising keeps the complete document within the 128 KiB content bound", () => {
  const result = storefrontContentSchema.safeParse({ ...defaultStorefrontContent, homeMerchandising: merchandising(), pages: Array.from({ length: 20 }, (_, i) => ({ slug: `large-${i}`, title: "Page", description: "Description", body: "x".repeat(8000), banner: null })) });
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.error.issues.some(issue => issue.message === "Content exceeds 128 KiB"));
});

test("legacy resolution restores original selections and every resolution isolates nested edits", async () => {
  const { defaultHomeMerchandising, resolveHomeMerchandising } = await import("../lib/home-merchandising-defaults");
  const legacy = resolveHomeMerchandising();
  assert.deepEqual(legacy.bestsellers, ["aera-swivel-lounge-chair", "aero-dining-chair", "aileron-signature-bed", "aileron-upholstered-bench", "alcyone-7-seater-sofa", "alina-7-seater-sofa"]);
  assert.deepEqual(legacy.chairs, ["caro", "ario", "nola", "tara", "arno", "rollo"]);
  assert.deepEqual(legacy.categories.map(item => item.collectionHandle), ["sofas", "dining-chair", "center-tables", "accent-chair", "beds", "dinings"]);
  assert.deepEqual(legacy.offers.map(item => item.collectionHandle), ["clearance-sale", "minimum-60-off", "best-buy-under-rs-50-000", "furniture-store-under-rs-25-000"]);
  assert.equal(legacy.categories[0]?.image, "https://shop.maplefurnishers.com/cdn/shop/collections/Cover_Image_Maple_6.svg?v=1778649785");
  assert.ok(legacy.categories.every(item => item.enabled && item.alt === item.title && item.key === item.collectionHandle));
  assert.equal(storefrontContentSchema.safeParse({ ...defaultStorefrontContent, homeMerchandising: legacy }).success, true);
  legacy.categories[0]!.title = "Local change";
  legacy.bestsellers.length = 0;
  assert.equal(resolveHomeMerchandising().categories[0]?.title, "Sofas");
  assert.equal(defaultHomeMerchandising.bestsellers.length, 6);
  const selected = merchandising();
  const resolved = resolveHomeMerchandising(selected);
  assert.deepEqual(resolved.bestsellers, ["second-product", "first-product"]);
  resolved.categories[0]!.title = "Local edit";
  resolved.chairs.reverse();
  assert.equal(selected.categories[0]?.title, "Living room");
  assert.deepEqual(selected.chairs, ["chair-two", "chair-one"]);
});
