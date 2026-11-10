import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { JSDOM } from "jsdom";
import React, { act, useState } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  campaignContentSchema, campaignDeals, liveCampaignDeal, storefrontContentSchema,
  type Cart, type CampaignDeal, type Product, type ProductHighlights, type StorefrontContent,
} from "@shopmaple/contracts";
import { CampaignFields } from "../components/admin/forms";
import { ProductDetail } from "../components/product-detail";
import { ShopProvider } from "../components/shop-provider";
import { ProductHighlightsProvider } from "../components/store/product-highlights";
import { ProductDeal } from "../components/store/product-deal";
import { documentDeals, readPublishedContent } from "../lib/content";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { withDemoCampaignDeal } from "../lib/demo-campaign-deal";

// The linkage under test: staff give a campaign an offer and a schedule; that campaign then decides whether the
// product page's "Don't miss the deal" box (Figma frame 2:447) shows, what code it offers and what it counts down to.
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3028/products/aero-dining-chair" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true });

const DAY = 86_400_000, HOUR = 3_600_000, MINUTE = 60_000;
const fromNow = (ms: number) => new Date(Date.now() + ms).toISOString();
const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim();
const box = (doc: Document) => doc.querySelector("[data-countdown]");
const tab = (doc: Document) => doc.querySelector("[data-deal-tab]");
const code = (doc: Document) => text(box(doc)?.querySelector("[data-deal-code]"));
const units = (doc: Document) => [...box(doc)!.querySelectorAll("[data-countdown-unit]")].map(text);

const product: Product = {
  id: "aero", handle: "aero-dining-chair", title: "Aero Dining Chair", description: "A place at the table.", category: "chairs",
  images: ["https://example.com/aero-1.jpg"], published: true, source: "shopify-preview", sourceUpdatedAt: "2026-10-26T00:00:00Z",
  variants: [{ id: "taupe", title: "Desert Taupe", sku: "AERO-T", pricePaise: 2_360_000, compareAtPaise: null, available: false, stockPolicy: "made_to_order" }],
};
const emptyCart: Cart = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" };
const liveDeal = (overrides: Partial<CampaignDeal> = {}): CampaignDeal => ({ campaign: "sofas-sale", offer: "30% off", code: "SOFA30", startsAt: null, endsAt: fromNow(DAY), ...overrides });

async function productPage(check: (doc: Document) => void | Promise<void>, options: { deals?: CampaignDeal[]; highlights?: ProductHighlights } = {}) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json(emptyCart);
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={router}><ProductHighlightsProvider value={options.highlights ?? { swatches: [], products: [] }} deals={options.deals}><ShopProvider>
      <ProductDetail product={product} />
    </ShopProvider></ProductHighlightsProvider></AppRouterContext.Provider>));
    await check(document);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
    window.sessionStorage.clear();
  }
}

/* ── The record ──────────────────────────────────────────────────────────────── */

test("a campaign may carry a countdown offer, validated like any offer; saved campaigns without one stay valid", () => {
  const saved = structuredClone(defaultStorefrontContent.campaigns[0]!);
  assert.equal(campaignContentSchema.safeParse(saved).success, true, "campaigns saved before the timer stay valid");
  assert.equal(campaignContentSchema.safeParse({ ...saved, deal: { offer: "30% off", code: "SALE30" } }).success, true);
  for (const deal of [{ offer: "30% off", code: "sale 30" }, { offer: "30% off", code: "" }, { offer: "  ", code: "SALE30" }, { offer: "30% off", code: "SALE30", endsAt: "2099-01-01T00:00:00Z" }])
    assert.equal(campaignContentSchema.safeParse({ ...saved, deal }).success, false, JSON.stringify(deal));
});

/* ── Choosing the offer ──────────────────────────────────────────────────────── */

test("only a campaign with an offer and a schedule that ends can run the countdown", () => {
  const ends = "2027-03-01T00:00:00.000Z", starts = "2027-02-01T00:00:00.000Z";
  const deal = { offer: "30% off", code: "SOFA30" };
  assert.deepEqual(campaignDeals([
    { key: "sofas-sale", deal, schedule: { startsAt: starts, endsAt: ends } },
    { key: "tables-sale", schedule: { startsAt: starts, endsAt: ends } },
    { key: "chairs-sale", deal, schedule: { startsAt: starts, endsAt: null } },
    { key: "beds-sale", deal, schedule: null },
    { key: "outdoors-hero", deal },
  ]), [{ campaign: "sofas-sale", offer: "30% off", code: "SOFA30", startsAt: starts, endsAt: ends }]);
});

test("an offer runs from its start, inclusive, until its end, exclusive", () => {
  const starts = Date.parse("2027-02-01T00:00:00.000Z"), ends = Date.parse("2027-03-01T00:00:00.000Z");
  const deal = liveDeal({ startsAt: new Date(starts).toISOString(), endsAt: new Date(ends).toISOString() });
  assert.equal(liveCampaignDeal([deal], starts - 1), undefined);
  assert.equal(liveCampaignDeal([deal], starts)?.code, "SOFA30");
  assert.equal(liveCampaignDeal([deal], ends - 1)?.code, "SOFA30");
  assert.equal(liveCampaignDeal([deal], ends), undefined);
});

test("when campaigns overlap, the shopper sees the deadline that comes first, whichever order staff listed them", () => {
  const now = Date.parse("2027-02-10T00:00:00.000Z");
  const later = liveDeal({ campaign: "sofas-sale", code: "LATER", endsAt: "2027-03-01T00:00:00.000Z" });
  const sooner = liveDeal({ campaign: "beds-sale", code: "SOONER", endsAt: "2027-02-20T00:00:00.000Z" });
  const ended = liveDeal({ campaign: "tables-sale", code: "ENDED", endsAt: "2027-02-01T00:00:00.000Z" });
  assert.equal(liveCampaignDeal([later, sooner, ended], now)?.code, "SOONER");
  assert.equal(liveCampaignDeal([ended, sooner, later], now)?.code, "SOONER");
});

/* ── From the published document to the page ─────────────────────────────────── */

function publishedWith(patch: Partial<StorefrontContent["campaigns"][number]>): StorefrontContent {
  const content = structuredClone(defaultStorefrontContent);
  content.campaigns[1] = { ...content.campaigns[1]!, ...patch };
  return content;
}
const respondWith = (content: StorefrontContent) => (async () => Response.json({ version: 1, content })) as unknown as typeof fetch;

test("publishing a campaign with an offer and an end reaches the product page's data; publishing a new end moves it", async () => {
  const deal = { offer: "30% off", code: "SOFA30" };
  const first = "2099-01-01T00:00:00.000Z", moved = "2099-02-02T00:00:00.000Z";
  const key = defaultStorefrontContent.campaigns[1]!.key;
  assert.deepEqual(documentDeals(await readPublishedContent(respondWith(publishedWith({ deal, schedule: { startsAt: null, endsAt: first } })))),
    [{ campaign: key, offer: "30% off", code: "SOFA30", startsAt: null, endsAt: first }]);
  assert.equal(documentDeals(await readPublishedContent(respondWith(publishedWith({ deal, schedule: { startsAt: null, endsAt: moved } }))))[0]?.endsAt, moved);
});

test("the bundled copy used during an API outage can vouch for no offer, while a staff draft can", () => {
  const content = publishedWith({ deal: { offer: "30% off", code: "SOFA30" }, schedule: { startsAt: null, endsAt: "2099-01-01T00:00:00.000Z" } });
  assert.deepEqual(documentDeals({ ...content, campaignsAvailable: false }), []);
  assert.equal(documentDeals({ ...content, campaignsAvailable: true }).length, 1);
  assert.equal(documentDeals(content).length, 1, "a draft preview's document has no outage to report");
});

/* ── The product page ────────────────────────────────────────────────────────── */

test("a running campaign puts its code and its own deadline on the product page, on the box and the edge tab", async () => {
  await productPage((doc) => {
    assert.equal(code(doc), "SOFA30");
    assert.deepEqual(units(doc).slice(0, 3), ["02 Days", "03 Hours", "04 Mins"]);
    assert.equal(text(tab(doc)?.querySelector("[data-deal-tab-text]")), "Get 30% off, use code SOFA30");
  }, { deals: [liveDeal({ endsAt: fromNow(2 * DAY + 3 * HOUR + 4 * MINUTE + 30_500) })] });
});

test("rescheduling the campaign moves the countdown", async () => {
  await productPage((doc) => assert.deepEqual(units(doc).slice(0, 2), ["09 Days", "00 Hours"]), { deals: [liveDeal({ endsAt: fromNow(9 * DAY + 30 * MINUTE) })] });
});

test("with no campaign running the page shows no timer at all", async () => {
  await productPage((doc) => { assert.equal(box(doc), null); assert.equal(tab(doc), null); });
  await productPage((doc) => { assert.equal(box(doc), null); assert.equal(tab(doc), null); }, { deals: [liveDeal({ endsAt: fromNow(-MINUTE) })] });
  await productPage((doc) => { assert.equal(box(doc), null); assert.equal(tab(doc), null); }, { deals: [liveDeal({ startsAt: fromNow(HOUR), endsAt: fromNow(DAY) })] });
});

test("a campaign's offer takes the place of the offer set by hand, which still runs when no campaign does", async () => {
  const manual = { offer: "10% off", code: "MANUAL10", endsAt: fromNow(DAY) };
  await productPage((doc) => assert.equal(code(doc), "SOFA30"), { deals: [liveDeal()], highlights: { swatches: [], products: [], deal: manual } });
  await productPage((doc) => assert.equal(code(doc), "MANUAL10"), { deals: [], highlights: { swatches: [], products: [], deal: manual } });
});

/** An open page over time: the clock stands still until the test moves it, so a slow render cannot pass a campaign's start or end. */
const openedAt = Date.parse("2027-01-10T00:00:00.000Z");
const at = (ms: number) => new Date(openedAt + ms).toISOString();
function holdTheClock(t: TestContext) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: openedAt });
  return (ms: number) => act(async () => t.mock.timers.tick(ms));
}

test("the page hydrates on the server's clock, so a shopper whose clock runs ahead of a campaign's start sees no mismatch", async (t) => {
  const pass = holdTheClock(t);
  const deals = [liveDeal({ startsAt: at(2 * MINUTE), endsAt: at(DAY) })];
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  const page = (serverNow: number) => <AppRouterContext.Provider value={router}><ProductHighlightsProvider value={{ swatches: [], products: [] }} deals={deals}><ShopProvider>
    <ProductDetail product={product} serverNow={serverNow} />
  </ShopProvider></ProductHighlightsProvider></AppRouterContext.Provider>;
  const container = document.getElementById("root")!;
  container.innerHTML = renderToString(page(openedAt));
  assert.equal(box(document), null, "the server rendered before the campaign started");
  await pass(3 * MINUTE); // the shopper's device is three minutes ahead, past the start
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json(emptyCart);
  const errors: unknown[] = [];
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    await act(async () => { root = hydrateRoot(container, page(openedAt), { onRecoverableError: (error) => errors.push(error) }); });
    assert.deepEqual(errors, [], "hydration matched the server's markup");
    assert.equal(code(document), "SOFA30", "then the open page caught up with the browser's clock");
  } finally {
    await act(async () => root?.unmount());
    globalThis.fetch = previous;
    window.sessionStorage.clear();
  }
});

test("a campaign that starts while the page is open brings the timer in without a reload", async (t) => {
  const pass = holdTheClock(t);
  await productPage(async (doc) => {
    assert.equal(box(doc), null, "not before its start");
    await pass(HOUR - 1);
    assert.equal(box(doc), null, "not a moment before");
    await pass(1);
    assert.equal(code(doc), "SOFA30");
    assert.ok(tab(doc));
  }, { deals: [liveDeal({ startsAt: at(HOUR), endsAt: at(DAY) })] });
});

test("a campaign that ends while the page is open takes the box and the tab with it", async (t) => {
  const pass = holdTheClock(t);
  await productPage(async (doc) => {
    assert.equal(code(doc), "SOFA30");
    await pass(HOUR - 1);
    assert.equal(code(doc), "SOFA30", "still running a moment before");
    await pass(1);
    assert.equal(box(doc), null);
    assert.equal(tab(doc), null);
  }, { deals: [liveDeal({ endsAt: at(HOUR) })] });
});

test("when one campaign ends the next one takes over, and its new offer brings back a tab the shopper closed", async (t) => {
  const pass = holdTheClock(t);
  await productPage(async (doc) => {
    assert.equal(code(doc), "FIRST");
    await act(async () => tab(doc)!.querySelector<HTMLButtonElement>("button[aria-label='Close offer']")!.click());
    assert.equal(tab(doc), null);
    await pass(HOUR);
    assert.equal(code(doc), "SECOND");
    assert.equal(text(tab(doc)?.querySelector("[data-deal-tab-text]")), "Get 15% off, use code SECOND");
  }, { deals: [liveDeal({ code: "FIRST", endsAt: at(HOUR) }), liveDeal({ campaign: "beds-sale", offer: "15% off", code: "SECOND", endsAt: at(DAY) })] });
});

test("the countdown ticks down on an open page", async (t) => {
  const pass = holdTheClock(t);
  await productPage(async (doc) => {
    assert.deepEqual(units(doc), ["00 Days", "00 Hours", "02 Mins", "00 Secs"]);
    await pass(1000);
    assert.deepEqual(units(doc), ["00 Days", "00 Hours", "01 Min", "59 Secs"]);
  }, { deals: [liveDeal({ endsAt: at(2 * MINUTE) })] });
});

/* ── Ticking smoothly, honestly (owner, 10 Nov 2026) ──────────────────────────── */

const digits = (doc: Document, unit: number) => [...box(doc)!.querySelectorAll("[data-countdown-unit]")[unit]!.querySelectorAll("[data-countdown-digit]")];

test("the box's first markup already shows the time left by the server's clock, and the browser takes over without a mismatch", async (t) => {
  const pass = holdTheClock(t);
  const deals = [liveDeal({ endsAt: at(2 * DAY + 3 * HOUR + 4 * MINUTE + 5_000) })];
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  const page = (serverNow: number) => <AppRouterContext.Provider value={router}><ProductHighlightsProvider value={{ swatches: [], products: [] }} deals={deals}><ShopProvider>
    <ProductDetail product={product} serverNow={serverNow} />
  </ShopProvider></ProductHighlightsProvider></AppRouterContext.Provider>;
  const container = document.getElementById("root")!;
  container.innerHTML = renderToString(page(openedAt));
  assert.deepEqual(units(document), ["02 Days", "03 Hours", "04 Mins", "05 Secs"], "real numbers before any script runs: no dashes, nothing to jump");
  await pass(2000); // the page reaches the shopper two seconds after the server drew it
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json(emptyCart);
  const errors: unknown[] = [];
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    await act(async () => { root = hydrateRoot(container, page(openedAt), { onRecoverableError: (error) => errors.push(error) }); });
    assert.deepEqual(errors, [], "hydration matched the server's markup");
    assert.deepEqual(units(document), ["02 Days", "03 Hours", "04 Mins", "03 Secs"], "then it counts from the browser's clock");
  } finally {
    await act(async () => root?.unmount());
    globalThis.fetch = previous;
    window.sessionStorage.clear();
  }
});

test("the seconds change on the deadline's own second boundaries, and only the digit that changes is redrawn", async (t) => {
  const pass = holdTheClock(t);
  await productPage(async (doc) => {
    assert.deepEqual(units(doc), ["00 Days", "00 Hours", "02 Mins", "01 Sec"], "two minutes and 0.4s read 2:01: never less than is left");
    await pass(399);
    assert.deepEqual(units(doc).slice(2), ["02 Mins", "01 Sec"]);
    await pass(1);
    assert.deepEqual(units(doc).slice(2), ["02 Mins", "00 Secs"], "the very moment the second passes, not a second after the page opened");
    await pass(1000);
    assert.deepEqual(units(doc).slice(2), ["01 Min", "59 Secs"]);
    const [tens, ones] = digits(doc, 3);
    const minutes = digits(doc, 2);
    await pass(1000);
    assert.deepEqual(units(doc).slice(2), ["01 Min", "58 Secs"]);
    const [tensAfter, onesAfter] = digits(doc, 3);
    assert.equal(tensAfter, tens, "the 5 stays put");
    assert.notEqual(onesAfter, ones, "the 9 gives way to the 8, which rolls in");
    assert.deepEqual(digits(doc, 2), minutes, "the minutes did not change, so they are not redrawn");
  }, { deals: [liveDeal({ endsAt: at(2 * MINUTE + 400) })] });
});

test("a deadline that has passed, or cannot be read, never shows a timer: no zeros, no negative numbers", () => {
  const now = Date.parse("2026-11-10T00:00:00.000Z");
  for (const endsAt of ["2026-11-09T23:59:59.000Z", "2026-11-10T00:00:00.000Z", "soon"])
    assert.equal(renderToStaticMarkup(<ProductDeal deal={{ offer: "10% off", code: "SALE10", endsAt }} openedAt={now} />), "", endsAt);
  assert.match(renderToStaticMarkup(<ProductDeal deal={{ offer: "10% off", code: "SALE10", endsAt: "2027-02-18T00:00:00.000Z" }} openedAt={now} />).replace(/<[^>]+>/g, ""), /100 Days00 Hours00 Mins00 Secs/, "a hundred days and more still fit");
});

/* ── The placeholder ─────────────────────────────────────────────────────────── */

test("the placeholder offer stays out unless it is explicitly switched on", () => {
  const content = structuredClone(defaultStorefrontContent);
  for (const env of [{}, { CAMPAIGN_DEAL_DEMO: "" }, { CAMPAIGN_DEAL_DEMO: "0" }, { NODE_ENV: "production" }, { NODE_ENV: "production", CAMPAIGN_DEAL_DEMO: "1" }])
    assert.deepEqual(campaignDeals(withDemoCampaignDeal(content, env).campaigns), [], JSON.stringify(env));
});

test("switched on, the placeholder travels the real path: a valid campaign whose schedule sets a fixed end", () => {
  const original = structuredClone(defaultStorefrontContent);
  const content = withDemoCampaignDeal(original, { CAMPAIGN_DEAL_DEMO: "1" });
  assert.equal(storefrontContentSchema.safeParse(content).success, true);
  const [deal, ...others] = documentDeals(content);
  assert.deepEqual(others, []);
  assert.deepEqual({ offer: deal?.offer, code: deal?.code, endsAt: deal?.endsAt }, { offer: "30% off", code: "SALE30", endsAt: "2027-02-13T18:30:00.000Z" });
  assert.deepEqual(original, structuredClone(defaultStorefrontContent), "the document it was given is left as it was");
});

test("the placeholder gives way to a real campaign offer, and never runs on an outage's bundled copy", () => {
  const real = publishedWith({ deal: { offer: "20% off", code: "REAL20" }, schedule: { startsAt: null, endsAt: "2099-01-01T00:00:00.000Z" } });
  assert.deepEqual(documentDeals(withDemoCampaignDeal(real, { CAMPAIGN_DEAL_DEMO: "1" })).map((deal) => deal.code), ["REAL20"]);
  assert.deepEqual(documentDeals(withDemoCampaignDeal({ ...structuredClone(defaultStorefrontContent), campaignsAvailable: false }, { CAMPAIGN_DEAL_DEMO: "1" })), []);
});

test("the switch reaches the page through the content reader", async () => {
  const before = process.env.CAMPAIGN_DEAL_DEMO;
  const unpublished = (async () => Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 })) as unknown as typeof fetch;
  try {
    delete process.env.CAMPAIGN_DEAL_DEMO;
    assert.deepEqual(documentDeals(await readPublishedContent(unpublished)), []);
    process.env.CAMPAIGN_DEAL_DEMO = "1";
    assert.deepEqual(documentDeals(await readPublishedContent(unpublished)).map((deal) => deal.code), ["SALE30"]);
  } finally {
    if (before === undefined) delete process.env.CAMPAIGN_DEAL_DEMO;
    else process.env.CAMPAIGN_DEAL_DEMO = before;
  }
});

/* ── The admin ───────────────────────────────────────────────────────────────── */

async function campaignEditor(initial = structuredClone(defaultStorefrontContent)) {
  let content = initial;
  function Editor() {
    const [value, setValue] = useState(initial);
    return <CampaignFields content={value} onChange={(next) => { content = next; setValue(next); }} />;
  }
  const container = document.getElementById("root")!;
  const root = createRoot(container);
  await act(async () => root.render(<Editor />));
  const section = () => container.querySelector("[aria-label='Product page timer']");
  return {
    section,
    get content() { return content; },
    click: async (label: string) => {
      const found = [...section()!.querySelectorAll("button")].find((button) => (button.getAttribute("aria-label") ?? button.textContent) === label);
      assert.ok(found, `Expected the ${label} control`);
      await act(async () => found.click());
    },
    fill: async (label: string, value: string) => {
      const field = section()!.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
      assert.ok(field, `Expected the ${label} field`);
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(field, value);
        field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
    },
    dispose: async () => { await act(async () => root.unmount()); },
  };
}

test("staff give a campaign its offer and code beside its schedule; the draft stays valid and other campaigns stay as they were", async () => {
  const initial = structuredClone(defaultStorefrontContent);
  const ui = await campaignEditor(initial);
  try {
    assert.ok(ui.section(), "the timer controls sit with the campaign");
    assert.equal(ui.content.campaigns[0]!.deal, undefined, "opening the campaign adds nothing");
    await ui.click("Add a timer offer");
    await ui.fill("Timer offer", "30% off");
    await ui.fill("Timer offer code", "sale 30");
    assert.deepEqual(ui.content.campaigns[0]!.deal, { offer: "30% off", code: "SALE30" }, "codes are typed as the shopper will see them");
    assert.equal(storefrontContentSchema.safeParse(ui.content).success, true);
    assert.deepEqual(ui.content.campaigns.slice(1), initial.campaigns.slice(1));
  } finally {
    await ui.dispose();
  }
});

test("the form says what is missing: a clear offer, a usable code, and an end to count down to", async () => {
  const ui = await campaignEditor();
  try {
    await ui.click("Add a timer offer");
    assert.match(text(ui.section())!, /Describe the offer/);
    assert.match(text(ui.section())!, /Use 2–24 capital letters, numbers, % or -/);
    assert.match(text(ui.section())!, /Add an end time to the campaign schedule/);
    await ui.fill("Timer offer", "30% off");
    await ui.fill("Timer offer code", "SALE30");
    assert.doesNotMatch(text(ui.section())!, /Describe the offer|Use 2–24 capital letters/);
  } finally {
    await ui.dispose();
  }
});

test("with an end on the schedule the form names it, in India's time", async () => {
  const initial = structuredClone(defaultStorefrontContent);
  initial.campaigns[0] = { ...initial.campaigns[0]!, deal: { offer: "30% off", code: "SALE30" }, schedule: { startsAt: null, endsAt: "2027-02-13T18:30:00.000Z" } };
  const ui = await campaignEditor(initial);
  try {
    assert.match(text(ui.section())!, /Counts down to 14 February 2027, 12:00 am IST/);
    assert.doesNotMatch(text(ui.section())!, /Add an end time/);
  } finally {
    await ui.dispose();
  }
});

test("the form says when the schedule's end has passed, so staff know why the pages show no timer", async () => {
  const initial = structuredClone(defaultStorefrontContent);
  initial.campaigns[0] = { ...initial.campaigns[0]!, deal: { offer: "30% off", code: "SALE30" }, schedule: { startsAt: null, endsAt: "2026-01-01T00:00:00.000Z" } };
  const ui = await campaignEditor(initial);
  try {
    assert.match(text(ui.section())!, /This end has passed, so product pages show no timer\. Move the end in the schedule above to run it again\./);
    assert.doesNotMatch(text(ui.section())!, /Counts down to/);
  } finally {
    await ui.dispose();
  }
});

test("removing the offer leaves no field behind and keeps the campaign's schedule", async () => {
  const initial = structuredClone(defaultStorefrontContent);
  const schedule = { startsAt: null, endsAt: "2027-02-13T18:30:00.000Z" };
  initial.campaigns[0] = { ...initial.campaigns[0]!, deal: { offer: "30% off", code: "SALE30" }, schedule };
  const ui = await campaignEditor(initial);
  try {
    await ui.click("Remove the timer offer");
    assert.equal("deal" in JSON.parse(JSON.stringify(ui.content.campaigns[0])), false);
    assert.deepEqual(ui.content.campaigns[0]!.schedule, schedule);
  } finally {
    await ui.dispose();
  }
});
