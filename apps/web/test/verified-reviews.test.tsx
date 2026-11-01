import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Cart, Product, ProductHighlights, ProductReviews } from "@shopmaple/contracts";
import { ProductDetail } from "../components/product-detail";
import { ShopProvider } from "../components/shop-provider";
import { ProductHighlightsProvider } from "../components/store/product-highlights";
import { ReviewForm } from "../components/store/review-form";
import ReviewsExplained from "../app/reviews/page";
import NewReviewPage from "../app/reviews/new/page";

const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3000/products/aero-dining-chair" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData, IS_REACT_ACT_ENVIRONMENT: true });
const product: Product = {
  id: "aero", handle: "aero-dining-chair", title: "Aero Dining Chair", description: "", category: "chairs", images: ["https://example.com/aero-1.jpg"],
  published: true, source: "shopify-preview", sourceUpdatedAt: "2026-10-26T00:00:00Z",
  variants: [{ id: "atlantic", title: "Deep Atlantic", sku: "AERO-A", pricePaise: 2_360_000, compareAtPaise: null, available: true, stockPolicy: "stocked" }],
};
// A staff-typed rating in the card highlights: the product page must ignore it.
const typed: ProductHighlights = { swatches: [], products: [{ handle: "aero-dining-chair", isNew: false, rating: { value: 4.9, count: 300 } }] };
const approved: ProductReviews = {
  average: 4.5, count: 2,
  reviews: [
    { id: "rev_00000000-0000-4000-8000-000000000001", rating: 5, title: "Sturdy and lovely", body: "Comfortable for long dinners.", displayName: "Asha", city: "Pune", createdAt: "2026-10-30T10:00:00.000Z" },
    { id: "rev_00000000-0000-4000-8000-000000000002", rating: 4, title: "Good chair", body: "The fabric cleans easily.", displayName: "Vikram", city: null, createdAt: "2026-10-29T10:00:00.000Z" },
  ],
};
const empty: Cart = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" };
const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim();

async function mountProduct(reviews: ProductReviews | null, check: (doc: Document) => void) {
  const previous = globalThis.fetch;
  globalThis.fetch = (async () => Response.json(empty)) as typeof fetch;
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  try {
    await act(async () => root.render(<AppRouterContext.Provider value={router}><ProductHighlightsProvider value={typed}><ShopProvider>
      <ProductDetail product={product} reviews={reviews} />
    </ShopProvider></ProductHighlightsProvider></AppRouterContext.Provider>));
    check(document);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
}

test("the product page ignores staff-typed ratings: without approved reviews it shows none", async () => {
  await mountProduct(null, (doc) => {
    assert.equal(doc.querySelector("[data-product-info] [data-rating]") === null, true);
    assert.equal(doc.querySelector("[data-rating-summary]") === null, true);
    assert.equal(doc.querySelector("[data-review-card]") === null, true);
    assert.match(text(doc.querySelector("[data-reviews-note]"))!, /^No reviews to show yet\./);
  });
  await mountProduct({ average: null, count: 0, reviews: [] }, (doc) => {
    assert.equal(doc.querySelector("[data-product-info] [data-rating]") === null, true);
    assert.match(text(doc.querySelector("[data-reviews-note]"))!, /^No reviews to show yet\./);
  });
});

test("approved reviews give the rating line, the band's average and count, and Verified buyer cards", async () => {
  await mountProduct(approved, (doc) => {
    assert.equal(text(doc.querySelector("[data-product-info] [data-rating]")), "4.5");
    const summary = doc.querySelector("[data-rating-summary]")!;
    assert.equal(text(summary), "4.5 2 reviews");
    assert.equal(summary.getAttribute("aria-label"), "Rated 4.5 out of 5 from 2 reviews");
    assert.equal(doc.querySelector("[data-reviews-note]") === null, true);
    const cards = [...doc.querySelectorAll("[data-review-card]")];
    assert.equal(cards.length, 2);
    assert.equal(text(cards[0]!.querySelector("h3")), "Sturdy and lovely");
    assert.match(text(cards[0])!, /Comfortable for long dinners\./);
    assert.match(text(cards[0])!, /Asha, Pune/);
    assert.match(text(cards[0])!, /Verified buyer/);
    assert.equal(cards[0]!.querySelector("[data-review-stars]")?.getAttribute("aria-label"), "Rated 5 out of 5");
    assert.match(text(cards[1])!, /Vikram/);
    assert.doesNotMatch(text(cards[1])!, /Vikram,/, "No city, no trailing comma");
  });
});

test("Write a review explains how reviews work instead of opening the contact form", async () => {
  await mountProduct(null, (doc) => {
    const write = doc.querySelector<HTMLAnchorElement>("a[data-write-review]")!;
    assert.equal(write.getAttribute("href"), "/reviews");
  });
  const page = new JSDOM(renderToStaticMarkup(<ReviewsExplained />)).window.document;
  assert.match(text(page.body)!, /after (your order is|it is) delivered/i);
  assert.match(text(page.body)!, /email/i);
  assert.match(text(page.body)!, /read every review/i);
});

async function newReviewPage(token: string | undefined, respond: (url: string) => Response) {
  const previous = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => { seen.push(String(input)); return respond(String(input)); }) as typeof fetch;
  try {
    const element = await NewReviewPage({ searchParams: Promise.resolve(token ? { token } : {}) });
    return { doc: new JSDOM(renderToStaticMarkup(element)).window.document, seen };
  } finally { globalThis.fetch = previous; }
}
const token = `rvi_00000000-0000-4000-8000-000000000009.${"A".repeat(43)}`;

test("the review form opens only for a valid link and says why otherwise", async () => {
  const valid = await newReviewPage(token, () => Response.json({ productTitle: "Aero Dining Chair", variantTitle: "Deep Atlantic", productHandle: "aero-dining-chair" }));
  assert.ok(valid.doc.querySelector("form[data-review-form]"));
  assert.match(text(valid.doc.body)!, /Aero Dining Chair/);
  assert.match(valid.seen[0]!, /\/api\/reviews\/invitation\?token=/);
  for (const [status, message] of [[404, /not valid/i], [410, /already|expired/i]] as const) {
    const refused = await newReviewPage(token, () => Response.json({ code: "X", message: "x" }, { status }));
    assert.equal(refused.doc.querySelector("form[data-review-form]") === null, true);
    assert.match(text(refused.doc.body)!, message);
  }
  const none = await newReviewPage(undefined, () => { throw Error("No request without a token"); });
  assert.equal(none.doc.querySelector("form[data-review-form]") === null, true);
  assert.equal(none.seen.length, 0);
});

async function mountForm(respond: (init: RequestInit) => Response) {
  const calls: RequestInit[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => { calls.push(init!); return respond(init!); }) as typeof fetch;
  const root = createRoot(document.getElementById("root")!);
  await act(async () => root.render(<ReviewForm token={token} invitation={{ productTitle: "Aero Dining Chair", variantTitle: "Deep Atlantic", productHandle: "aero-dining-chair" }} />));
  const form = document.querySelector<HTMLFormElement>("form[data-review-form]")!;
  assert.equal(form !== null, true, "The review form renders");
  const field = (name: string) => form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!;
  const submit = () => act(async () => { form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
  const done = async () => { await act(async () => root.unmount()); globalThis.fetch = previous; };
  return { calls, form, field, submit, done };
}

test("a buyer rates, writes and sends a review once; the form thanks them", async () => {
  const view = await mountForm(() => Response.json({ status: "pending" }, { status: 201 }));
  try {
    assert.equal(view.form.querySelectorAll('input[type="radio"][name="rating"]').length, 5);
    view.form.querySelector<HTMLInputElement>('input[name="rating"][value="4"]')!.checked = true;
    view.field("title").value = "Sturdy and lovely";
    view.field("body").value = "Comfortable for long dinners and easy to clean.";
    view.field("displayName").value = "Asha";
    view.field("city").value = "Pune";
    await view.submit();
    assert.equal(view.calls.length, 1);
    assert.equal(view.calls[0]!.method, "POST");
    assert.deepEqual(JSON.parse(String(view.calls[0]!.body)), { token, rating: 4, title: "Sturdy and lovely", body: "Comfortable for long dinners and easy to clean.", displayName: "Asha", city: "Pune" });
    assert.equal(document.querySelector("form[data-review-form]") === null, true);
    assert.match(text(document.querySelector("[data-review-thanks]"))!, /Thank you/);
  } finally { await view.done(); }
});

test("the form asks for a rating before sending and explains a used link", async () => {
  const view = await mountForm(() => Response.json({ code: "REVIEW_LINK_USED", message: "A review has already been written with this link. Thank you!" }, { status: 410 }));
  try {
    view.field("title").value = "Good";
    view.field("body").value = "Comfortable for long dinners.";
    view.field("displayName").value = "Asha";
    await view.submit();
    assert.equal(view.calls.length, 0);
    assert.match(text(view.form.querySelector("[role='alert']"))!, /choose a star rating/i);
    view.form.querySelector<HTMLInputElement>('input[name="rating"][value="5"]')!.checked = true;
    await view.submit();
    assert.equal(view.calls.length, 1);
    assert.match(text(document.querySelector("[role='alert']"))!, /already been written/);
  } finally { await view.done(); }
});
