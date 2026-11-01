import assert from "node:assert/strict";
import { test } from "node:test";
import { homeDetailsSchema } from "@shopmaple/contracts";
import { defaultHomeDetails } from "../lib/home-details-defaults";

const film = "https://shop.maplefurnishers.com/cdn/shop/videos/c/vp/abc/abc.mp4?v=0";
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
  const parsed = homeDetailsSchema.safeParse(defaultHomeDetails);
  assert.equal(parsed.success, true);
  if (parsed.success) { assert.equal(parsed.data.hero.slides, undefined); assert.equal(parsed.data.nimbus.slides, undefined); }
});

test("hero slides accept one to six image or video slides with a poster for video", () => {
  assert.equal(ok(withHero([videoSlide])), true);
  assert.equal(ok(withHero([heroSlide, videoSlide, heroSlide])), true);
  assert.equal(ok(withHero(Array(6).fill(heroSlide))), true);
  assert.equal(ok(withHero(Array(7).fill(heroSlide))), false, "at most six");
  assert.equal(ok(withHero([])), false, "an empty list is no slider; omit the field instead");
});

test("hero slides reject a video without a poster, unapproved media hosts and unknown fields", () => {
  const { poster: _poster, ...noPoster } = videoSlide;
  assert.equal(ok(withHero([noPoster])), false, "a video needs a poster image");
  assert.equal(ok(withHero([{ ...heroSlide, src: "https://example.com/a.jpg" }])), false);
  assert.equal(ok(withHero([{ ...videoSlide, src: "http://shop.maplefurnishers.com/cdn/shop/a.mp4" }])), false);
  assert.equal(ok(withHero([{ ...videoSlide, poster: "https://evil.example/p.jpg" }])), false);
  assert.equal(ok(withHero([{ ...heroSlide, kind: "audio" }])), false);
  assert.equal(ok(withHero([{ ...heroSlide, extra: "x" }])), false);
  for (const field of ["alt", "headline", "intro"]) assert.equal(ok(withHero([{ ...heroSlide, [field]: "  " }])), false, `${field} must not be blank`);
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
