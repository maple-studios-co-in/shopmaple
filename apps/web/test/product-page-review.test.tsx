import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { productHighlightsSchema, toProductCard, type Cart, type Product, type ProductCard, type ProductHighlights } from "@shopmaple/contracts";
import { ProductDetail } from "../components/product-detail";
import { ShopProvider } from "../components/shop-provider";
import { ProductHighlightsProvider } from "../components/store/product-highlights";
import { completeLookCategories, lookPieces } from "../lib/product-related";
import { endsLabel } from "../components/store/product-deal";

// The owner's review file (Figma GJsFInfhys0crdNpQsbUUU, frame 2:371 "Product detail Page"): the buy box (2:434), the
// "Precision in Every Detail" hotspots (2:625) and the offer tab (2:857), each filled from the store's own data.
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3028/products/aero-dining-chair" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true });
const product: Product = {
  id: "aero", handle: "aero-dining-chair", title: "Aero Dining Chair", description: "A considered silhouette for a welcoming place at the table.", category: "chairs",
  images: ["https://example.com/aero-1.jpg", "https://example.com/aero-2.jpg"], published: true, source: "shopify-preview", sourceUpdatedAt: "2026-10-26T00:00:00Z",
  sourceDetails: { details: "Solid wood frame with a woven seat.", materials: "Frame: Oak with a walnut finish\nSeat: Bouclé upholstery", dimensions: "Width: 28\" (≈ 71 cm)\nDepth 61 cm", careInstructions: "Dust weekly.", warranty: "36 Months" },
  variants: [
    { id: "atlantic", title: "Deep Atlantic", sku: "AERO-A", pricePaise: 2_360_000, compareAtPaise: 2_714_000, available: false, stockPolicy: "made_to_order" },
    { id: "taupe", title: "Desert Taupe", sku: "AERO-T", pricePaise: 2_360_000, compareAtPaise: 2_714_000, available: false, stockPolicy: "made_to_order" },
  ],
};
const empty: Cart = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" };
const inDays = (ms: number) => new Date(Date.now() + ms).toISOString();
const DAY = 86_400_000, HOUR = 3_600_000, MINUTE = 60_000;
const deal = { offer: "10% off", code: "PREVIEW10", endsAt: inDays(2 * DAY + 3 * HOUR + 4 * MINUTE + 30_500) };
const card = (handle: string, title: string, pricePaise: number | null, category: ProductCard["category"] = "tables") =>
  toProductCard({ id: handle, handle, title, images: [`https://example.com/${handle}.jpg`], category, variants: [{ pricePaise, compareAtPaise: null }] });

async function mount(check: (doc: Document) => void | Promise<void>, value: Product = product, options: { highlights?: ProductHighlights; completeLook?: ProductCard[]; bundle?: Product[]; fetcher?: typeof fetch; related?: React.ReactNode } = {}) {
  const previous = globalThis.fetch;
  globalThis.fetch = options.fetcher ?? (async () => Response.json(empty));
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={router}><ProductHighlightsProvider value={options.highlights}><ShopProvider>
      <ProductDetail product={value} completeLook={options.completeLook} bundle={options.bundle}>{options.related}</ProductDetail>
    </ShopProvider></ProductHighlightsProvider></AppRouterContext.Provider>));
    await check(document);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
}
const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim();
const hook = (doc: Document, name: string) => doc.querySelector(`[${name}]`);

test("the store-wide deal is optional, names an offer and a code, and ends at a real time", () => {
  const base = { swatches: [], products: [] };
  assert.equal(productHighlightsSchema.safeParse(base).success, true, "documents saved before the deal stay valid");
  assert.equal(productHighlightsSchema.safeParse({ ...base, deal }).success, true);
  assert.equal(productHighlightsSchema.safeParse({ ...base, deal: { ...deal, code: "SALE30%" } }).success, true, "the frame's own code shape");
  for (const bad of [{ ...deal, code: "sale 20" }, { ...deal, code: "" }, { ...deal, offer: " " }, { ...deal, endsAt: "next week" }, { ...deal, extra: 1 }])
    assert.equal(productHighlightsSchema.safeParse({ ...base, deal: bad }).success, false, JSON.stringify(bad));
});

test("the buy box opens with the piece's category as a chip linking to its collection, before New", async () => {
  await mount((doc) => {
    const chips = [...hook(doc, "data-product-info")!.querySelectorAll("[data-chip]")];
    assert.deepEqual(chips.map((chip) => [chip.getAttribute("data-chip"), text(chip)]), [["category", "Chairs"], ["new", "New"]]);
    assert.equal(chips[0]!.getAttribute("href"), "/collections/chairs");
  }, product, { highlights: { swatches: [], products: [{ handle: "aero-dining-chair", isNew: true, rating: null }] } });
});

test("a live deal counts down to its end in days, hours, minutes and seconds, with its code to copy", async () => {
  const copied: string[] = [];
  Object.defineProperty(dom.window.navigator, "clipboard", { value: { writeText: async (value: string) => { copied.push(value); } }, configurable: true });
  await mount(async (doc) => {
    const box = hook(doc, "data-countdown")!;
    assert.match(text(box)!, /^Don’t miss the deal/);
    assert.equal(text(box.querySelector("[data-deal-code]")), "PREVIEW10");
    const units = [...box.querySelectorAll("[data-countdown-unit]")].map(text);
    assert.deepEqual(units.slice(0, 3), ["02 Days", "03 Hours", "04 Mins"]);
    assert.match(units[3]!, /^(30|29) Secs$/);
    assert.match(text(box.querySelector(".sr-only"))!, /^Offer ends /, "the ticking numbers are hidden from screen readers; the end date is read once");
    await act(async () => box.querySelector<HTMLButtonElement>("button[data-deal-copy]")!.click());
    assert.deepEqual(copied, ["PREVIEW10"]);
    assert.equal(text(box.querySelector("[data-deal-copy-status]")), "Copied");
  }, product, { highlights: { swatches: [], products: [], deal } });
});

test("the offer's end is read in India's time, worded the same on the server and in the browser", () => {
  assert.equal(endsLabel("2026-11-09T00:32:00.000Z"), "9 November 2026, 6:02 am IST");
  assert.equal(endsLabel("2026-12-31T18:29:00Z"), "31 December 2026, 11:59 pm IST");
  assert.equal(endsLabel("2027-01-01T06:30:00+05:30"), "1 January 2027, 6:30 am IST");
});

test("the offer tab names the deal on the page's edge and can be closed; an ended deal shows neither", async () => {
  await mount(async (doc) => {
    const tab = hook(doc, "data-deal-tab")!;
    assert.equal(text(tab.querySelector("[data-deal-tab-text]")), "Get 10% off, use code PREVIEW10");
    await act(async () => tab.querySelector<HTMLButtonElement>("button[aria-label='Close offer']")!.click());
    assert.equal(hook(doc, "data-deal-tab"), null);
  }, product, { highlights: { swatches: [], products: [], deal } });
  await mount((doc) => {
    assert.equal(hook(doc, "data-countdown"), null);
    assert.equal(hook(doc, "data-deal-tab"), null);
  }, product, { highlights: { swatches: [], products: [], deal: { ...deal, endsAt: inDays(-MINUTE) } } });
});

test("availability says what the catalogue says: made to order, never a stock count", async () => {
  await mount((doc) => {
    assert.equal(text(hook(doc, "data-availability")), "Made to order Crafted for you in our Delhi workshop.");
    assert.doesNotMatch(text(hook(doc, "data-product-info"))!, /\d+ in stock/i);
  });
  await mount((doc) => assert.equal(hook(doc, "data-availability"), null, "Stock the catalogue cannot vouch for is not stated"),
    { ...product, variants: product.variants.map((v) => ({ ...v, stockPolicy: "unverified" as const })) });
});

test("Complete the look carries real pieces from other rooms, each with its price and a way to it, one below the other", async () => {
  await mount(async (doc) => {
    const look = hook(doc, "data-complete-look")!;
    assert.equal(text(look.querySelector("h2")), "Complete the look");
    const items = [...look.querySelectorAll("[data-look-item]")];
    assert.deepEqual(items.map((item) => text(item.querySelector("[data-look-name]"))), ["Aileron Upholstered Bench", "Kora Side Table"]);
    assert.deepEqual(items.map((item) => text(item.querySelector("[data-look-price]"))), ["Rs. 37,760.00", "Price on request"]);
    assert.deepEqual(items.map((item) => item.querySelector("a[data-look-view]")?.getAttribute("href")), ["/products/aileron-bench", "/products/kora-side-table"]);
    assert.ok(items.every((item) => item.tagName === "LI" && item.parentElement?.tagName === "UL"), "a list, each piece below the last (owner, 4 Nov 2026)");
    assert.equal(look.querySelectorAll("button").length, 0, "no carousel arrows: the buy box scrolls on past the pieces");
  }, product, { completeLook: [card("aileron-bench", "Aileron Upholstered Bench", 3_776_000), card("kora-side-table", "Kora Side Table", null)] });
  await mount((doc) => assert.equal(hook(doc, "data-complete-look"), null, "No pieces, no list"));
});

test("Complete the look picks other rooms for the piece and never the piece itself", () => {
  assert.deepEqual(completeLookCategories("chairs"), ["tables", "sofas"]);
  assert.deepEqual(completeLookCategories("beds"), ["storage", "chairs"]);
  assert.deepEqual(completeLookCategories(null), []);
  const tables = [card("t1", "T1", 1), card("t2", "T2", 1), card("t3", "T3", 1)];
  const sofas = [card("s1", "S1", 1, "sofas"), card("aero", "Aero", 1, "sofas"), card("s2", "S2", 1, "sofas")];
  assert.deepEqual(lookPieces([tables, sofas], { id: "aero" }).map((piece) => piece.id), ["t1", "s1", "t2", "s2"]);
});

test("the showroom box gives the real address and leads to the store's page, with the store's promises on a strip", async () => {
  await mount((doc) => {
    const showroom = hook(doc, "data-showroom")!;
    assert.match(text(showroom)!, /^Visit the Maple Furnishers showroom A-2\/56 - 57, W\.H\.S, Kirti Nagar, New Delhi 110015 View store information$/);
    assert.equal(showroom.querySelector("a")?.getAttribute("href"), "/pages/contact");
    assert.equal(hook(doc, "data-pickup"), null, "Pickup times the store has not published are not promised");
    assert.deepEqual([...doc.querySelectorAll("[data-assurances] li")].map(text), ["Delivery across India", "Defects and transit damage", "36 Months warranty"]);
    assert.equal(hook(doc, "data-assurances-copy")?.getAttribute("aria-hidden"), "true", "The strip's repeat for the loop is decoration");
  });
});

test("Precision in Every Detail: four numbered cards around the piece, each showing a little and opening in place", async () => {
  await mount(async (doc) => {
    const section = hook(doc, "data-features")!;
    assert.equal(text(section.querySelector("h2")), "Precision in Every Detail");
    assert.equal(text(section.querySelector("[data-features-intro]")), "Discover the finishes, textures and thoughtful details that make Aero Dining Chair your own.");
    const cards = [...section.querySelectorAll<HTMLElement>("[data-feature]")];
    assert.deepEqual(cards.map((c) => text(c.querySelector("h3"))), ["About Product", "Materials", "Specifications", "Material Care"]);
    assert.deepEqual(cards.map((c) => text(c.querySelector("[data-feature-number]"))), ["01", "02", "03", "04"]);
    assert.equal(text(cards[0]!.querySelector("[data-feature-body]")), "Solid wood frame with a woven seat.");
    assert.deepEqual([...cards[1]!.querySelectorAll("[data-feature-row]")].map((row) => [...row.children].map(text)), [["Frame", "Oak with a walnut finish"], ["Seat", "Bouclé upholstery"]]);
    const specRows = () => [...cards[2]!.querySelectorAll<HTMLElement>("[data-feature-row]")];
    assert.deepEqual(specRows().map((row) => [...row.children].map(text)), [["Width", "28\" (≈ 71 cm)"], ["Depth", "61 cm"], ["Warranty", "36 Months"]], "every row stays on the page");
    assert.equal(text(cards[3]!.querySelector("[data-feature-body]")), "Dust weekly.");
    // Closed, a card shows a little (two lines, two rows) and keeps its link for when it opens (owner, 4 Nov 2026).
    const toggles = cards.map((c) => c.querySelector<HTMLButtonElement>("h3 button[data-feature-toggle]"));
    assert.deepEqual(toggles.map((toggle) => toggle?.getAttribute("aria-expanded") ?? null), ["false", "false", "false", null], "a card with nothing more to show has no toggle");
    assert.deepEqual(toggles.slice(0, 3).map((toggle) => toggle!.getAttribute("aria-controls")), cards.slice(0, 3).map((c) => c.querySelector("[data-feature-content]")!.id));
    assert.deepEqual(specRows().map((row) => row.hidden), [false, false, true], "two rows while closed");
    assert.match(specRows()[2]!.className, /(^| )hidden( |$)/, "and really hidden: no display class overrides it");
    const link = cards[0]!.querySelector<HTMLAnchorElement>("a[data-feature-link]")!;
    assert.equal(link.hidden, true, "the link waits for the card to open");
    await act(async () => toggles[0]!.click());
    assert.equal(toggles[0]!.getAttribute("aria-expanded"), "true");
    assert.equal(cards[0]!.getAttribute("data-open"), "true");
    assert.equal(link.hidden, false);
    assert.equal(text(link), "Explore finishes with Maple");
    assert.match(link.getAttribute("href")!, /^\/pages\/contact\?product=Aero\+Dining\+Chair/);
    await act(async () => toggles[2]!.click());
    assert.deepEqual(specRows().map((row) => row.hidden), [false, false, false], "open, the card shows every row");
    assert.equal(cards[1]!.getAttribute("data-open"), "false", "each card opens on its own");
    await act(async () => toggles[0]!.click());
    assert.equal(link.hidden, true, "and closes again");
    // The hotspots carry Keeri's highlights alone, and the cards stand apart from them: no line joins a card to the photo.
    assert.equal(section.querySelectorAll("[data-highlight-spot]").length, 0, "no highlights in Keeri: no hotspots, nothing invented");
    assert.equal(section.querySelector("[data-features-lines]"), null);
    const caption = section.querySelector("[data-features-caption]")!;
    assert.deepEqual([...caption.children].map(text), ["Aero Dining Chair", "Your choice of fabric. Your choice of finish."]);
    assert.match(section.querySelector<HTMLImageElement>("[data-feature-photo] img")!.getAttribute("src")!, /aero-2\.jpg/, "the second photo of the piece");
  });
});

test("a long card shows two lines until it is opened, and a piece without upholstery is offered finish and size", async () => {
  const long = "A barrel-back accent chair with a generously cushioned seat, a softly curved backrest and an exposed wooden arm structure that flows into splayed legs. ".repeat(2).trim();
  await mount(async (doc) => {
    const about = doc.querySelector("[data-feature]")!;
    const toggle = about.querySelector<HTMLButtonElement>("button[data-feature-toggle]")!;
    const body = about.querySelector("[data-feature-body]")!;
    assert.equal(text(body), long, "the whole text is on the page");
    assert.match(body.className, /line-clamp-2/, "two lines show while the card is closed");
    assert.equal(about.querySelector("[data-feature-more]"), null, "the card itself opens: no separate Read more");
    await act(async () => toggle.click());
    assert.doesNotMatch(body.className, /line-clamp/);
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    assert.equal(text(hook(doc, "data-features-caption")?.lastElementChild), "Your choice of finish. Your choice of size.");
  }, { ...product, sourceDetails: { ...product.sourceDetails!, details: long, materials: "Frame: Solid sheesham wood\nTop: Marble" } });
});

test("the promise row holds four promises the store keeps, as the frame's four columns do", async () => {
  await mount((doc) => {
    const row = hook(doc, "data-promises")!;
    assert.deepEqual([...row.querySelectorAll("li")].map((item) => text(item.querySelector("strong"))), ["Delivery across India", "Defects and transit damage", "Made to order", "Customer service"]);
    assert.doesNotMatch(text(row)!, /secure checkout|free shipping|hassle|24\/7/i);
  });
});

// ---- Buy in Bundle (Figma 100:476): the piece with two it is styled with, priced and added together ------------
const piece = (id: string, title: string, pricePaise: number | null, extra: Partial<Product> = {}): Product => ({
  ...product, id, handle: id, title, category: "tables", images: [`https://example.com/${id}.jpg`], sourceDetails: null,
  variants: [{ id: `${id}-v`, title: "Default Title", sku: null, pricePaise, compareAtPaise: null, available: false, stockPolicy: "made_to_order" }], ...extra,
});
const bench = piece("aileron-bench", "Aileron Upholstered Bench", 3_776_000);
const sofa = piece("alcyone-sofa", "Alcyone 7+-seater sofa", 11_210_000, { category: "sofas" });

test("Buy in Bundle sets the piece beside two it is styled with, totals them and sits above You may also like", async () => {
  await mount((doc) => {
    const bundle = hook(doc, "data-bundle")!;
    assert.equal(text(bundle.querySelector("h2")), "Buy in Bundle");
    assert.equal(text(bundle.querySelector("[data-bundle-lede]")), "Thoughtfully paired. Beautifully together.");
    const pieces = [...bundle.querySelectorAll("[data-bundle-piece]")];
    assert.deepEqual(pieces.map((item) => [text(item.querySelector("h3")), text(item.querySelector("[data-bundle-role]")), text(item.querySelector("[data-bundle-price]"))]), [
      ["Aero Dining Chair", "Current product · Quantity 1", "Rs. 23,600.00"],
      ["Aileron Upholstered Bench", "Paired product · Quantity 1", "Rs. 37,760.00"],
      ["Alcyone 7+-seater sofa", "Paired product · Quantity 1", "Rs. 112,100.00"],
    ]);
    assert.equal(bundle.querySelectorAll("[data-bundle-plus]").length, 2);
    const summary = bundle.querySelector("[data-bundle-summary]")!;
    assert.equal(text(summary.querySelector("[data-bundle-count]")), "3 pieces · 1 considered space");
    assert.equal(text(summary.querySelector("[data-bundle-total]")), "Rs. 173,460.00", "23,600 + 37,760 + 112,100");
    assert.deepEqual([...summary.querySelectorAll("li")].map(text), ["1 Aero Dining Chair", "1 Aileron Upholstered Bench", "1 Alcyone 7+-seater sofa"]);
    assert.equal(text(summary.querySelector("button[data-bundle-add]")), "Add bundle to cart");
    const related = hook(doc, "data-related-slot")!;
    assert.equal(hook(doc, "data-reviews")!.compareDocumentPosition(bundle) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.equal(bundle.compareDocumentPosition(related) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, dom.window.Node.DOCUMENT_POSITION_FOLLOWING, "above You may also like");
  }, product, { bundle: [bench, sofa], related: <section data-related-slot /> });
});

test("Add bundle to cart adds each piece once, in order, then opens the cart", async () => {
  const writes: string[] = [];
  let revision = 0;
  await mount(async (doc) => {
    await act(async () => {});
    await act(async () => doc.querySelector<HTMLButtonElement>("button[data-bundle-add]")!.click());
    assert.deepEqual(writes, ["/api/cart/items/atlantic", "/api/cart/items/aileron-bench-v", "/api/cart/items/alcyone-sofa-v"]);
  }, product, {
    bundle: [bench, sofa],
    fetcher: async (url, init) => {
      if (init?.method !== "PUT") return Response.json({ ...empty, mutationContext: { ...empty.mutationContext, revision } });
      const body = JSON.parse(String(init.body));
      writes.push(String(url));
      revision++;
      return Response.json({ ...empty, mutationContext: { ...empty.mutationContext, revision }, mutationResult: { id: body.mutation.id, status: "applied" } });
    },
  });
});

test("a bundle needs priced pieces: an unpriced pairing is left out, and with none the section is not shown", async () => {
  await mount((doc) => {
    assert.deepEqual([...doc.querySelectorAll("[data-bundle-piece] h3")].map(text), ["Aero Dining Chair", "Aileron Upholstered Bench"]);
    assert.equal(text(hook(doc, "data-bundle-count")), "2 pieces · 1 considered space");
  }, product, { bundle: [bench, piece("on-request", "On Request Sofa", null)] });
  await mount((doc) => assert.equal(hook(doc, "data-bundle"), null), product, { bundle: [] });
});

test("the rating is Keeri's: one typed into the highlights is not shown, and the page says there are no reviews yet", async () => {
  await mount((doc) => {
    const rating = hook(doc, "data-product-info")!.querySelector("[data-rating]")!;
    assert.ok(rating.hasAttribute("data-rating-empty"));
    assert.equal(text(rating), "No reviews yet");
    assert.equal(hook(doc, "data-rating-summary"), null, "and the reviews band shows no score either");
  }, product, { highlights: { swatches: [], products: [{ handle: "aero-dining-chair", isNew: false, rating: { value: 4.3 } }] } });
});
