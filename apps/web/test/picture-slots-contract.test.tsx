import assert from "node:assert/strict";
import test from "node:test";
import {
  articleHandles, blogCoverKeys, categoryPageSectionKeys, categoryPageSlugs, categoryTileKeys, categoryValueKeys, landingBannerKeys,
  landingTileKeys, landingValueKeys, pictureSlotKeys, storefrontContentSchema, templateMediaDecorativeKeys, templateMediaKeys,
  templateMediaResponsiveKeys,
} from "@shopmaple/contracts";
import categories from "../data/landing-categories.json";
import blogIndex from "../data/blog-index.json";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { defaultMenuArtwork, resolveMenuArtwork } from "../lib/menu-artwork";
import { pictureSlotGroups } from "../lib/picture-slot-defaults";
import { resolveArtwork, resolveTemplateMedia, templateMediaSlots } from "../lib/template-media-defaults";

// The owner, 12 Nov 2026: staff replace every storefront picture from the admin. The pictures fixed in code became
// template artwork slots, each keeping exactly what the store showed until staff upload their own.
const upload = (letter: string) => `/media/uploads/${letter.repeat(64)}.webp`;
const parse = (templateMedia: unknown) => storefrontContentSchema.safeParse({ ...defaultStorefrontContent, templateMedia });

test("every new picture is a template media slot with a staff label, group and help, exactly once", () => {
  assert.equal(new Set(pictureSlotKeys).size, pictureSlotKeys.length);
  for (const key of pictureSlotKeys) {
    assert.ok((templateMediaKeys as readonly string[]).includes(key), `${key} is a template media key`);
    const slots = templateMediaSlots.filter(slot => slot.key === key);
    assert.equal(slots.length, 1, `${key} has one slot`);
    const [slot] = slots;
    assert.ok(slot!.label.trim() && slot!.help?.trim(), `${key} tells staff what it is and where it appears`);
    assert.ok((pictureSlotGroups as readonly string[]).includes(slot!.group) || slot!.group === "Homepage", `${key} is in an Artwork group`);
    assert.match(slot!.help!, /\d+ × \d+ px/, `${key} suggests a size`);
  }
  // Labels are unique within a group, so the placement list never shows two alike.
  for (const group of [...pictureSlotGroups, "Homepage"]) {
    const labels = templateMediaSlots.filter(slot => slot.group === group).map(slot => slot.label);
    assert.equal(new Set(labels).size, labels.length, group);
  }
});

test("the category pages' slots follow their sections, circles and values; the blog's follow its articles", () => {
  const banners = categoryPageSlugs.flatMap(slug => categories[slug].sections.flatMap((section, index) => {
    const key = categoryPageSectionKeys[slug][index]!;
    return section.type === "banner" && key !== "hero" && key !== "sale" ? [`${slug}-${key}`] : [];
  }));
  assert.deepEqual(banners, [...landingBannerKeys]);
  assert.deepEqual(categoryPageSlugs.flatMap(slug => categoryTileKeys[slug].map(key => `${slug}-tile-${key}`)), [...landingTileKeys]);
  assert.deepEqual(categoryPageSlugs.flatMap(slug => categoryValueKeys[slug].map(key => `${slug}-value-${key}`)), [...landingValueKeys]);
  assert.deepEqual(Object.keys(blogCoverKeys).sort(), [...articleHandles].sort(), "one cover slot per imported article");
});

test("each slot's original is what the store showed before (12 Nov 2026)", () => {
  // The mega menu's pictures, as navigation.tsx drew them.
  assert.deepEqual(defaultMenuArtwork, {
    features: {
      living: { image: "/media/home/category-sofas.webp", alt: "A living room with a cream sofa, a wooden coffee table and plants" },
      bedroom: { image: "/media/home/category-beds.webp", alt: "A bedroom with an upholstered green bed and wooden bedside tables" },
    },
    discovery: { new: "/media/home/hero-sofas.webp", bestsellers: "/media/home/editorial-flip-runo.webp", look: "/media/home/strip-always-together.webp" },
  });
  // The banners and circles showed a Keeri product's photo (data/landing-categories.json); the values, no icon.
  const sofas = categories.sofas.sections;
  assert.equal(templateMediaSlots.find(slot => slot.key === "sofas-outdoor-banner")?.product, sofas[4]!.product);
  assert.equal(templateMediaSlots.find(slot => slot.key === "sofas-tile-wooden-sofas")?.product, "atrio-sofa");
  for (const key of [...landingBannerKeys, ...landingTileKeys, ...landingValueKeys]) assert.equal(resolveTemplateMedia(key).image, "", key);
  for (const key of landingValueKeys) assert.equal(resolveArtwork(key, undefined, new Map([["casaba", "/media/x.webp"]])), null, `${key} shows nothing`);
  // The blog's covers are each imported article's own picture.
  const index = blogIndex["recent-stories"] as Record<string, { image: { src: string; alt: string } }>;
  for (const [handle, key] of Object.entries(blogCoverKeys)) assert.deepEqual(resolveTemplateMedia(key), { key, image: index[handle]!.image.src, alt: index[handle]!.image.alt });
  assert.deepEqual(
    ["blog-bestsellers-promo", "blog-collections-photo", "product-banner", "home-editorial-flip-1", "home-editorial-flip-4", "policy-privacy-policy", "policy-return-exchange", "auth-login", "auth-sign-up"]
      .map(key => resolveTemplateMedia(key as never).image),
    ["/media/home/editorial-left.webp", "/media/home/editorial-right.webp", "/product-page/banner.jpg", "/media/home/editorial-flip-runo.webp",
      "/media/home/editorial-flip-seno.webp", "/media/policies/privacy-policy.jpg", "/media/policies/return-exchange.jpg",
      "/media/account/login-editorial.webp", "/media/account/sign-up-editorial.webp"],
  );
});

test("uploads validate as artwork: banners need both crops, decorative pictures may go undescribed, others must be described", () => {
  for (const key of landingBannerKeys) {
    assert.ok((templateMediaResponsiveKeys as readonly string[]).includes(key));
    assert.equal(parse([{ key, image: upload("a"), alt: "A sofa in a sunlit room" }]).success, false, `${key} needs a mobile image`);
    assert.equal(parse([{ key, image: upload("a"), mobileImage: upload("b"), alt: "A sofa in a sunlit room" }]).success, true, key);
  }
  for (const key of ["menu-discovery-new", "sofas-value-grain", "blog-collections-photo", "product-banner", "home-editorial-flip-2", "policy-refund-policy", "auth-login"]) {
    assert.ok((templateMediaDecorativeKeys as readonly string[]).includes(key), key);
    assert.equal(parse([{ key, image: upload("c"), alt: "" }]).success, true, key);
  }
  for (const key of ["menu-living-feature", "sofas-tile-recliners", "blog-cover-best-wood"]) {
    assert.equal(parse([{ key, image: upload("d"), alt: "" }]).success, false, `${key} needs a description`);
    assert.equal(parse([{ key, image: upload("d"), alt: "A walnut chair" }]).success, true, key);
  }
  assert.equal(parse([{ key: "menu-living-feature", image: "https://cdn.shopify.com/s/files/a.jpg", alt: "Room" }]).success, false, "Shopify files stay refused");
  // Every placement at once still fits the content document.
  assert.equal(parse(pictureSlotKeys.map(key => ({ key, image: upload("e"), alt: "Maple room", ...((landingBannerKeys as readonly string[]).includes(key) ? { mobileImage: upload("f") } : {}) }))).success, true);
});

test("the menu resolves staff's published pictures and keeps the originals elsewhere", () => {
  const artwork = resolveMenuArtwork([
    { key: "menu-bedroom-feature", image: upload("a"), alt: "Our bedroom" },
    { key: "menu-discovery-look", image: upload("b"), alt: "" },
  ]);
  assert.deepEqual(artwork.features.bedroom, { image: upload("a"), alt: "Our bedroom" });
  assert.deepEqual(artwork.features.living, defaultMenuArtwork.features.living);
  assert.deepEqual(artwork.discovery, { ...defaultMenuArtwork.discovery, look: upload("b") });
});
