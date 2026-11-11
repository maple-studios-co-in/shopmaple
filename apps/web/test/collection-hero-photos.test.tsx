import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { heroPhotos, heroPhotosFor } from "../lib/collection-hero-photos";
import { CollectionHero } from "../components/store/collection-hero";

// The owner asked for a sharp, well-fitting photo of the category's own pieces in every listing hero (4 Nov 2026).
const doc = (node: React.ReactElement) => new JSDOM(renderToStaticMarkup(node)).window.document;
const intro = { heading: "Made for slow evenings.", noun: "sofa" };

test("every kind of piece and the whole range has its own hero photo, wide enough and the store's own copy of the catalogue photo", () => {
  for (const key of ["all", "sofas", "chairs", "tables", "beds", "storage"]) {
    const [photo] = heroPhotosFor(key);
    assert.ok(photo, key);
    assert.match(photo!.image, /^\/media\/shopify\/[a-f0-9]{32}\.(?:png|webp|jpg)$/, key);
    assert.ok(photo!.width >= 1200, `${key} is at least 1200px wide`);
  }
  assert.deepEqual(heroPhotosFor("king-size-beds"), [], "a collection of its own keeps its first photo");
  assert.deepEqual(heroPhotosFor(null), []);
  assert.equal(new Set(Object.values(heroPhotos).map((photos) => photos[0]!.image)).size, 6, "no two listings share a photo");
});

test("a chosen photo is never drawn wider than its own pixels, and sits where its piece is", () => {
  const sofa = heroPhotosFor("sofas")[0]!;
  const page = doc(<CollectionHero title="Sofas" crumb="Sofas" intro={intro} cover={{ image: sofa.image, title: "Sora 5-seater sofa", handle: sofa.handle, pricePaise: 11682000, priceFrom: false, width: sofa.width, position: sofa.position }} />);
  const photo = page.querySelector<HTMLElement>("[data-hero-photo]")!;
  assert.equal(photo.style.maxWidth, `${sofa.width}px`);
  assert.equal(photo.style.getPropertyValue("--hero-position"), sofa.position);
  assert.equal(photo.querySelector("img")!.getAttribute("sizes"), `min(100vw, ${sofa.width}px)`);
  assert.equal(photo.querySelector("img")!.getAttribute("src"), sofa.image);
  assert.equal(page.querySelector("[data-featured-product] a")?.getAttribute("href"), "/products/sora-5-seater-sofa");
  const fallback = doc(<CollectionHero title="Sofas" crumb="Sofas" intro={intro} cover={{ image: "https://cdn.shopify.com/s/files/x.png", title: "First", handle: "first", pricePaise: null, priceFrom: false }} />);
  const plain = fallback.querySelector<HTMLElement>("[data-hero-photo]")!;
  assert.equal(plain.style.maxWidth, "", "a photo of unknown size fills the width as before");
  assert.equal(plain.querySelector("img")!.getAttribute("sizes"), "100vw");
});
