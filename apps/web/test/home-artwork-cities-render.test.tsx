import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { JSDOM } from "jsdom";
import Home from "../app/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { defaultHomeDetails } from "../lib/home-details-defaults";

const files = "https://shop.maplefurnishers.com/cdn/shop/files/";
// Independent original asset expectations catch accidental remapping during migration.
const difference = ["Custom_F.svg", "Del_mf.svg", "Icon_homepage.svg", "Maple_Banner_5.svg"];
const values = [
  ["quiet-luxury", "Icon_maple_3.svg"], ["real-living", "Cover_Image_Maple_2.svg"],
  ["ages-beautifully", "Icon_maple_1.svg"], ["strength", "Cover_Image_Maple_5.svg"],
] as const;
const cities = [
  ["delhi", "Delhi.svg", "Delhi"], ["kolkata", "Kolkata.svg", "Kolkata"],
  ["hyderabad", "Hyderabad.svg", "Hyderabad"], ["varanasi", "VARANASI1.svg", "Varanasi"],
  ["mumbai", "Mumbai.svg", "Mumbai"], ["jaipur", "jaipur.svg", "Jaipur"],
  ["bengaluru", "bengaluru_5d95b443-519f-4637-9d23-0cbbf2838908.svg", "Bengaluru"],
  ["chennai", "chennai.svg", "Chennai"], ["gujarat", "gujrat.svg", "Gujarat"],
  ["artwork-1", "engaged_3_2d4f6db1-cb60-497e-b2a1-061b5886d0ec.svg", ""],
  ["artwork-2", "engaged_5.svg", ""], ["artwork-3", "engaged_4.svg", ""],
  ["artwork-4", "engaged_11.svg", ""], ["artwork-5", "engaged_9.svg", ""],
  ["artwork-6", "engaged_10.svg", ""], ["artwork-7", "engaged_12.svg", ""],
  ["artwork-8", "engaged_2_f055519a-d518-4ed3-9409-2b2a8924295a.svg", ""],
  ["agra", "Agra.svg", "Agra"],
] as const;
function published(extra: Record<string, unknown> = {}) {
  const content = structuredClone(defaultStorefrontContent);
  delete content.templateMedia;
  delete content.homeCitiesLayout;
  content.homeSections = ["difference", "values", "cities"].map(key => ({ key, enabled: true })) as typeof content.homeSections;
  content.motion = { autoplaySocial: false, autoplayCities: false, revealSections: false };
  return { version: 12, content: Object.assign(content, extra) };
}
async function render(body: unknown) {
  const previous = globalThis.fetch;
  const requests: { url: string; method: string; cache?: RequestCache }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, method: init?.method ?? "GET", cache: init?.cache });
    if (url.endsWith("/api/content/storefront")) {
      if (body === "offline") throw new Error("offline");
      return Response.json(body);
    }
    if (new URL(url).pathname === "/api/catalogue/cards") return new Response(null, { status: 404 });
    throw new Error("Unexpected endpoint");
  };
  try {
    const html = await new Response(await renderToReadableStream(<ShopProvider><Home /></ShopProvider>)).text();
    assert.ok(requests.every(r => r.method === "GET" && (r.url.endsWith("/api/content/storefront") || new URL(r.url).pathname === "/api/catalogue/cards")), "Only public content and catalogue reads; never drafts or writes");
    assert.ok(requests.filter(r => r.url.endsWith("/api/content/storefront")).every(r => r.cache === "no-store"));
    return new JSDOM(html).window.document;
  } finally { globalThis.fetch = previous; }
}
const attrs = (doc: Document, selector: string, name: string) => [...doc.querySelectorAll(selector)].map(n => n.getAttribute(name));
function assertOriginal(doc: Document) {
  assert.deepEqual(attrs(doc, "[data-home-difference] img", "src"), difference.map(file => files + file));
  assert.deepEqual(attrs(doc, "[data-home-difference] img", "alt"), ["", "", "", ""]);
  assert.deepEqual(attrs(doc, "[data-home-values] img", "src"), values.map(([, file]) => files + file));
  assert.deepEqual(attrs(doc, "[data-home-values] img", "alt"), ["", "", "", ""]);
  assert.deepEqual(attrs(doc, "[data-city-track] img", "src"), cities.filter(([key]) => !key.startsWith("artwork-")).map(([key]) => `/media/cities/${key}.webp`));
  assert.deepEqual(attrs(doc, "[data-city-track] img", "alt"), cities.filter(([key]) => !key.startsWith("artwork-")).map(([, , alt]) => alt));
}

test("homepage preserves original value icons and copy while showing the suggested photographic city cards", async () => {
  const doc = await render(published());
  assertOriginal(doc);
  for (const [selector, width, height] of [["[data-home-difference] img", "60", "60"], ["[data-home-values] img", "80", "80"], ["[data-city-track] img", "400", "600"]]) {
    for (const node of doc.querySelectorAll(selector!)) {
      assert.equal(node.getAttribute("width"), width);
      assert.equal(node.getAttribute("height"), height);
    }
  }
  assert.equal(doc.querySelector("[data-home-difference] h2")?.textContent, "Every element is yours to reshape");
  assert.equal(doc.querySelector("[data-home-difference] a")?.getAttribute("href"), "/pages/contact");
  assert.equal(doc.querySelector("[data-home-cities] h2")?.textContent, "20+ Cities");
  assert.ok(doc.querySelector('button[aria-label="Previous Cities served"]'));
  assert.ok(doc.querySelector('button[aria-label="Next Cities served"]'));
});

function artworkOverrides() {
  return [
    ...difference.map((_, index) => ({ key: `home-difference-${index + 1}`, image: `/media/difference-${index + 1}.webp`, alt: `Promise icon ${index + 1}` })),
    ...values.map(([key]) => ({ key: `home-value-${key}`, image: `/media/value-${key}.webp`, alt: `Value ${key}` })),
    ...cities.map(([key]) => ({ key: `home-city-${key}`, image: `/media/city-${key}.webp`, alt: `Artwork ${key}` })),
  ];
}

test("published custom artwork reaches every difference, value and city slot with its accessible description", async () => {
  const doc = await render(published({ templateMedia: artworkOverrides(), homeCitiesLayout: cities.map(([key])=>({key,enabled:true})) }));
  assert.deepEqual(attrs(doc, "[data-home-difference] img", "src"), ["/media/difference-1.webp", "/media/difference-2.webp", "/media/difference-3.webp", "/media/difference-4.webp"]);
  assert.deepEqual(attrs(doc, "[data-home-difference] img", "alt"), ["Promise icon 1", "Promise icon 2", "Promise icon 3", "Promise icon 4"]);
  assert.deepEqual(attrs(doc, "[data-home-values] img", "src"), ["/media/value-quiet-luxury.webp", "/media/value-real-living.webp", "/media/value-ages-beautifully.webp", "/media/value-strength.webp"]);
  assert.deepEqual(attrs(doc, "[data-home-values] img", "alt"), ["Value quiet-luxury", "Value real-living", "Value ages-beautifully", "Value strength"]);
  for (const [index, [key]] of cities.entries()) {
    const image = doc.querySelectorAll("[data-city-track] img")[index];
    assert.equal(image?.getAttribute("src"), `/media/city-${key}.webp`);
    assert.equal(image?.getAttribute("alt"), `Artwork ${key}`);
  }
});

test("published reordered values and cities retain keyed artwork and hide disabled cities", async () => {
  const details = structuredClone(defaultHomeDetails);
  details.values.reverse();
  for (const custom of [false, true]) {
    const doc = await render(published({
      homeDetails: details,
      ...(custom ? { templateMedia: artworkOverrides() } : {}),
      homeCitiesLayout: [...cities].reverse().map(([key]) => ({ key, enabled: key === "agra" || key === "artwork-8" || key === "delhi" })),
    }));
    assert.deepEqual(attrs(doc, "[data-city-track] img", "src"), custom
      ? ["/media/city-agra.webp", "/media/city-artwork-8.webp", "/media/city-delhi.webp"]
      : ["/media/cities/agra.webp", files + "engaged_2_f055519a-d518-4ed3-9409-2b2a8924295a.svg", "/media/cities/delhi.webp"]);
    assert.deepEqual(attrs(doc, "[data-city-track] img", "alt"), custom ? ["Artwork agra", "Artwork artwork-8", "Artwork delhi"] : ["Agra", "", "Delhi"]);
    assert.equal(doc.querySelector("[data-home-values] img")?.getAttribute("src"), custom ? "/media/value-strength.webp" : files + "Cover_Image_Maple_5.svg");
    assert.equal(doc.querySelector("[data-home-values] h3")?.textContent, "Strength You Don’t See");
    assert.ok(doc.querySelector('button[aria-label="Next Cities served"]'));
  }
});

test("hiding all cities omits the full section including its heading and carousel controls", async () => {
  const doc = await render(published({ homeCitiesLayout: cities.map(([key]) => ({ key, enabled: false })) }));
  assert.equal(doc.querySelector("[data-home-cities]"), null);
  assert.equal(doc.querySelector('[aria-label="Cities served"]'), null);
  assert.equal(doc.querySelector('button[aria-label="Next Cities served"]'), null);
});

test("blank decorative alt is preserved and custom descriptions remain literal text", async () => {
  const media = artworkOverrides();
  const markup = '<img src=x onerror="alert(1)">';
  media[0]!.alt = "";
  media[4]!.alt = markup;
  media.find(item => item.key === "home-city-artwork-1")!.alt = "";
  const doc = await render(published({ templateMedia: media, homeCitiesLayout: cities.map(([key])=>({key,enabled:true})) }));
  assert.equal(doc.querySelector("[data-home-difference] img")?.getAttribute("src"), "/media/difference-1.webp");
  assert.equal(doc.querySelector("[data-home-difference] img")?.getAttribute("alt"), "");
  assert.equal(doc.querySelector("[data-home-values] img")?.getAttribute("alt"), markup);
  assert.equal(doc.querySelectorAll("[data-city-track] img")[9]?.getAttribute("alt"), "");
  assert.equal(doc.querySelectorAll("[onerror], img[src=x]").length, 0);
});

test("draft-only, invalid artwork, malformed city layouts and unavailable publication retain original artwork", async () => {
  const layout = cities.map(([key]) => ({ key, enabled: false }));
  for (const body of [
    { version: 12, draft: published({ templateMedia: artworkOverrides(), homeCitiesLayout: layout }).content },
    published({ templateMedia: [{ key: "home-city-delhi", image: "javascript:alert(1)", alt: "Unsafe" }], homeCitiesLayout: layout }),
    published({ templateMedia: artworkOverrides(), homeCitiesLayout: layout.slice(1) }),
    published({ templateMedia: artworkOverrides(), homeCitiesLayout: [...layout.slice(0, -1), layout[0]] }),
    "offline",
  ]) assertOriginal(await render(body));
});

test('default city strip uses photographic cards for the named locations',async()=>{
 const doc=await render(published());
 const images=[...doc.querySelectorAll('[data-city-track] img')];
 assert.equal(images.length,10);
 assert.deepEqual(images.map(i=>i.getAttribute('src')),['delhi','kolkata','hyderabad','varanasi','mumbai','jaipur','bengaluru','chennai','gujarat','agra'].map(k=>'/media/cities/'+k+'.webp'));
 assert.equal(doc.querySelector('[data-home-cities] a[href="/media/cities/credits.html"]')?.textContent,'Image credits');
});
