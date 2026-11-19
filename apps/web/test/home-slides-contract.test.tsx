import assert from "node:assert/strict";
import { test } from "node:test";
import { homeDetailsSchema } from "@shopmaple/contracts";
import { defaultHomeDetails } from "../lib/home-details-defaults";

// A film on a Maple media address; Shopify's are no longer accepted (owner, 11 Nov 2026).
const film = "/media/films/workshop.mp4";
const still = "/media/uploads/" + "a".repeat(64) + ".webp";
const heroSlide = { kind: "image", src: still, alt: "A sofa", headline: "Made to order", intro: "In our Delhi workshop." };
const videoSlide = { kind: "video", src: film, poster: still, alt: "The workshop", headline: "Hand finished", intro: "Every piece." };
const nimbusSlide = {
  heading: "The Terra Collection", tagline: "Earthy and warm", features: ["Warm", "Grounded", "Natural", "Calm"], cta: "Shop Terra",
  href: "/collections/terra", image: still, mobileImage: still, alt: "Terra sofa in a living room",
};
const withHero = (slides: unknown) => ({ ...defaultHomeDetails, hero: { ...defaultHomeDetails.hero, slides } });
const withNimbus = (slides: unknown) => ({ ...defaultHomeDetails, nimbus: { ...defaultHomeDetails.nimbus, slides } });
const ok = (value: unknown) => homeDetailsSchema.safeParse(value).success;

test("documents published before slides existed still parse and keep no slides", () => {
  // The defaults now follow Nimbus with Terra; an older document has no extra collections at all.
  const older = structuredClone(defaultHomeDetails);
  delete older.nimbus.slides;
  const parsed = homeDetailsSchema.safeParse(older);
  assert.equal(parsed.success, true);
  if (parsed.success) { assert.equal(parsed.data.hero.slides, undefined); assert.equal(parsed.data.nimbus.slides, undefined); }
});

// Owner, 19 Nov 2026: staff choose how many slides (up to eight), and every word on a slide is optional.
test("hero slides accept one to eight image or video slides", () => {
  assert.equal(ok(withHero([videoSlide])), true);
  assert.equal(ok(withHero([heroSlide, videoSlide, heroSlide])), true);
  assert.equal(ok(withHero(Array(8).fill(heroSlide))), true);
  assert.equal(ok(withHero(Array(9).fill(heroSlide))), false, "at most eight");
  assert.equal(ok(withHero([])), false, "an empty list is no slider; omit the field instead");
  const { poster: _poster, ...noPoster } = videoSlide;
  assert.equal(ok(withHero([noPoster])), true, "a video's cover is optional (the admin makes one from the film)");
  assert.equal(ok(withHero([{ kind: "image" }])), true, "a picture slide without a picture or words shows Maple's photo for its place");
});

test("hero slides reject a video without its film, unapproved media hosts and unknown fields", () => {
  const { src: _src, ...noFilm } = videoSlide;
  assert.equal(ok(withHero([noFilm])), false, "a video needs its film");
  assert.equal(ok(withHero([{ ...heroSlide, src: "https://example.com/a.jpg" }])), false);
  assert.equal(ok(withHero([{ ...videoSlide, src: "http://shop.maplefurnishers.com/cdn/shop/a.mp4" }])), false);
  assert.equal(ok(withHero([{ ...videoSlide, src: "https://shop.maplefurnishers.com/cdn/shop/videos/c/vp/abc/abc.mp4?v=0" }])), false, "a film on Shopify");
  assert.equal(ok(withHero([{ ...videoSlide, poster: "https://cdn.shopify.com/s/files/1/0691/8651/9229/files/p.jpg" }])), false, "a poster on Shopify");
  assert.equal(ok(withHero([{ ...videoSlide, src: "/media/shopify/0123456789abcdef0123456789abcdef.mp4" }])), false, "an older copy path");
  assert.equal(ok(withHero([{ ...videoSlide, poster: "https://evil.example/p.jpg" }])), false);
  assert.equal(ok(withHero([{ ...heroSlide, kind: "audio" }])), false);
  assert.equal(ok(withHero([{ ...heroSlide, extra: "x" }])), false);
  for (const field of ["alt", "eyebrow", "headline", "intro"]) assert.equal(ok(withHero([{ ...heroSlide, [field]: "  " }])), false, `${field} is absent or has words`);
  assert.equal(ok(withHero([{ ...heroSlide, eyebrow: "e".repeat(61) }])), false);
  assert.equal(ok(withHero([{ ...heroSlide, headline: "h".repeat(121) }])), false);
  assert.equal(ok(withHero([{ ...heroSlide, intro: "i".repeat(301) }])), false);
  assert.equal(ok(withHero([{ ...heroSlide, alt: "a".repeat(201) }])), false);
});

test("nimbus slides accept up to five extra collections with exactly four features and a store link", () => {
  assert.equal(ok(withNimbus([nimbusSlide])), true);
  assert.equal(ok(withNimbus([nimbusSlide, { ...nimbusSlide, mobileImage: undefined }])), true, "mobile artwork is optional");
  assert.equal(ok(withNimbus([])), true, "no extra slides is the single Nimbus card");
  assert.equal(ok(withNimbus(Array(5).fill(nimbusSlide))), true);
  assert.equal(ok(withNimbus(Array(6).fill(nimbusSlide))), false, "at most five extra slides");
  assert.equal(ok(withNimbus([{ ...nimbusSlide, features: ["One", "Two", "Three"] }])), false);
  assert.equal(ok(withNimbus([{ ...nimbusSlide, href: "https://example.com/" }])), false);
  assert.equal(ok(withNimbus([{ ...nimbusSlide, href: "/collections/Terra Sofa" }])), false);
  assert.equal(ok(withNimbus([{ ...nimbusSlide, image: "https://example.com/a.jpg" }])), false);
  assert.equal(ok(withNimbus([{ ...nimbusSlide, mobileImage: "javascript:alert(1)" }])), false);
  assert.equal(ok(withNimbus([{ ...nimbusSlide, alt: "" }])), false);
  assert.equal(ok(withNimbus([{ ...nimbusSlide, extra: 1 }])), false);
});
