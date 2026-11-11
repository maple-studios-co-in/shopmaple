import assert from "node:assert/strict";
import { test } from "node:test";
import { collectionLandingContentSchema, storefrontContentSchema, type CollectionLandingContent } from "@shopmaple/contracts";
import { defaultStorefrontContent } from "../lib/content-defaults";

// One lean schema for the collection template's words (Figma 311:548 Nimbus, 311:921 Terra; owner, 10 Nov 2026). Nimbus
// keeps its `nimbusPage` key: an older revision of the original template still validates beside the redesign's copy.
const line = (words: string) => words;
const nimbusCopy = (): CollectionLandingContent => ({
  title: "The Nimbus Collection",
  sections: ["hero", "room-nav", "philosophy", "origin", "feeling", "material", "browse", "pieces", "consultation", "promise"].map(key => ({ key: key as CollectionLandingContent["sections"][number]["key"], enabled: true })),
  hero: { eyebrow: "Maple collections / Nimbus", heading: "A softer way\nto come home.", body: "Cloud-like comfort.", cta: "Discover Nimbus", film: "Watch collection film" },
  roomNav: ["Living", "Dining", "Bedroom"].map(label => ({ label })),
  philosophy: { eyebrow: "The Nimbus point of view", heading: "Comfort is\nthe starting point.", body: line("Soft forms.") },
  origin: { eyebrow: "Origin / Nimbus", heading: "It began with a cloud.", body: "Inspired by clouds." },
  feeling: { eyebrow: "How it feels", heading: "Soft. Airy. Weightless.", items: ["One", "Two", "Three"].map(title => ({ title, body: "A line." })) },
  material: { eyebrow: "The details", heading: "Softness.", body: "Choose your fabric.", notes: ["A", "B", "C"].map(label => ({ label })), cta: "Explore customization" },
  browse: { eyebrow: "Find your piece", heading: "Explore by collection.", link: "Discover the collection", items: ["Sofas", "Chairs", "Tables", "Beds"].map(title => ({ title })) },
  pieces: { eyebrow: "The Nimbus edit", heading: "Pieces.", link: "View piece", cta: "View the Nimbus collection", items: Array.from({ length: 8 }, (_, index) => ({ line: `Room / Piece ${index + 1}` })) },
  consultation: { eyebrow: "Make it yours", heading: "Your home.", body: "Tell us.", cta: "Start a conversation", note: "Custom sizes · Fabrics · Finishes" },
  promise: ["Made around you", "Crafted in Delhi", "Delivery across India"].map(label => ({ label })),
});
const terraCopy = (): CollectionLandingContent => {
  const page = nimbusCopy();
  page.sections = [{ key: "rooms", enabled: true }, ...page.sections];
  delete page.hero.film;
  delete page.pieces.cta;
  page.rooms = {
    eyebrow: "Explore the collection", heading: "Three spaces. One grounded spirit.",
    items: ["The lobby", "The bedroom", "The terrace"].map(label => ({ label, heading: "A room", body: "A line.", tags: "Walnut / Travertine", cta: "Enquire about this setting" })),
  };
  page.pieces = { ...page.pieces, lead: "Made to your brief.", link: "Discuss this piece", items: ["Sofa", "Chair", "Bed", "Terrace chair"].map(title => ({ title, line: "Lobby / Seating" })) };
  return page;
};
const withNimbus = (nimbusPage: unknown) => storefrontContentSchema.safeParse({ ...defaultStorefrontContent, nimbusPage });

test("the shared schema takes both pages' words: Nimbus's film and products, Terra's settings and concepts", () => {
  assert.equal(collectionLandingContentSchema.safeParse(nimbusCopy()).success, true);
  assert.equal(collectionLandingContentSchema.safeParse(terraCopy()).success, true);
  assert.equal(withNimbus(nimbusCopy()).success, true, "Nimbus saves the redesign's copy under its existing key");
  assert.equal(storefrontContentSchema.safeParse(defaultStorefrontContent).success, true, "the starting draft is valid");
});

test("the shared schema keeps a page's fixed shape and refuses links, media and commerce fields", () => {
  const page = nimbusCopy();
  const invalid: unknown[] = [
    { ...page, html: "<script>alert(1)</script>" },
    { ...page, hero: { ...page.hero, href: "javascript:alert(1)" } },
    { ...page, hero: { ...page.hero, image: "/media/uploads/unreviewed.webp" } },
    { ...page, origin: { ...page.origin, body: "bad\u0000text" } },
    { ...page, philosophy: { ...page.philosophy, heading: " " } },
    { ...page, title: "x".repeat(161) },
    { ...page, philosophy: { ...page.philosophy, body: "x".repeat(2001) } },
    { ...page, browse: { ...page.browse, eyebrow: "x".repeat(301) } },
    { ...page, roomNav: page.roomNav.slice(1) },
    { ...page, feeling: { ...page.feeling, items: page.feeling.items.slice(1) } },
    { ...page, browse: { ...page.browse, items: [...page.browse.items, { title: "Fifth" }] } },
    { ...page, material: { ...page.material, notes: [{ label: "A", icon: "cloud" }, ...page.material.notes.slice(1)] } },
    { ...page, pieces: { ...page.pieces, items: [] } },
    { ...page, pieces: { ...page.pieces, items: Array.from({ length: 9 }, () => ({ line: "Room / Piece" })) } },
    { ...page, pieces: { ...page.pieces, items: [{ line: "Room / Piece", handle: "free-sofa", pricePaise: 1 }] } },
    { ...page, promise: [...page.promise, { label: "36-Month Warranty" }] },
    { ...page, sections: [...page.sections, page.sections[0]] },
    { ...page, sections: [{ key: "checkout", enabled: true }, ...page.sections.slice(1)] },
    { ...page, sections: [] },
  ];
  for (const value of invalid) {
    assert.equal(collectionLandingContentSchema.safeParse(value).success, false, JSON.stringify(value).slice(0, 120));
    assert.equal(withNimbus(value).success, false);
  }
  for (const [value, accepted] of [["x".repeat(160), true], ["x".repeat(161), false], ["", false], ["\t\n ", false], ["Line one\nline two", true], ["Literal <b>text</b>", true]] as const)
    assert.equal(collectionLandingContentSchema.safeParse({ ...page, hero: { ...page.hero, heading: value } }).success, accepted, JSON.stringify(value));
});

test("a blank field in Nimbus's redesign copy names the field, not just the page", () => {
  const page = nimbusCopy();
  page.hero.heading = "";
  const result = withNimbus(page);
  assert.equal(result.success, false);
  if (!result.success) assert.deepEqual(result.error.issues[0]?.path, ["nimbusPage", "hero", "heading"]);
});

test("an older Nimbus revision of the original template still validates, and a mixture of the two does not", () => {
  const legacy = {
    title: "Nimbus for your home",
    sections: ["project", "hero", "intro", "rooms-grid", "origin", "principles", "rooms-slideshow", "series", "promises"].map(key => ({ key, enabled: key !== "hero" })),
    intro: { heading: "Cloud comfort", body: "Furniture for everyday living." },
    roomTiles: ["dining", "bedroom", "living"].map(key => ({ key, title: `Our ${key}` })),
    origin: { eyebrow: "Our inspiration", heading: "Designed for comfort", body: "Made for life." },
    principles: { heading: "Our principles", items: ["spaces", "comfort", "silhouettes", "luxury"].map(key => ({ key, title: `Our ${key}`, body: "Careful design." })) },
    roomSlides: ["dining", "living", "bedroom"].map(key => ({ key, label: `Explore ${key}` })),
    series: { eyebrow: "Everyday spaces", heading: "Explore Nimbus" },
    project: { heading: "Your home", body: "Tell us about your project." },
    promises: ["warranty", "custom", "delivery", "craft"].map(key => ({ key, title: `Our ${key}` })),
  };
  assert.equal(withNimbus(legacy).success, true);
  assert.equal(withNimbus({ ...nimbusCopy(), intro: legacy.intro }).success, false);
  assert.equal(withNimbus({ ...legacy, hero: nimbusCopy().hero }).success, false);
  assert.equal(withNimbus({ ...legacy, sections: nimbusCopy().sections }).success, false);
});
