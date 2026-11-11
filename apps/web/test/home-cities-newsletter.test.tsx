import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { homeDetailsSchema } from "@shopmaple/contracts";
import { HomeCities, HomeNewsletter } from "../components/home-sections";
import { HomePage } from "../components/home-page";
import { ShopProvider } from "../components/shop-provider";
import { kindLabels } from "../components/admin/crm-primitives";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { defaultHomeDetails } from "../lib/home-details-defaults";

const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3000/" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true });
const parse = (element: React.ReactNode) => new JSDOM(renderToStaticMarkup(element)).window.document;
const text = (node: Element | null | undefined) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();

async function mount(element: React.ReactNode, run: (host: HTMLElement) => Promise<void> | void) {
  const host = document.getElementById("root")!;
  const root = createRoot(host);
  await act(async () => root.render(element));
  try { await run(host); } finally { await act(async () => root.unmount()); }
}

// ---- Cities (Figma 177:1159) ----

test("the cities panel reads as the frame: eyebrow, 20+ over Cities, the rule, the promise, then the arches between two arrows", () => {
  const doc = parse(<HomeCities />);
  const section = doc.querySelector(".home-cities")!;
  assert.equal(text(section.querySelector("header .home-eyebrow")), "We Are Serving");
  const heading = section.querySelector("header h2")!;
  assert.equal(heading.textContent, "20+ Cities", "one heading for search and screen readers");
  assert.deepEqual([...heading.children].map((line) => line.textContent), ["20+", "Cities"], "drawn on two lines");
  assert.ok(section.querySelector("header [data-cities-rule][aria-hidden='true']"), "the thin rule with its two dots is decoration");
  assert.equal(text(section.querySelector("header [data-cities-description]")), "Delivering comfort and elegance across India.");
  const rail = section.querySelector("[data-cities-rail]")!;
  assert.equal(rail.getAttribute("role"), "group");
  assert.equal(rail.getAttribute("aria-roledescription"), "carousel");
  assert.equal(rail.getAttribute("aria-label"), "Cities served");
  assert.equal(rail.querySelector("[data-cities-prev]")?.getAttribute("aria-label"), "Previous cities");
  assert.equal(rail.querySelector("[data-cities-next]")?.getAttribute("aria-label"), "Next cities");
  assert.ok(rail.querySelector("[data-cities-prev] svg.lucide-chevron-left"));
  assert.ok(rail.querySelector("[data-cities-next] svg.lucide-chevron-right"));
  const cards = [...rail.querySelectorAll(".home-city-track figure.home-city-card")];
  assert.deepEqual(cards.map((card) => card.querySelector("figcaption")?.textContent), ["Delhi", "Kolkata", "Hyderabad", "Varanasi", "Mumbai", "Jaipur", "Bengaluru", "Chennai", "Gujarat", "Agra"]);
  assert.equal(section.querySelector("[data-marquee]"), null, "each city is drawn once: the arrows move a real row, not a drifting copy");
  assert.equal(section.querySelector("[data-marquee-copy]"), null);
});

test("the numbers band is gone from the cities section, and nothing is left to count up", () => {
  const doc = parse(<HomeCities />);
  assert.equal(doc.querySelector("[data-stat-band]"), null);
  assert.equal(doc.querySelector("[data-count-to]"), null);
});

test("a one-word heading and an edited promise keep working, and an older document with no promise falls back", () => {
  const edited = parse(<HomeCities content={{ eyebrow: "Near you", heading: "Everywhere", description: "From our Delhi workshop to your door." }} />);
  assert.deepEqual([...edited.querySelector(".home-cities h2")!.children].map((line) => line.textContent), ["Everywhere"]);
  assert.equal(text(edited.querySelector("[data-cities-description]")), "From our Delhi workshop to your door.");
  const older = parse(<HomeCities content={{ eyebrow: "Near you", heading: "Across the whole of India" }} />);
  assert.equal(older.querySelector(".home-cities h2")!.textContent, "Across the whole of India");
  assert.deepEqual([...older.querySelector(".home-cities h2")!.children].map((line) => line.textContent), ["Across", "the whole of India"]);
  assert.equal(text(older.querySelector("[data-cities-description]")), "Delivering comfort and elegance across India.");
});

test("the promise is an optional field: older published documents stay valid, and an empty one is refused", () => {
  const cities = defaultHomeDetails.cities;
  assert.equal(cities.description, "Delivering comfort and elegance across India.");
  const details = structuredClone(defaultHomeDetails);
  assert.equal(homeDetailsSchema.safeParse(details).success, true);
  delete details.cities.description;
  assert.equal(homeDetailsSchema.safeParse(details).success, true, "documents published before this field still parse");
  assert.equal(homeDetailsSchema.safeParse({ ...details, cities: { ...details.cities, description: "" } }).success, false);
  assert.equal(homeDetailsSchema.safeParse({ ...details, cities: { ...details.cities, description: "x".repeat(301) } }).success, false);
  assert.equal(homeDetailsSchema.safeParse({ ...details, cities: { ...details.cities, href: "/x" } }).success, false, "still strict");
});

/** A row whose measurements jsdom cannot give, driven by hand. */
function fakeRow(track: HTMLElement, sizes: { clientWidth: number; scrollWidth: number }) {
  const moves: { left?: number; top?: number; behavior?: string }[] = [];
  Object.defineProperties(track, {
    clientWidth: { configurable: true, value: sizes.clientWidth },
    scrollWidth: { configurable: true, value: sizes.scrollWidth },
    scrollLeft: { configurable: true, writable: true, value: 0 },
  });
  track.scrollBy = ((options: { left: number }) => { moves.push(options); }) as typeof track.scrollBy;
  track.scrollTo = ((options: { left: number }) => { moves.push({ ...options, top: -1 }); }) as typeof track.scrollTo;
  return moves;
}

test("the arrows move the row a city at a time, and past either end they go round", async () => {
  await mount(<HomeCities autoplay={false} />, async (host) => {
    const track = host.querySelector<HTMLElement>(".home-city-track")!;
    const card = track.querySelector<HTMLElement>(".home-city-card")!;
    Object.defineProperty(card, "offsetWidth", { configurable: true, value: 116 });
    const moves = fakeRow(track, { clientWidth: 1000, scrollWidth: 1400 });
    (track as unknown as { scrollLeft: number }).scrollLeft = 100;
    await act(async () => host.querySelector<HTMLButtonElement>("[data-cities-next]")!.click());
    assert.equal(moves.at(-1)!.left, 136, "one card and the gap beside it");
    await act(async () => host.querySelector<HTMLButtonElement>("[data-cities-prev]")!.click());
    assert.equal(moves.at(-1)!.left, -136);
    (track as unknown as { scrollLeft: number }).scrollLeft = 400;
    await act(async () => host.querySelector<HTMLButtonElement>("[data-cities-next]")!.click());
    assert.deepEqual([moves.at(-1)!.left, moves.at(-1)!.top], [0, -1], "from the last city back to the first");
    (track as unknown as { scrollLeft: number }).scrollLeft = 0;
    await act(async () => host.querySelector<HTMLButtonElement>("[data-cities-prev]")!.click());
    assert.deepEqual([moves.at(-1)!.left, moves.at(-1)!.top], [400, -1], "and from the first to the last");
  });
});

test("the row moves on by itself only when the owner's switch is on, and holds while a visitor is on it", async () => {
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    await mount(<HomeCities autoplay />, async (host) => {
      const track = host.querySelector<HTMLElement>(".home-city-track")!;
      Object.defineProperty(track.querySelector(".home-city-card"), "offsetWidth", { configurable: true, value: 116 });
      const moves = fakeRow(track, { clientWidth: 1000, scrollWidth: 1400 });
      await act(async () => { mock.timers.tick(4000); });
      assert.equal(moves.length, 1, "one step every few seconds");
      const rail = host.querySelector<HTMLElement>("[data-cities-rail]")!;
      await act(async () => { rail.dispatchEvent(new dom.window.MouseEvent("mouseover", { bubbles: true })); });
      await act(async () => { mock.timers.tick(12000); });
      assert.equal(moves.length, 1, "held while the pointer is over it");
      await act(async () => { rail.dispatchEvent(new dom.window.MouseEvent("mouseout", { bubbles: true })); });
      await act(async () => { mock.timers.tick(4000); });
      assert.equal(moves.length, 2, "and moves on again");
    });
    await mount(<HomeCities autoplay={false} />, async (host) => {
      const track = host.querySelector<HTMLElement>(".home-city-track")!;
      const moves = fakeRow(track, { clientWidth: 1000, scrollWidth: 1400 });
      await act(async () => { mock.timers.tick(20000); });
      assert.equal(moves.length, 0, "with the switch off it stays where the visitor leaves it");
    });
  } finally { mock.timers.reset(); }
});

test("a visitor who asks for less motion gets a row that stays still", async () => {
  const previous = dom.window.matchMedia;
  dom.window.matchMedia = ((query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof dom.window.matchMedia;
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    await mount(<HomeCities autoplay />, async (host) => {
      const track = host.querySelector<HTMLElement>(".home-city-track")!;
      const moves = fakeRow(track, { clientWidth: 1000, scrollWidth: 1400 });
      await act(async () => { mock.timers.tick(20000); });
      assert.equal(moves.length, 0);
    });
  } finally { mock.timers.reset(); dom.window.matchMedia = previous; }
});

test("with every city in view the arrows step aside", async () => {
  await mount(<HomeCities autoplay={false} layout={[{ key: "delhi", enabled: true }, { key: "mumbai", enabled: true }]} />, async (host) => {
    const track = host.querySelector<HTMLElement>(".home-city-track")!;
    fakeRow(track, { clientWidth: 1000, scrollWidth: 1000 });
    await act(async () => { dom.window.dispatchEvent(new dom.window.Event("resize")); });
    assert.equal(host.querySelector<HTMLElement>("[data-cities-rail]")!.dataset.overflowing, "false");
    assert.equal(host.querySelector<HTMLButtonElement>("[data-cities-next]")!.hidden, true);
  });
});

// ---- Newsletter (the owner's picture): it takes the numbers band's place, mapped to the admin ----

test("a fresh homepage shows the newsletter where the numbers were, right above the cities", async () => {
  const keys = defaultStorefrontContent.homeSections.map((section) => section.key);
  assert.equal(keys[keys.indexOf("cities") - 1], "newsletter");
  assert.deepEqual(defaultStorefrontContent.homeSections.filter((section) => !section.enabled).map((section) => section.key), ["testimonial"]);
  const previous = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ products: [], published: true })) as typeof fetch;
  let doc: Document;
  try {
    const stream = await renderToReadableStream(<ShopProvider><HomePage content={defaultStorefrontContent} /></ShopProvider>);
    await stream.allReady;
    doc = new JSDOM(await new Response(stream).text()).window.document;
  } finally { globalThis.fetch = previous; }
  const sections = [...doc.querySelectorAll<HTMLElement>("[data-home-section]")].map((node) => node.dataset.homeSection);
  assert.equal(sections[sections.indexOf("cities") - 1], "newsletter");
  assert.equal(doc.querySelector("[data-stat-band]"), null, "the numbers band is gone from the page");
});

test("the band carries the admin's words, an uploaded mark behind them, and the frame's labelled email box", () => {
  // The bundled mark was a Shopify file (left the store 11 Nov 2026): the band shows a mark only once staff upload one.
  assert.equal(parse(<HomeNewsletter />).querySelector("[data-newsletter-mark]"), null);
  const doc = parse(<HomeNewsletter media={[{ key: "home-newsletter", image: "/media/uploads/" + "a".repeat(64) + ".webp", alt: "Maple Furnishers" }]} />);
  const band = doc.querySelector(".home-newsletter")!;
  assert.equal(text(band.querySelector("h2")), "Soft presence. Strong craftsmanship.");
  assert.equal(text(band.querySelector("h2 + p")), "Furniture made for rooms that feel as good as they look.");
  assert.equal(text(band.querySelector("h3")), "New Collections. Early Access. No Noise.");
  const mark = band.querySelector<HTMLElement>("[data-newsletter-mark]")!;
  assert.ok(mark.querySelector("img"), "the uploaded watermark");
  const email = band.querySelector<HTMLInputElement>('form input[type="email"]')!;
  assert.equal(email.placeholder, "Email address");
  assert.equal(email.required, true);
  assert.equal(band.querySelector(`label[for="${email.id}"]`)?.textContent, "Email address");
  assert.equal(text(band.querySelector('form button[type="submit"]')), "Subscribe");
  assert.equal(band.querySelector(".home-preview-detail"), null, "it no longer says signup is unavailable");
});

test("subscribing saves the email for the admin's inbox and says so, with no reference number to puzzle over", async () => {
  const previous = globalThis.fetch, sent: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url: String(url), init });
    return Response.json({ reference: "enq_00000000-0000-4000-8000-000000000000", mode: "preview", notificationSent: false }, { status: 201 });
  }) as typeof fetch;
  try {
    await mount(<HomeNewsletter />, async (host) => {
      const email = host.querySelector<HTMLInputElement>('input[type="email"]')!;
      email.value = "Reader@Example.Invalid";
      await act(async () => host.querySelector("form")!.requestSubmit());
      const signups = sent.filter((call) => call.url === "/api/enquiries");
      assert.equal(signups.length, 1);
      assert.deepEqual(JSON.parse(String(signups[0]!.init.body)), { kind: "newsletter", name: "", email: "reader@example.invalid", phone: "", message: "", context: { product: "", variant: "", sku: "", pincode: "" } });
      const status = host.querySelector('[role="status"]')!;
      assert.equal(text(status), "Thank you. You’re on the list.");
      assert.doesNotMatch(host.textContent ?? "", /enq_|Reference/);
    });
  } finally { globalThis.fetch = previous; }
});

test("a failed signup says so and keeps the address", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = (async () => new Response(null, { status: 500 })) as typeof fetch;
  try {
    await mount(<HomeNewsletter />, async (host) => {
      const email = host.querySelector<HTMLInputElement>('input[type="email"]')!;
      email.value = "reader@example.invalid";
      await act(async () => host.querySelector("form")!.requestSubmit());
      assert.equal(text(host.querySelector('[role="alert"]')), "We couldn’t add you to the list just now. Please try again.");
      assert.equal(email.value, "reader@example.invalid");
      assert.equal(host.querySelector('[role="status"]'), null);
    });
  } finally { globalThis.fetch = previous; }
});

test("staff can tell signups and kept reviews from enquiries in the admin", () => {
  assert.equal(kindLabels.newsletter, "Newsletter");
  assert.equal(kindLabels.review, "Review");
});
