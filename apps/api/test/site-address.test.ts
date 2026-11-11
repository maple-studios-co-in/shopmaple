import assert from "node:assert/strict";
import test from "node:test";
import { ownSitePath, primarySiteUrl, siteOrigins } from "@shopmaple/contracts";
import { approvedCatalogueImage } from "../src/catalogue-images.js";
import { storeOrigins } from "../src/site.js";

test("the store's address is SITE_URL, then WEB_ORIGIN, then the local development address", () => {
  assert.equal(primarySiteUrl({ SITE_URL: "https://shop.maplefurnishers.com/", WEB_ORIGIN: "https://x.example" }), "https://shop.maplefurnishers.com");
  for (const bad of ["", "  ", "shop.maplefurnishers.com", "javascript:alert(1)", "ftp://x", "https://user:pass@x.example"])
    assert.equal(primarySiteUrl({ SITE_URL: bad, WEB_ORIGIN: "https://web.example" }), "https://web.example", JSON.stringify(bad));
  assert.equal(primarySiteUrl({}), "http://localhost:3000");
});

test("during the move both hostnames are the store's own: links to either become paths, others stay links", () => {
  const origins = siteOrigins({ SITE_URL: "https://shop.maplefurnishers.com", SITE_ALIASES: "https://store.maplefurnishers.com, not a url", WEB_ORIGIN: "https://shop.maplefurnishers.com" });
  assert.deepEqual(origins, ["https://shop.maplefurnishers.com", "https://store.maplefurnishers.com"]);
  assert.equal(ownSitePath("https://store.maplefurnishers.com/collections/chairs?x=1#top", origins), "/collections/chairs?x=1#top");
  assert.equal(ownSitePath("https://shop.maplefurnishers.com/pages/contact", origins), "/pages/contact");
  for (const other of ["https://maplefurnishers.com/x", "https://evil.example/collections", "https://shop.maplefurnishers.com//evil.example/x", "mailto:a@b.c", "/relative"])
    assert.equal(ownSitePath(other, origins), null, other);
});

test("Keeri photos on either of the store's addresses are approved catalogue images, and only on those", () => {
  const before = { ...process.env };
  try {
    Object.assign(process.env, { SITE_URL: "https://shop.maplefurnishers.com", SITE_ALIASES: "https://store.maplefurnishers.com", WEB_ORIGIN: "https://shop.maplefurnishers.com" });
    assert.deepEqual(storeOrigins(), ["https://shop.maplefurnishers.com", "https://store.maplefurnishers.com"]);
    assert.equal(approvedCatalogueImage("https://shop.maplefurnishers.com/media/keeri/photo1.webp"), true);
    assert.equal(approvedCatalogueImage("https://store.maplefurnishers.com/media/keeri/photo1.webp"), true);
    assert.equal(approvedCatalogueImage("https://other.example/media/keeri/photo1.webp"), false);
    process.env.SITE_ALIASES = "";
    assert.equal(approvedCatalogueImage("https://store.maplefurnishers.com/media/keeri/photo1.webp"), false);
  } finally {
    for (const key of ["SITE_URL", "SITE_ALIASES", "WEB_ORIGIN"]) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
  }
});

test("Shopify's files are never catalogue images, only Keeri photos on the store's own address", () => {
  const before = { ...process.env };
  try {
    Object.assign(process.env, { SITE_URL: "https://store.maplefurnishers.com", SITE_ALIASES: "https://shop.maplefurnishers.com", WEB_ORIGIN: "https://store.maplefurnishers.com" });
    assert.equal(approvedCatalogueImage("https://store.maplefurnishers.com/media/keeri/photo1.webp"), true);
    for (const shopify of [
      "https://cdn.shopify.com/s/files/1/0691/8651/9229/files/chair.jpg",
      "https://shop.maplefurnishers.com/cdn/shop/files/chair.jpg",
      "https://maple.myshopify.com/cdn/shop/files/chair.jpg",
      "/media/shopify/0123456789abcdef0123456789abcdef.jpg",
      "https://store.maplefurnishers.com/media/shopify/0123456789abcdef0123456789abcdef.jpg",
      "https://store.maplefurnishers.com/media/keeri/photo1.webp?v=1",
    ]) assert.equal(approvedCatalogueImage(shopify), false, shopify);
  } finally {
    for (const key of ["SITE_URL", "SITE_ALIASES", "WEB_ORIGIN"]) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
  }
});
