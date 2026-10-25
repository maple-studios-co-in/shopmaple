import assert from "node:assert/strict";
import { test } from "node:test";
import { storefrontContentSchema } from "@shopmaple/contracts";
import { defaultStorefrontContent } from "../lib/content-defaults";

const details = () => ({
  hero: { cta: "Explore furniture", tiles: [
    { key: "sofas", label: "Your sofa", priceLabel: "From ₹28,000" },
    { key: "chairs", label: "Your chair", priceLabel: "From ₹9,000" },
    { key: "tables", label: "Your table", priceLabel: "From ₹15,000" },
    { key: "beds", label: "Your bed", priceLabel: "From ₹60,000" },
  ] },
  difference: { eyebrow: "The craft", heading: "Made for home", cta: "Talk to us", promises: ["Size", "Fabric", "Finish", "Comfort"] },
  nimbus: { heading: "Cloud collection", tagline: "Relax at home", features: ["Soft", "Light", "Airy", "Modern"], cta: "View collection" },
  testimonial: { title: "A lovely experience", paragraphs: ["<script>alert('plain text')</script>", "Delivery went smoothly."], name: "Customer", attribution: " — Homeowner" },
  newsletter: { heading: "Ideas for home", body: "Updates from our workshop.\nMade for you.", signupHeading: "Stay in touch" },
  values: [
    { key: "quiet-luxury", title: "Subtle", body: "Room to relax." },
    { key: "real-living", title: "Everyday", body: "Ready for life." },
    { key: "ages-beautifully", title: "Enduring", body: "Made to last." },
    { key: "strength", title: "Solid", body: "Crafted carefully." },
  ],
  cities: { eyebrow: "Find us", heading: "Across India" },
  project: { heading: "Plan your space", introBefore: "We reply within ", responseTime: "two days", introAfter: " with ideas.", body: "Tell us about your room." },
});

test("legacy storefront revisions remain valid without home details", () => {
  const legacy = { ...defaultStorefrontContent };
  delete legacy.homeDetails;
  const parsed = storefrontContentSchema.safeParse(legacy);
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.homeDetails, undefined);
});

test("home details accept bounded plain text and preserve significant spacing", () => {
  const parsed = storefrontContentSchema.safeParse({ ...defaultStorefrontContent, homeDetails: details() });
  assert.equal(parsed.success, true, "valid homepage detail edits must pass the storefront contract");
  if (!parsed.success) return;
  assert.equal(parsed.data.homeDetails?.hero.tiles[0]?.priceLabel, "From ₹28,000");
  assert.equal(parsed.data.homeDetails?.project.introBefore, "We reply within ");
  assert.equal(parsed.data.homeDetails?.project.introAfter, " with ideas.");
  assert.equal(parsed.data.homeDetails?.testimonial.paragraphs[0], "<script>alert('plain text')</script>");
});

test("home details reject missing identities, blank or unbounded text and non-copy fields", () => {
  const value = details();
  const invalid = [
    null, {},
    { ...value, hero: { ...value.hero, tiles: value.hero.tiles.slice(0, 3) } },
    { ...value, hero: { ...value.hero, tiles: [...value.hero.tiles.slice(0, 3), value.hero.tiles[0]] } },
    { ...value, hero: { ...value.hero, tiles: [...value.hero.tiles.slice(0, 3), { ...value.hero.tiles[3], key: "storage" }] } },
    { ...value, values: value.values.slice(0, 3) },
    { ...value, values: [...value.values.slice(0, 3), value.values[0]] },
    { ...value, values: [...value.values.slice(0, 3), { ...value.values[3], key: "other" }] },
    { ...value, difference: { ...value.difference, promises: ["One"] } },
    { ...value, nimbus: { ...value.nimbus, features: ["One", "Two", "Three", "Four", "Five"] } },
    { ...value, testimonial: { ...value.testimonial, paragraphs: [] } },
    { ...value, testimonial: { ...value.testimonial, paragraphs: Array(7).fill("Too many") } },
    { ...value, testimonial: { ...value.testimonial, paragraphs: ["x".repeat(2001)] } },
    { ...value, cities: { ...value.cities, heading: "x".repeat(161) } },
    ...["", "   ", "bad\u0000text", "bad\u000btext", "bad\u007ftext"].map(cta => ({ ...value, hero: { ...value.hero, cta } })),
    { ...value, image: "/media/changed.webp" },
    { ...value, newsletter: { ...value.newsletter, html: "<script>run()</script>" } },
    { ...value, hero: { ...value.hero, href: "javascript:alert(1)" } },
    { ...value, hero: { ...value.hero, tiles: [{ ...value.hero.tiles[0], pricePaise: 1 }, ...value.hero.tiles.slice(1)] } },
    { ...value, project: { ...value.project, checkoutEnabled: true } },
  ];
  for (const homeDetails of invalid)
    assert.equal(storefrontContentSchema.safeParse({ ...defaultStorefrontContent, homeDetails }).success, false);
});

test("the complete content payload still enforces its 128 KiB bound", () => {
  const oversized = { ...defaultStorefrontContent, homeDetails: details(), pages: Array.from({ length: 20 }, (_, i) => ({
    slug: `large-page-${i}`, title: "Page", description: "Description", body: "x".repeat(8000), banner: null,
  })) };
  const result = storefrontContentSchema.safeParse(oversized);
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.error.issues.some(issue => issue.message === "Content exceeds 128 KiB"));
});

test("new drafts include original home details and resolving legacy revisions returns independent defaults", async () => {
  assert.ok(defaultStorefrontContent.homeDetails, "new drafts need the complete original homepage copy");
  const { resolveHomeDetails } = await import("../lib/home-details-defaults");
  const first = resolveHomeDetails();
  assert.equal(first.hero.tiles[0]?.priceLabel, "Starting from ₹25,000");
  assert.equal(first.testimonial.name, "Anjali Gupta");
  assert.equal(first.project.introBefore + first.project.responseTime + first.project.introAfter,
    "Describe your project to us and our team will come back within 24 hours with options, pricing, and a clear timeline.");
  first.hero.tiles[0]!.label = "Accidental mutation";
  first.testimonial.paragraphs.push("Accidental paragraph");
  const second = resolveHomeDetails();
  assert.equal(second.hero.tiles[0]?.label, "Sofas");
  assert.equal(second.testimonial.paragraphs.length, 4);
  assert.equal(defaultStorefrontContent.homeDetails.hero.tiles[0]?.label, "Sofas");
  const selected = storefrontContentSchema.parse({ ...defaultStorefrontContent, homeDetails: details() }).homeDetails!;
  const resolved = resolveHomeDetails(selected);
  assert.equal(resolved.hero.cta, "Explore furniture");
  resolved.hero.cta = "Changed locally";
  assert.equal(selected.hero.cta, "Explore furniture");
});
