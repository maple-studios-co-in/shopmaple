import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { JSDOM } from "jsdom";
import React, { act, useState } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  campaignContentSchema, productHighlightsSchema, storefrontContentSchema,
  type Cart, type Product, type ProductHighlights, type ProductOffer,
} from "@shopmaple/contracts";
import { CampaignFields } from "../components/admin/forms";
import { ProductDetail } from "../components/product-detail";
import { ShopProvider } from "../components/shop-provider";
import { ProductHighlightsProvider } from "../components/store/product-highlights";
import { ProductDeal } from "../components/store/product-deal";
import { defaultStorefrontContent } from "../lib/content-defaults";

// The product page's "Don't miss the deal" box (Figma frame 2:447) and its edge tab (2:857) show the product's own Keeri
// offer while it runs, and nothing else: a store-wide offer could name a code checkout does not take.
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3028/products/aero-dining-chair" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true });

const DAY = 86_400_000, HOUR = 3_600_000, MINUTE = 60_000;
const fromNow = (ms: number) => new Date(Date.now() + ms).toISOString();
const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim();
const box = (doc: Document) => doc.querySelector("[data-countdown]");
const tab = (doc: Document) => doc.querySelector("[data-deal-tab]");
const code = (doc: Document) => text(box(doc)?.querySelector("[data-deal-code]"));
const units = (doc: Document) => [...box(doc)!.querySelectorAll("[data-countdown-unit]")].map(text);

const base: Product = {
  id: "aero", handle: "aero-dining-chair", title: "Aero Dining Chair", description: "A place at the table.", category: "chairs",
  images: ["https://example.com/aero-1.jpg"], published: true, source: "shopify-preview", sourceUpdatedAt: "2026-10-26T00:00:00Z",
  variants: [{ id: "taupe", title: "Desert Taupe", sku: "AERO-T", pricePaise: 2_360_000, compareAtPaise: null, available: false, stockPolicy: "made_to_order" }],
};
const emptyCart: Cart = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" };
const offer = (overrides: Partial<ProductOffer> = {}): ProductOffer => ({ label: "15% off", code: "DIWALI15", startsAt: fromNow(-DAY), endsAt: fromNow(DAY), ...overrides });
const withOffer = (value: ProductOffer | null | undefined): Product => ({ ...base, ...(value === undefined ? {} : { offer: value }) });
const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };

async function productPage(check: (doc: Document) => void | Promise<void>, product: Product, highlights: ProductHighlights = { swatches: [], products: [] }) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json(emptyCart);
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={router}><ProductHighlightsProvider value={highlights}><ShopProvider>
      <ProductDetail product={product} />
    </ShopProvider></ProductHighlightsProvider></AppRouterContext.Provider>));
    await check(document);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
    window.sessionStorage.clear();
  }
}

/* ── Which offer ─────────────────────────────────────────────────────────────── */

test("a running offer puts the product's own code and deadline on the box and the edge tab", async () => {
  await productPage((doc) => {
    assert.equal(code(doc), "DIWALI15");
    assert.deepEqual(units(doc).slice(0, 3), ["02 Days", "03 Hours", "04 Mins"]);
    assert.equal(text(tab(doc)?.querySelector("[data-deal-tab-text]")), "Get 15% off, use code DIWALI15");
  }, withOffer(offer({ endsAt: fromNow(2 * DAY + 3 * HOUR + 4 * MINUTE + 30_500) })));
});

test("a product without a running offer shows no box and no tab: none, an ended one, or one still to come", async () => {
  for (const value of [undefined, null, offer({ startsAt: fromNow(-DAY), endsAt: fromNow(-MINUTE) }), offer({ startsAt: fromNow(HOUR), endsAt: fromNow(DAY) })])
    await productPage((doc) => {
      assert.equal(box(doc), null, JSON.stringify(value));
      assert.equal(tab(doc), null, JSON.stringify(value));
    }, withOffer(value));
});

test("a store-wide offer saved in the content is never shown, with or without the product's own", async () => {
  const legacy = { swatches: [], products: [], deal: { offer: "30% off", code: "SALE30", endsAt: fromNow(DAY) } };
  await productPage((doc) => {
    assert.equal(box(doc), null);
    assert.equal(tab(doc), null);
    assert.doesNotMatch(doc.body.textContent!, /SALE30/);
  }, withOffer(null), legacy);
  await productPage((doc) => {
    assert.equal(code(doc), "DIWALI15");
    assert.doesNotMatch(doc.body.textContent!, /SALE30/);
  }, withOffer(offer()), legacy);
});

test("content saved with the old store-wide and campaign offers still parses", () => {
  const content = structuredClone(defaultStorefrontContent);
  content.campaigns[0] = { ...content.campaigns[0]!, deal: { offer: "30% off", code: "SALE30" } };
  content.productHighlights = { swatches: [], products: [], deal: { offer: "20% off", code: "SALE20", endsAt: "2099-01-01T00:00:00.000Z" } };
  assert.equal(storefrontContentSchema.safeParse(content).success, true);
  assert.equal(campaignContentSchema.safeParse(content.campaigns[0]).success, true);
  assert.equal(productHighlightsSchema.safeParse(content.productHighlights).success, true);
});

/* ── Time ────────────────────────────────────────────────────────────────────── */

/** An open page over time: the clock stands still until the test moves it, so a slow render cannot pass an offer's start or end. */
const openedAt = Date.parse("2027-01-10T00:00:00.000Z");
const at = (ms: number) => new Date(openedAt + ms).toISOString();
function holdTheClock(t: TestContext) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: openedAt });
  return (ms: number) => act(async () => t.mock.timers.tick(ms));
}
async function hydrate(product: Product, before: (doc: Document) => void, after: (doc: Document) => void, pass: (ms: number) => Promise<void>, early: number) {
  const page = (serverNow: number) => <AppRouterContext.Provider value={router}><ProductHighlightsProvider value={{ swatches: [], products: [] }}><ShopProvider>
    <ProductDetail product={product} serverNow={serverNow} />
  </ShopProvider></ProductHighlightsProvider></AppRouterContext.Provider>;
  const container = document.getElementById("root")!;
  container.innerHTML = renderToString(page(openedAt));
  before(document);
  await pass(early);
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json(emptyCart);
  const errors: unknown[] = [];
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    await act(async () => { root = hydrateRoot(container, page(openedAt), { onRecoverableError: (error) => errors.push(error) }); });
    assert.deepEqual(errors, [], "hydration matched the server's markup");
    after(document);
  } finally {
    await act(async () => root?.unmount());
    globalThis.fetch = previous;
    window.sessionStorage.clear();
  }
}

test("the page hydrates on the server's clock, so a shopper whose clock runs ahead of the offer's start sees no mismatch", async (t) => {
  const pass = holdTheClock(t);
  await hydrate(withOffer(offer({ startsAt: at(2 * MINUTE), endsAt: at(DAY) })),
    (doc) => assert.equal(box(doc), null, "the server rendered before the offer started"),
    (doc) => assert.equal(code(doc), "DIWALI15", "then the open page caught up with the browser's clock"),
    pass, 3 * MINUTE);
});

test("the box's first markup already shows the time left by the server's clock, and the browser takes over without a mismatch", async (t) => {
  const pass = holdTheClock(t);
  await hydrate(withOffer(offer({ startsAt: at(-DAY), endsAt: at(2 * DAY + 3 * HOUR + 4 * MINUTE + 5_000) })),
    (doc) => assert.deepEqual(units(doc), ["02 Days", "03 Hours", "04 Mins", "05 Secs"], "real numbers before any script runs"),
    (doc) => assert.deepEqual(units(doc), ["02 Days", "03 Hours", "04 Mins", "03 Secs"], "then it counts from the browser's clock"),
    pass, 2000);
});

test("an offer that starts while the page is open brings the box in without a reload", async (t) => {
  const pass = holdTheClock(t);
  await productPage(async (doc) => {
    assert.equal(box(doc), null, "not before its start");
    await pass(HOUR - 1);
    assert.equal(box(doc), null, "not a moment before");
    await pass(1);
    assert.equal(code(doc), "DIWALI15");
    assert.ok(tab(doc));
  }, withOffer(offer({ startsAt: at(HOUR), endsAt: at(DAY) })));
});

test("an offer that ends while the page is open takes the box and the tab with it", async (t) => {
  const pass = holdTheClock(t);
  await productPage(async (doc) => {
    assert.equal(code(doc), "DIWALI15");
    await pass(HOUR - 1);
    assert.equal(code(doc), "DIWALI15", "still running a moment before");
    await pass(1);
    assert.equal(box(doc), null);
    assert.equal(tab(doc), null);
  }, withOffer(offer({ startsAt: at(-DAY), endsAt: at(HOUR) })));
});

const digits = (doc: Document, unit: number) => [...box(doc)!.querySelectorAll("[data-countdown-unit]")[unit]!.querySelectorAll("[data-countdown-digit]")];

test("the seconds change on the deadline's own second boundaries, and only the digit that changes is redrawn", async (t) => {
  const pass = holdTheClock(t);
  await productPage(async (doc) => {
    assert.deepEqual(units(doc), ["00 Days", "00 Hours", "02 Mins", "01 Sec"], "two minutes and 0.4s read 2:01: never less than is left");
    await pass(400);
    assert.deepEqual(units(doc).slice(2), ["02 Mins", "00 Secs"], "the very moment the second passes");
    await pass(1000);
    assert.deepEqual(units(doc).slice(2), ["01 Min", "59 Secs"]);
    const [tens, ones] = digits(doc, 3);
    const minutes = digits(doc, 2);
    await pass(1000);
    const [tensAfter, onesAfter] = digits(doc, 3);
    assert.equal(tensAfter, tens, "the 5 stays put");
    assert.notEqual(onesAfter, ones, "the 9 gives way to the 8, which rolls in");
    assert.deepEqual(digits(doc, 2), minutes, "the minutes did not change, so they are not redrawn");
  }, withOffer(offer({ startsAt: at(-DAY), endsAt: at(2 * MINUTE + 400) })));
});

test("a deadline that has passed, or cannot be read, never shows a timer: no zeros, no negative numbers", () => {
  const now = Date.parse("2026-11-10T00:00:00.000Z");
  const deal = (endsAt: string) => ({ label: "10% off", code: "SALE10", startsAt: "2026-11-01T00:00:00.000Z", endsAt });
  for (const endsAt of ["2026-11-09T23:59:59.000Z", "2026-11-10T00:00:00.000Z", "soon"])
    assert.equal(renderToStaticMarkup(<ProductDeal deal={deal(endsAt)} openedAt={now} />), "", endsAt);
  assert.match(renderToStaticMarkup(<ProductDeal deal={deal("2027-02-18T00:00:00.000Z")} openedAt={now} />).replace(/<[^>]+>/g, ""), /100 Days00 Hours00 Mins00 Secs/, "a hundred days and more still fit");
});

/* ── The admin ───────────────────────────────────────────────────────────────── */

test("a campaign has no product page timer to edit any more, and a timer saved before is kept as it was", async () => {
  const initial = structuredClone(defaultStorefrontContent);
  initial.campaigns[0] = { ...initial.campaigns[0]!, deal: { offer: "30% off", code: "SALE30" }, schedule: { startsAt: null, endsAt: "2099-01-01T00:00:00.000Z" } };
  let content = initial;
  function Editor() {
    const [value, setValue] = useState(initial);
    return <CampaignFields content={value} onChange={(next) => { content = next; setValue(next); }} />;
  }
  const container = document.getElementById("root")!;
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Editor />));
    assert.equal(container.querySelector("[aria-label='Product page timer']"), null);
    assert.doesNotMatch(container.textContent!, /timer offer/i);
    assert.deepEqual(content.campaigns[0]!.deal, { offer: "30% off", code: "SALE30" });
  } finally {
    await act(async () => root.unmount());
  }
});
