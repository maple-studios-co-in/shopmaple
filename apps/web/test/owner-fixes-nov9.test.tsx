import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToReadableStream } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Cart, Product } from "@shopmaple/contracts";
import { DesktopNavigation } from "../components/navigation";
import { CategoryLanding } from "../components/category-landing";
import { CampaignBanner } from "../components/campaign-banner";
import { HomePage } from "../components/home-page";
import { ProductDetail } from "../components/product-detail";
import { ProductFeatures, type Feature } from "../components/store/product-features";
import { ProductFaq } from "../components/store/product-faq";
import { ProductReviews } from "../components/store/product-reviews";
import { ShopProvider } from "../components/shop-provider";
import { ProductHighlightsProvider } from "../components/store/product-highlights";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { chromeHref, defaultSiteChrome } from "../lib/site-chrome-defaults";
import { collectionTitles } from "../lib/collections";

// The owner's ten fixes of 9 Nov 2026: the main menu (Figma 256:3836), the room pages' banners and circles, the hotspots,
// 30px between sections, no faint rules, the reviews band, the bundle card, photos that load sooner, the cities panel
// (Figma 177:1159) and the questions beside a heading that stays put.
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3000/" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true });
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const classes = (element: Element | null | undefined) => element?.getAttribute("class")?.split(/\s+/) ?? [];
const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };

async function mount(element: React.ReactNode, check: (host: HTMLElement) => void | Promise<void>) {
  const host = document.getElementById("root")!;
  const root = createRoot(host);
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={router}>{element}</AppRouterContext.Provider>));
    await check(host);
  } finally {
    await act(async () => root.unmount());
  }
}

/**
 * Renders a page on the server while every catalogue read waits, and returns what is sent before those reads finish and
 * what follows once they do. A page that waited for its product rails would send nothing until then.
 */
async function streamWhileCataloguePends(element: React.ReactNode) {
  const previous = globalThis.fetch;
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const pending: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/api/content/storefront")) return Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 });
    pending.push(url);
    await gate;
    return Response.json({ products: [], published: true });
  };
  const sleep = (ms: number) => new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));
  try {
    const stream = await Promise.race([renderToReadableStream(<ShopProvider>{element}</ShopProvider>), sleep(4000)]);
    assert.ok(stream, "the page starts streaming while its product cards are still being read");
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let next = reader.read();
    const take = async (idle: number) => {
      let html = "";
      for (;;) {
        const chunk = await Promise.race([next, sleep(idle)]);
        if (!chunk || chunk.done) return html;
        html += decoder.decode(chunk.value, { stream: true });
        next = reader.read();
      }
    };
    const first = await take(300);
    assert.ok(pending.length > 0, "the catalogue was asked for the rails' cards");
    release();
    const rest = await take(3000);
    return { first, rest };
  } finally {
    release();
    globalThis.fetch = previous;
  }
}

// ---- 8. Photos that load sooner: first, because the catalogue keeps a read for 30 seconds and these must see it wait ----

test("the homepage sends everything above its product rails before their cards are read", async () => {
  const { first, rest } = await streamWhileCataloguePends(<HomePage content={{ ...structuredClone(defaultStorefrontContent), campaignsAvailable: true }} />);
  assert.match(first, /data-home-section="hero"/);
  assert.match(first, /data-campaign="landing-announcement"/);
  assert.ok((first.match(/data-rail-placeholder/g) ?? []).length >= 2, "each rail holds its place");
  assert.doesNotMatch(first, /This collection is temporarily unavailable/, "the rails' own content follows");
  assert.match(rest, /This collection is temporarily unavailable/);
});

test("a room page sends its banners and circles before its product rails' cards are read", async () => {
  const { first, rest } = await streamWhileCataloguePends(<CategoryLanding slug="sofas" />);
  assert.match(first, /data-landing-banner="hero"/);
  assert.match(first, /data-landing-category/);
  assert.match(first, /data-rail-placeholder/);
  assert.match(rest, /landing-products/);
});

// ---- 1. The main menu (Figma 256:3836) ----

test("the main menu runs the rooms, then Collections, Custom Furniture and Sale, with Contact left to the footer", () => {
  const labels = defaultSiteChrome.navigation.map((item) => item.label);
  assert.equal(labels.includes("Contact"), false);
  assert.deepEqual(labels.slice(-3), ["Collections", "Custom Furniture", "Sale"]);
  const custom = defaultSiteChrome.navigation.find((item) => item.label === "Custom Furniture")!;
  assert.equal(chromeHref(custom), "/contact?product=Custom+furniture", "Custom Furniture opens an enquiry already about it");
  // Sale opens the store's real sale collection; there is no /collections/sale, and the publish check refuses it.
  assert.equal(defaultSiteChrome.navigation.find((item) => item.label === "Sale")!.href, "/collections/clearance-sale");
  assert.deepEqual(defaultSiteChrome.desktopDiscovery.map((link) => link.label), ["New Arrivals", "Bestsellers", "Complete the Look"]);
});

test("every collection the default menu links to is one the store has, so no menu link lands on a not-found page", () => {
  const { navigation, desktopDiscovery, mobileQuickLinks } = defaultSiteChrome;
  const links = [...navigation, ...navigation.flatMap((item) => item.columns.flatMap((column) => column.links)), ...desktopDiscovery, ...mobileQuickLinks];
  const missing = links.map((link) => link.href.split(/[?#]/)[0]!).filter((href) => href.startsWith("/collections/"))
    .map((href) => href.slice("/collections/".length)).filter((handle) => !Object.hasOwn(collectionTitles, handle));
  assert.deepEqual(missing, []);
});

test("the open menu shows the room's card, the groups with their icons, the custom-size card and the discovery panel", async () => {
  await mount(<DesktopNavigation />, async (host) => {
    const sale = host.querySelector<HTMLAnchorElement>("a[data-nav-sale]");
    assert.equal(sale?.getAttribute("href"), "/collections/clearance-sale");
    const living = [...host.querySelectorAll("button")].find((button) => button.textContent === "Living Room")!;
    assert.ok(living.querySelector("[data-menu-chevron]"), "a room that opens a menu carries a chevron");
    await act(async () => living.click());
    const panel = host.querySelector(".maple-mega")!;
    assert.equal(panel.querySelector("h2")?.textContent, "Designed for every moment.");
    assert.ok(panel.querySelector('a[href="/collections/sofas"]')?.textContent?.startsWith("Explore Living Room"));
    assert.ok(panel.querySelectorAll("[data-menu-icon]").length >= 3, "each group's first link has its icon");
    const customSize = panel.querySelector<HTMLAnchorElement>("a[data-mega-custom]")!;
    assert.equal(customSize.getAttribute("href"), "/contact?product=Custom+size");
    assert.match(customSize.textContent ?? "", /Need a custom size\?.*Start Customizing/);
    assert.equal(panel.querySelectorAll(".maple-mega-discovery img").length, 3);
    assert.equal(panel.querySelector("[data-mega-footer]"), null, "the old promise strip under the columns is gone");
  });
});

test("the header is one row: the logo, the menu and the icons, with the logo sent as it is", () => {
  const header = source("../components/header.tsx");
  const main = header.slice(header.indexOf('className="header-main"'));
  assert.ok(main.indexOf("<DesktopNavigation") > main.indexOf("brand") && main.indexOf("<DesktopNavigation") < main.indexOf("header-actions"));
  assert.match(header, /src="\/media\/footer\/maple-logo\.webp"[^>]*unoptimized/);
  assert.match(source("../app/layout.tsx"), /wide-screens\.css";(?:\s*\/\/[^\n]*)*\s*import "@\/styles\/header-menu\.css";\s*import "@\/styles\/section-rhythm\.css";\s*import "@\/styles\/review-cards\.css";[\s\S]*tailwind\.css/);
  assert.match(source("../styles/header-menu.css"), /\.maple-desktop-nav \{[^}]*border: 0;/, "no rule under the menu");
});

// ---- 2. The room pages: banners and circles ----

test("a room page's hero runs edge to edge, every other banner sits inside the page margins, and no rules divide them", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) =>
    String(url).endsWith("/api/content/storefront") ? Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 }) : Response.json({ products: [], published: true });
  try {
    for (const slug of ["sofas", "chairs", "tables"] as const) {
      const stream = await renderToReadableStream(<ShopProvider><CategoryLanding slug={slug} /></ShopProvider>);
      await stream.allReady;
      const doc = new JSDOM(await new Response(stream).text()).window.document;
      const frames = [...doc.querySelectorAll(".landing-parity > [data-landing-banner]")];
      assert.equal(frames[0]?.getAttribute("data-landing-banner"), "hero", `${slug}: the first banner is the hero`);
      assert.equal(classes(frames[0]).includes("home-container"), false, `${slug}: the hero is not held in the margins`);
      assert.ok(frames[0]!.querySelector(`[data-campaign="${slug}-hero"]`));
      // A picture banner shows its own picture whole: no blurred backdrop, and the wide picture on a computer.
      for (const banner of doc.querySelectorAll(".landing-banner")) {
        assert.equal(banner.querySelector("[data-banner-backdrop]"), null);
        assert.equal(banner.querySelector('picture source[media="(min-width: 1024px)"]'), null);
      }
      assert.ok(frames.length > 1);
      for (const frame of frames.slice(1)) {
        assert.equal(frame.getAttribute("data-landing-banner"), "inset");
        assert.ok(classes(frame).includes("home-container"), `${slug}: a later banner keeps the page's side margins`);
      }
      assert.equal(doc.querySelectorAll(".home-divider").length, 0, `${slug}: no faint rules`);
      const circles = [...doc.querySelectorAll("a[data-landing-category]")];
      assert.ok(circles.length >= 6);
      for (const circle of circles) assert.ok(circle.querySelector("svg[data-category-arrow]"), "each circle carries the homepage tile's arrow");
    }
  } finally {
    globalThis.fetch = previous;
  }
});

test("the banners and circles are sized and drawn as the owner asked", () => {
  const css = source("../styles/section-rhythm.css");
  // After fixed heights and then 1050px/800px, the owner chose each banner at its own picture's height ("like it was
  // previously"): nothing in a banner is cut or enlarged.
  assert.doesNotMatch(css, /\.campaign-scene \{[^}]*(?:height|aspect-ratio):/, "no fixed banner height");
  assert.doesNotMatch(css, /\.landing-banner[^{]*img \{[^}]*height: \d/, "picture banners keep their own height");
  assert.doesNotMatch(css, /zoom:|data-banner-backdrop/);
  assert.match(source("../styles/campaign-banners.css"), /\.campaign-scene\{[^}]*aspect-ratio:1900\/350/, "the artwork's own shape");
  assert.match(css, /\.landing-banner-frame\.home-container > \* \{\s*overflow: hidden;\s*border-radius: 12px;/, "the product cards' 12px corners");
  // The circles exactly as the homepage's tiles: a sixth of the row less five 30px gaps, 30px apart, centred.
  assert.match(css, /\.landing-categories \{\s*grid-template-columns: repeat\(var\(--landing-columns, 6\), minmax\(0, calc\(\(100% - 150px\) \/ 6\)\)\);\s*justify-content: center;\s*gap: 30px;/);
  // The same fine double ring, its gap in the cream page's colour and its hairlines as much darker than the cream as the
  // homepage's (#efe8e1, #f1ebe5) are than white.
  assert.match(css, /\.landing-categories > a > div \{[^}]*border: 1px solid #e4dbce;[^}]*box-shadow: 0 0 0 4px var\(--paper, #f4f2ec\), 0 0 0 5px #e6ded2;/);
  assert.match(css, /\.landing-categories > a:hover > div img \{ transform: scale\(1\.46\); \}/, "the photo grows as the homepage's does (1.34 x 1.09)");
  assert.match(css, /\.landing-categories > a:focus-visible > div img \{ transform: scale\(1\.42\); \}/, "and on keyboard focus (1.34 x 1.06)");
  assert.match(css, /a:hover \[data-category-arrow\][\s\S]*?background: var\(--burgundy\);/, "and the arrow turns red");
  assert.doesNotMatch(source("../styles/suggested-pages.css"), /border: 5px solid #eee6dc/, "the thick outer ring is gone");
});

test("the beds page frames its two banners the same way", () => {
  const page = source("../app/collections/[handle]/page.tsx");
  assert.match(page, /<div className="landing-banner-frame" data-landing-banner="hero">\s*<CampaignBanner campaign=\{campaign\} eager \/>/);
  assert.match(page, /<div className="landing-banner-frame home-container" data-landing-banner="inset">\s*<CampaignBanner campaign="beds-sale" \/>/);
});

// ---- 3. The hotspots ----

const features: Feature[] = [
  { key: "about", title: "About Product", icon: "detail-finish", body: "A generously cushioned seat." },
  { key: "care", title: "Material Care", icon: "detail-care", body: "Dust weekly." },
];

test("the hotspots are a dark plus on a light disc, over a photo with nothing behind it", async () => {
  await mount(<ProductFeatures features={features} highlights={["Hand-woven seat", "Solid oak frame"]} contain title="Nola Accent Chair" photo="https://example.com/nola.png" />, async (host) => {
    const frame = host.querySelector("[data-feature-photo-frame]")!;
    assert.ok(classes(frame).includes("bg-transparent"));
    assert.equal(classes(frame).some((name) => /^bg-(cream|\[#f7f3ee\])$/.test(name)), false, "no panel colour behind the photo");
    const spots = [...host.querySelectorAll<HTMLButtonElement>("button[data-highlight-spot]")];
    assert.equal(spots.length, 2);
    for (const spot of spots) {
      const plus = spot.querySelector("[data-highlight-plus]")!;
      assert.ok(plus.querySelector("svg.lucide-plus"), "a plus");
      assert.ok(classes(plus).includes("bg-[#f6e8e5]"), "on a light disc");
      assert.ok(classes(plus).includes("text-maple"), "drawn in the dark red");
      assert.equal(spot.querySelector("[data-highlight-arrow]"), null);
      assert.equal(spot.querySelector("img"), null, "no pale disc behind one: every hotspot looks the same, over white or over the chair");
    }
    await act(async () => spots[0]!.click());
    assert.equal(spots[0]!.getAttribute("aria-expanded"), "true", "it still opens its chip");
  });
});

// ---- 4. 30px between sections (first 20px, then 30px the same day) ----

test("homepage sections and room-page sections sit 30px apart", () => {
  const css = source("../styles/section-rhythm.css");
  assert.match(css, /\[data-home-section\] \+ \[data-home-section\] > :first-child \{\s*margin-top: 30px;/);
  assert.match(css, /\.landing-parity:not\(\.landing-story\) \{\s*display: flex;\s*flex-direction: column;\s*gap: 30px;/);
  assert.match(css, /\.landing-banner-frame \{\s*margin-block: 30px;/, "the beds page's banners too");
  assert.doesNotMatch(css, /margin-top: 20px|gap: 20px/);
  assert.match(css, /\[data-home-section="project"\] > \.home-project \{\s*min-height: 0;/, "no band is held taller than its content");
});

const product: Product = {
  id: "aero", handle: "aero-dining-chair", title: "Aero Dining Chair", description: "A considered silhouette.", category: "chairs",
  images: ["https://example.com/aero-1.jpg"], published: true, source: "shopify-preview", sourceUpdatedAt: "2026-10-26T00:00:00Z",
  sourceDetails: { details: "Solid wood frame.", materials: "Frame: Oak", dimensions: "Width: 71 cm", careInstructions: "Dust weekly.", warranty: "36 Months" },
  variants: [{ id: "atlantic", title: "Deep Atlantic", sku: "AERO-A", pricePaise: 2_360_000, compareAtPaise: null, available: false, stockPolicy: "made_to_order" }],
};
const empty: Cart = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" };

test("the product page is one column 30px apart: sections on white carry no padding above or below, bands keep 40px inside", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json(empty);
  try {
    await mount(<ProductHighlightsProvider value={undefined}><ShopProvider><ProductDetail product={product}><section data-related-slot /></ProductDetail></ShopProvider></ProductHighlightsProvider>, (host) => {
      const page = host.querySelector("[data-product-page]")!;
      for (const name of ["flex", "flex-col", "gap-[30px]"]) assert.ok(classes(page).includes(name), name);
      const vertical = /^(?:[a-z]+:)?p[tby]-/;
      for (const hook of ["data-features", "data-ticker", "data-bundle", "data-faq", "data-promises"]) {
        const section = page.querySelector(`section[${hook}]`);
        if (!section) continue;
        assert.deepEqual(classes(section).filter((name) => vertical.test(name)), [], `${hook} has no padding above or below`);
      }
      for (const hook of ["data-reviews", "data-enquiry"]) {
        const section = page.querySelector(`section[${hook}]`)!;
        assert.ok(classes(section).includes("py-10"), `${hook} keeps 40px inside its band`);
      }
      assert.equal(classes(page.querySelector("section[aria-label='Aero Dining Chair']")).includes("pb-10"), false, "the buy box adds nothing under itself");
    });
  } finally {
    globalThis.fetch = previous;
  }
});

// ---- 5. No faint rules ----

test("no faint full-width rules are drawn between sections", () => {
  for (const file of ["category-story.tsx", "legacy-chairs.tsx", "collection-landing.tsx", "category-landing.tsx"])
    assert.doesNotMatch(source(`../components/${file}`), /className="home-divider/, file);
  assert.doesNotMatch(source("../components/service-pages.tsx"), /cp-divider/);
});

// ---- 6. Reviews ----

test("the reviews band takes three quarters of the screen, drops the count under the rating, and scores each review", async () => {
  const review = (id: string, rating: number, title: string) =>
    ({ id, rating, title, body: "Made beautifully.", reviewerName: "Asha", city: "Jaipur", reviewedAt: "2026-10-12", source: "online_order" as const, verifiedBuyer: false, variantId: null, photos: [] });
  const reviews = [review("r1", 5, "Sturdy and gorgeous"), review("r2", 4, "Worth the wait")];
  await mount(<ProductReviews rating={{ value: 4.5, count: 6 }} writeHref="/contact" reviews={reviews} />, (host) => {
    const band = host.querySelector("[data-reviews]")!;
    assert.ok(classes(band).includes("md:h-[75svh]"));
    const summary = band.querySelector("[data-rating-summary]")!;
    assert.doesNotMatch(summary.textContent ?? "", /6 reviews/, "no count written under the rating");
    assert.equal(summary.getAttribute("aria-label"), "Rated 4.5 out of 5 from 6 reviews", "a screen reader still hears it");
    assert.deepEqual([...band.querySelectorAll("[data-review] [data-review-score]")].map((score) => score.textContent), ["5.0", "4.0"]);
    // Nothing in a card may be cut through (owner, second pass): no line shrinks, and a short card drops whole lines.
    for (const card of band.querySelectorAll("[data-review]")) {
      const text = card.querySelector("[data-review-text]")!;
      for (const part of text.children) assert.ok(classes(part).includes("shrink-0"), `${part.tagName} keeps its height`);
      assert.ok(text.querySelector("[data-review-title]") && text.querySelector("[data-review-body]"));
    }
  });
});

test("a short review card gives up whole lines, never part of one", () => {
  const css = source("../styles/review-cards.css");
  assert.match(css, /@media \(min-width: 768px\) \{\s*\[data-review\] \[data-review-text\] \{\s*container-type: size;/, "the card's text column is measured");
  // First the title's second line, then the review's lines from the end, each step one whole line.
  const steps = [...css.matchAll(/@container \(max-height: ([\d.]+)px\) \{\s*\[data-review\] \[data-review-(title|body)\] \{\s*-webkit-line-clamp: (\d);/g)]
    .map(([, height, part, lines]) => ({ height: Number(height), part: String(part), lines: Number(lines) }));
  assert.deepEqual(steps.map(({ part, lines }) => `${part} ${lines}`), ["title 1", "body 4", "body 3", "body 2", "body 1"]);
  // Each threshold leaves room for what still shows: stars, gaps and name 109.6px, a title line 28.8px, a review line 22.4px.
  const fixed = 109.6, title = 28.8, line = 22.4;
  assert.ok(steps[0]!.height >= fixed + 2 * title + 5 * line, "two title lines and five review lines fit above the first step");
  for (const { height, part, lines } of steps.slice(1)) if (part === "body") assert.ok(height >= fixed + title + (lines + 1) * line - 0.1, `${lines + 1} review lines fit above ${height}px`);
});

test("the product page's banner is a third smaller than its 751px frame", () => {
  const banner = source("../components/store/product-banner.tsx");
  assert.match(banner, /md:min-h-\[500px\]/);
  assert.match(banner, /wide:min-h-\[max\(500px,20vw\)\]/);
  assert.doesNotMatch(banner, /751px/);
});

// ---- 7. The bundle's summary card ----

test("the bundle's summary card stands as tall as the pieces beside it", () => {
  const bundle = source("../components/store/product-bundle.tsx");
  // Side by side from 1024px, so a laptop at 125% keeps the summary beside the pieces (owner, 10 Nov 2026).
  assert.match(bundle, /lg:flex-row lg:items-stretch/);
  assert.match(bundle, /<article data-bundle-piece className="flex h-full /);
  assert.match(bundle, /data-bundle-summary[^>]*lg:self-stretch/);
});

// ---- 8. Photos that load sooner ----

// 11 Nov 2026: Shopify's files are the store's own copies now (/media/shopify), resized by the store's optimizer, so the
// page no longer depends on Shopify's resizer, which goes when the plan is cancelled.
test("a room page's circles and banners are the store's own copies, resized by its own optimizer, not Shopify's", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) =>
    String(url).endsWith("/api/content/storefront") ? Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 }) : Response.json({ products: [], published: true });
  try {
    const stream = await renderToReadableStream(<ShopProvider><CategoryLanding slug="sofas" /></ShopProvider>);
    await stream.allReady;
    const doc = new JSDOM(await new Response(stream).text()).window.document;
    // The test image stand-in (support/next-image.tsx) marks a custom loader; the store's optimizer is the default one.
    const circles = [...doc.querySelectorAll("a[data-landing-category] img")];
    assert.ok(circles.length >= 6);
    for (const circle of circles) {
      assert.equal(circle.getAttribute("data-loader"), null, circle.getAttribute("src") ?? "");
      assert.match(circle.getAttribute("src") ?? "", /^\/media\/shopify\/[a-f0-9]{32}\.(?:png|webp|jpg)$/);
    }
    const banners = [...doc.querySelectorAll(".landing-banner img")];
    assert.ok(banners.length > 0, "the page has a picture banner");
    for (const banner of banners) {
      assert.equal(banner.getAttribute("data-loader"), null, banner.getAttribute("src") ?? "");
      assert.match(banner.getAttribute("src") ?? "", /^\/media\/shopify\/[a-f0-9]{32}\.png$/);
    }
  } finally {
    globalThis.fetch = previous;
  }
});

test("the page's first banner loads its wide-screen pictures at once; the phone pictures stay lazy", async () => {
  const content = { ...structuredClone(defaultStorefrontContent), campaignsAvailable: true };
  const render = async (eager: boolean) => {
    const stream = await renderToReadableStream(<CampaignBanner campaign="sofas-hero" content={content} eager={eager} />);
    await stream.allReady;
    return new JSDOM(await new Response(stream).text()).window.document;
  };
  const first = await render(true);
  const wide = [...first.querySelectorAll('[data-artwork="desktop"] img')];
  assert.ok(wide.length > 0);
  for (const image of wide) assert.equal(image.getAttribute("loading"), "eager");
  // Left to next/image's default, which is lazy (the test stand-in writes no attribute for it).
  for (const image of first.querySelectorAll('[data-artwork="mobile"] img')) assert.notEqual(image.getAttribute("loading"), "eager");
  for (const image of (await render(false)).querySelectorAll('[data-artwork="desktop"] img')) assert.notEqual(image.getAttribute("loading"), "eager");
});

// ---- 9. The cities panel (Figma 177:1159) ----

test("the cities are white glass with a bright rim, each picture ringed in white, on a warm panel", () => {
  const css = source("../styles/home-cities.css");
  assert.match(css, /linear-gradient\(180deg, #f0ebe6 0%, #f5f1ec 100%\)/, "the warm panel");
  assert.match(css, /\.home-city-card \{[^}]*border: 1px solid rgb\(255 255 255 \/ 0\.95\);/, "a bright rim, not a tan outline");
  assert.doesNotMatch(css, /border: 1px solid #ebe2d9/);
  assert.match(css, /\.home-city-artwork \{[^}]*box-shadow: 0 0 0 2px rgb\(255 255 255 \/ 0\.95\)/, "a white ring round each picture");
  assert.match(css, /\.home-city-card figcaption \{[^}]*font: 600 [^;]*var\(--font-text\);/, "bolder names, in the text face (the heading face is set at 500 only)");
});

// ---- 10. The questions ----

test("the questions sit on the right of a heading that stays in place until the last question has passed", async () => {
  await mount(<ProductFaq />, (host) => {
    const heading = host.querySelector("[data-faq-heading]")!;
    const questions = host.querySelector("[data-faq-questions]")!;
    assert.equal(heading.compareDocumentPosition(questions) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, dom.window.Node.DOCUMENT_POSITION_FOLLOWING, "the heading comes first, on the left");
    // 32px under the header, which stays pinned on product pages (owner, 10 Nov 2026).
    for (const name of ["lg:sticky", "lg:top-[calc(var(--site-header-offset,0px)+32px)]", "lg:self-start"]) assert.ok(classes(heading).includes(name), name);
    // About one question's height under it, so it lets go as the last question comes level with it (owner, 9 Nov 2026).
    assert.ok(classes(heading).includes("lg:mb-24"), "the heading lets go before the next section closes in");
    assert.equal([...classes(heading), ...classes(questions)].some((name) => name.startsWith("lg:order-")), false, "no reordering puts the heading on the right");
    assert.ok(questions.querySelectorAll("details[data-faq-item]").length >= 6);
  });
});
