import assert from "node:assert/strict";
import test from "node:test";
import { catalogueCardsResponseSchema, contentImageSchema, productCardSchema, productSchema, shopifyMediaPathPattern, toProductCard } from "@shopmaple/contracts";
import { canonicalShopifyMediaUrl, shopifyMediaName, shopifyMediaPath } from "@shopmaple/contracts/shopify-media";
import { approvedCatalogueImage } from "../src/shopify-catalogue.js";

const files = "https://cdn.shopify.com/s/files/1/0691/8651/9229/";

test("every way of naming one Shopify file gives one canonical CDN address and one local name", () => {
  const same = [
    "https://shop.maplefurnishers.com/cdn/shop/files/Chairs_1.png?v=1779440214&width=600",
    "https://shop.maplefurnishers.com/cdn/shop//files/Chairs_1.png",
    `${files}files/Chairs_1.png?v=1&height=300`,
    `//cdn.shopify.com/s/files/1/0691/8651/9229/files/Chairs_1.png?v=2`,
  ];
  for (const url of same) assert.equal(canonicalShopifyMediaUrl(url), `${files}files/Chairs_1.png`, url);
  assert.equal(new Set(same.map(shopifyMediaName)).size, 1);
  assert.match(shopifyMediaPath(same[0]!)!, shopifyMediaPathPattern);
  assert.equal(canonicalShopifyMediaUrl("https://shop.maplefurnishers.com/cdn/shop/videos/c/vp/abc/abc.HD-720p.mp4?v=0"), "https://cdn.shopify.com/videos/c/vp/abc/abc.HD-720p.mp4");
  assert.equal(canonicalShopifyMediaUrl("https://shop.maplefurnishers.com/cdn/shop/collections/Sofa_set.png"), `${files}collections/Sofa_set.png`);
  // Files at different paths, or with different extensions, are different files.
  assert.notEqual(shopifyMediaName(`${files}files/Chairs_1.png`), shopifyMediaName(`${files}files/Chairs_1.webp`));
  assert.ok(shopifyMediaName(`${files}files/Photo.JPG`)!.endsWith(".jpg"));
});

test("only Shopify's own media areas over https, of a kept picture or film type, have a local name", () => {
  for (const url of [
    "http://cdn.shopify.com/s/files/1/0691/8651/9229/files/a.png", "https://cdn.shopify.com.evil.example/s/files/a.png",
    "https://cdn.shopify.com/admin/a.png", "https://cdn.shopify.com:444/s/files/a.png", "https://user@cdn.shopify.com/s/files/a.png",
    "https://shop.maplefurnishers.com/products/a.png", "https://store.maplefurnishers.com/media/keeri/a.webp",
    `${files}files/readme.txt`, `${files}files/`, `${files}files/archive`, "/media/shopify/abc.png", "not a url",
  ]) assert.equal(shopifyMediaName(url), null, url);
});

test("the store's copies are valid content, product and catalogue images; arbitrary local or relative paths are not product images", () => {
  const copy = shopifyMediaPath(`${files}files/Chairs_1.png`)!;
  const film = shopifyMediaPath("https://cdn.shopify.com/videos/c/vp/abc/abc.mp4")!;
  assert.equal(contentImageSchema.safeParse(copy).success, true);
  assert.equal(contentImageSchema.safeParse(film).success, true);
  assert.equal(approvedCatalogueImage(copy), true);
  const product = { id: "p", handle: "chair", title: "Chair", description: "", category: "chairs", images: [copy], variants: [], published: true, source: "test", sourceUpdatedAt: new Date().toISOString() };
  const images = (value: string[]) => productSchema.shape.images.safeParse(value).success;
  assert.equal(images(product.images), true);
  for (const bad of ["/media/uploads/x.webp", "/media/shopify/../x.png", "media/shopify/" + "a".repeat(32) + ".png", "javascript:alert(1)"]) assert.equal(images([bad]), false, bad);
});

test("catalogue cards and their option thumbnails carry the store's copies, as the API names them once copied", () => {
  const copy = shopifyMediaPath(`${files}files/Chairs_1.png`)!, side = shopifyMediaPath(`${files}files/Chairs_3.png`)!;
  const card = toProductCard({ id: "p", handle: "chair", title: "Chair", images: [copy], category: "chairs", variants: [
    { pricePaise: 100_00, compareAtPaise: null, title: "Walnut", images: [copy], slug: "walnut" },
    { pricePaise: 100_00, compareAtPaise: null, title: "Teak", images: [side], slug: "teak" },
  ] });
  assert.equal(card.image, copy);
  assert.deepEqual(card.optionThumbs.map(thumb => thumb.image), [copy, side]);
  assert.equal(catalogueCardsResponseSchema.safeParse({ products: [card], published: true }).success, true);
  assert.equal(productCardSchema.safeParse({ ...card, image: "/media/elsewhere/x.png" }).success, false);
});
