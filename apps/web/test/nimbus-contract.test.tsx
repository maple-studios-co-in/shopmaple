import assert from "node:assert/strict";
import test from "node:test";
import { storefrontContentSchema } from "@shopmaple/contracts";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { defaultNimbusPage, resolveNimbusPageContent } from "../lib/nimbus-content-defaults";

const nimbusEdit = () => ({
  title: "Nimbus for your home",
  sections: ["project", "hero", "intro", "rooms-grid", "origin", "principles", "rooms-slideshow", "series", "promises"].map(key => ({ key, enabled: key !== "hero" })),
  intro: { heading: "Cloud comfort", body: "Furniture for everyday living." },
  roomTiles: ["dining", "bedroom", "living"].map(key => ({ key, title: `Our ${key}` })),
  origin: { eyebrow: "Our inspiration", heading: "Designed for comfort", body: "<script>plain text only</script>\nMade for life." },
  principles: { heading: "Our principles", items: ["spaces", "comfort", "silhouettes", "luxury"].map(key => ({ key, title: `Our ${key}`, body: "Careful design." })) },
  roomSlides: ["dining", "living", "bedroom"].map(key => ({ key, label: `Explore ${key}` })),
  series: { eyebrow: "Everyday spaces", heading: "Explore Nimbus" },
  project: { heading: "Your home", body: "Tell us about your project." },
  promises: ["warranty", "custom", "delivery", "craft"].map(key => ({ key, title: `Our ${key}` })),
});

test("legacy storefront content retains the existing page route reservation without a Nimbus override", () => {
  const legacy = { ...defaultStorefrontContent } as Record<string, unknown>;
  delete legacy.nimbusPage;
  assert.equal(storefrontContentSchema.safeParse(legacy).success, true);
  assert.equal(storefrontContentSchema.safeParse({ ...legacy, pages: [{ slug: "nimbus-collection", title: "Override", description: "", body: "", banner: null }] }).success, false);
});

test("Nimbus content accepts complete reordered fixed-key copy as a typed storefront draft", () => {
  const parsed = storefrontContentSchema.safeParse({ ...defaultStorefrontContent, nimbusPage: nimbusEdit() });
  assert.equal(parsed.success, true, "valid Nimbus copy must be accepted by the storefront contract");
  if (parsed.success) assert.deepEqual(parsed.data.nimbusPage, nimbusEdit());
});

test("Nimbus rejects missing, duplicate and unknown identities in every fixed-key list", () => {
  const page = nimbusEdit();
  const lists = ["sections", "roomTiles", "roomSlides", "promises"] as const;
  for (const key of lists) {
    const items = page[key];
    for (const invalid of [items.slice(1), [...items, items[0]], [...items.slice(1), items[1]], [{ ...items[0], key: "checkout" }, ...items.slice(1)]]) {
      assert.equal(storefrontContentSchema.safeParse({ ...defaultStorefrontContent, nimbusPage: { ...page, [key]: invalid } }).success, false, key);
    }
  }
  const items = page.principles.items;
  for (const invalid of [items.slice(1), [...items, items[0]], [...items.slice(1), items[1]], [{ ...items[0], key: "checkout" }, ...items.slice(1)]]) {
    assert.equal(storefrontContentSchema.safeParse({ ...defaultStorefrontContent, nimbusPage: { ...page, principles: { ...page.principles, items: invalid } } }).success, false);
  }
});

test("Nimbus bounds all text and refuses executable, route, media and commerce fields", () => {
  const page = nimbusEdit();
  const invalid = [
    { ...page, title: " " }, { ...page, title: "x".repeat(161) }, { ...page, title: "bad\u0000text" }, { ...page, title: "bad\u007ftext" },
    { ...page, intro: { ...page.intro, body: "x".repeat(2001) } },
    { ...page, origin: { ...page.origin, body: "x".repeat(8001) } },
    { ...page, series: { ...page.series, eyebrow: "x".repeat(301) } },
    { ...page, project: { ...page.project, body: "\t\n " } },
    { ...page, html: "<script>alert(1)</script>" }, { ...page, script: "alert(1)" },
    { ...page, image: "/media/uploads/unreviewed.webp" }, { ...page, href: "javascript:alert(1)" },
    { ...page, slug: "checkout" }, { ...page, pricePaise: 1 }, { ...page, stock: 999 }, { ...page, checkoutEnabled: true },
    { ...page, intro: { ...page.intro, html: "<iframe/>" } },
    { ...page, roomTiles: [{ ...page.roomTiles[0], href: "https://evil.invalid" }, ...page.roomTiles.slice(1)] },
    { ...page, roomSlides: [{ ...page.roomSlides[0], image: "/media/test.webp" }, ...page.roomSlides.slice(1)] },
    { ...page, principles: { ...page.principles, items: [{ ...page.principles.items[0], pricePaise: 1 }, ...page.principles.items.slice(1)] } },
    { ...page, promises: [{ ...page.promises[0], stock: 999 }, ...page.promises.slice(1)] },
    { ...page, sections: [{ ...page.sections[0], enabled: "false" }, ...page.sections.slice(1)] },
  ];
  for (const nimbusPage of invalid) assert.equal(storefrontContentSchema.safeParse({ ...defaultStorefrontContent, nimbusPage }).success, false);
});

test("Nimbus starting draft preserves original Shopify copy and the source origin paragraph break", () => {
  const page = defaultStorefrontContent.nimbusPage;
  assert.ok(page, "the explicit starting draft must include original Nimbus content");
  assert.equal(page.title, "The Nimbus Collection");
  assert.deepEqual(page.sections.map(item => item.key), ["hero", "intro", "rooms-grid", "origin", "principles", "rooms-slideshow", "series", "project", "promises"]);
  assert.ok(page.sections.every(item => item.enabled));
  assert.deepEqual(page.intro, { heading: "Introducing nimbus", body: "We created an atmosphere where your home breathe in shades of clouds" });
  assert.deepEqual(page.roomTiles.map(item => item.title), ["Bedroom", "Living Room", "Dining Room"]);
  assert.equal(page.origin.eyebrow, "Origin & Philosophy");
  assert.equal(page.origin.heading, "Nimbus");
  assert.match(page.origin.body, /inside of a cloud\.\n\nNimbus was shaped/);
  assert.equal(page.principles.heading, "THE NIMBUS PRINCIPLES");
  assert.deepEqual(page.principles.items.map(item => [item.title, item.body]), [
    ["Cloud Like Comfort", "Where nature begins the story — raw, real, and rooted in beauty."],
    ["Soft Silhouettes", "Precision that defines perfection. Every line, intentional."],
    ["Airy Luxury", "Softness you can feel before you even touch it."],
    ["Modern Spaces", "The quiet glow of craftsmanship perfected."],
  ]);
  assert.deepEqual(page.roomSlides.map(item => item.label), ["Living room", "Bedroom", "Dining room"]);
  assert.deepEqual(page.series, { eyebrow: "Inspired by floating forms and quiet modern living.", heading: "Nimbus Series" });
  assert.deepEqual(page.project, { heading: "If the project sounds good", body: "Whether you have a question about our products, custom orders, or collaborations — our team is here to help." });
  assert.deepEqual(page.promises.map(item => item.title), ["Fully Customizable", "Delivery Across India", "In-House Crafted in Delhi", "36-Month Warranty"]);
  assert.equal(storefrontContentSchema.safeParse(defaultStorefrontContent).success, true);
});

test("Nimbus text limits apply at every nested copy field without rewriting literal text", () => {
  const fields: Array<{ path: Array<string | number>; max: number }> = [
    { path: ["title"], max: 160 },
    { path: ["intro", "heading"], max: 160 }, { path: ["intro", "body"], max: 2000 },
    { path: ["roomTiles", 0, "title"], max: 160 },
    { path: ["origin", "eyebrow"], max: 160 }, { path: ["origin", "heading"], max: 160 }, { path: ["origin", "body"], max: 8000 },
    { path: ["principles", "heading"], max: 160 }, { path: ["principles", "items", 0, "title"], max: 160 }, { path: ["principles", "items", 0, "body"], max: 2000 },
    { path: ["roomSlides", 0, "label"], max: 160 },
    { path: ["series", "eyebrow"], max: 300 }, { path: ["series", "heading"], max: 160 },
    { path: ["project", "heading"], max: 160 }, { path: ["project", "body"], max: 2000 },
    { path: ["promises", 0, "title"], max: 160 },
  ];
  for (const { path, max } of fields) {
    for (const [value, accepted] of [["x".repeat(max), true], ["x".repeat(max + 1), false], ["", false], ["\t\r\n ", false], ["bad\u000btext", false], ["Literal <b>text</b>\t\r\n", true]] as const) {
      const page = nimbusEdit();
      let target: unknown = page;
      for (const key of path.slice(0, -1)) target = (target as Record<string | number, unknown>)[key];
      (target as Record<string | number, unknown>)[path.at(-1)!] = value;
      assert.equal(storefrontContentSchema.safeParse({ ...defaultStorefrontContent, nimbusPage: page }).success, accepted, `${path.join(".")} / length ${value.length}`);
    }
  }
});

test("Nimbus fallback and edited resolutions are isolated copies without mutating later drafts", () => {
  const fallback = resolveNimbusPageContent();
  fallback.intro.heading = "Unpublished temporary edit";
  fallback.sections[0]!.enabled = false;
  fallback.principles.items[0]!.title = "Temporary principle";
  assert.equal(resolveNimbusPageContent().intro.heading, "Introducing nimbus");
  assert.equal(defaultNimbusPage.sections[0]!.enabled, true);
  assert.equal(defaultNimbusPage.principles.items[0]!.title, "Cloud Like Comfort");
  const edited = storefrontContentSchema.parse({ ...defaultStorefrontContent, nimbusPage: nimbusEdit() }).nimbusPage!;
  const resolved = resolveNimbusPageContent(edited);
  resolved.roomTiles[0]!.title = "Temporary room";
  assert.equal(edited.roomTiles[0]!.title, "Our dining");
  assert.equal(resolved.title, "Nimbus for your home");
});

test("adding Nimbus preserves the shared 128 KiB document bound", () => {
  const result = storefrontContentSchema.safeParse({
    ...defaultStorefrontContent,
    pages: Array.from({ length: 17 }, (_, index) => ({ slug: `guide-${index}`, title: "Furniture guide", description: "Care", body: "x".repeat(8000), banner: null })),
  });
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.error.issues.some(issue => issue.message === "Content exceeds 128 KiB"));
});
