import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { orderConfirmationBody, orderConfirmationSample } from "@shopmaple/contracts/whatsapp";
import * as previewRoute from "../app/previews/whatsapp/page";
import { minimalChrome, StoreChromeView } from "../components/admin/store-chrome";

// The WhatsApp order confirmation's development preview (owner, 11 Nov 2026), rendered on the server with the catalogue
// answering through a stand-in fetch.
const realFetch = globalThis.fetch;
const environment = process.env as Record<string, string | undefined>;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const nola = {
  id: "keeri:maple:nola",
  handle: "nola",
  title: "Nola",
  description: "",
  category: "chairs",
  images: ["https://cdn.shopify.com/s/files/1/0001/nola.webp"],
  published: true,
  source: "keeri",
  sourceUpdatedAt: "2026-11-01T00:00:00.000Z",
  variants: [],
};
const store = "https://store.maplefurnishers.com";
// The store's address is a setting (SITE_URL; site-address.ts, #126); unset, it would be the local development address.
environment.SITE_URL = store;
const order = `/account/orders/${orderConfirmationSample.orderNumber}`;

async function render(catalogue: () => Response, query?: Record<string, string>) {
  const paths: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    paths.push(new URL(String(input)).pathname);
    return catalogue();
  }) as typeof fetch;
  const html = renderToStaticMarkup(await previewRoute.default(query ? { searchParams: Promise.resolve(query) } : undefined));
  return { doc: new JSDOM(html).window.document, paths };
}

// Runs first: the catalogue keeps a product it found for 30 seconds, but never a failed read.
test("without the Nola chair in the catalogue, the designed header image is still drawn, with the frames' own photograph", async () => {
  const { doc } = await render(() => {
    throw new Error("catalogue offline");
  });
  const images = [...doc.querySelectorAll("article img")];
  assert.equal(images.length, 2);
  for (const image of images) assert.equal(image.getAttribute("src"), "/whatsapp/order-media/preview-sample", "the sage panel and its words, never a bare photo");
});

// Catches the preview drawing anything but the builder's message, a missing rendition, or the media route unused.
test("the preview shows the builder's Figma sample on a phone and in WhatsApp Desktop", async () => {
  const { doc, paths } = await render(() => Response.json(nola));
  assert.deepEqual(paths, ["/api/products/nola"]);
  assert.deepEqual([...doc.querySelectorAll("h2")].map((heading) => heading.textContent), ["On a phone", "On WhatsApp Desktop and Web", "As submitted to Meta"]);
  const [phone, desktop] = [...doc.querySelectorAll("article")];
  assert.ok(phone && desktop);
  for (const bubble of [phone, desktop]) {
    const image = bubble.querySelector("img")!;
    assert.equal(image.getAttribute("src"), "/whatsapp/order-media/nola", "the header image comes from the media route");
    assert.equal(image.getAttribute("width"), "1200");
    assert.equal(image.getAttribute("height"), "630");
  }
  // On a phone (Figma 394:1456): the title, the body in the frame's groups, and the two ruled buttons.
  assert.equal(phone.querySelector(".wa-phone-title")?.textContent, "Order confirmed");
  assert.deepEqual(
    [...phone.querySelectorAll(".wa-phone-text")].map((paragraph) => [paragraph.innerHTML, paragraph.classList.contains("is-muted")]),
    [
      ["Hi Aditi, thank you for choosing Maple.", false],
      ["#MF-10482<br>Nola Accent Chair × 1<br>Amount paid: ₹26,400", false],
      ["Estimated delivery: 24–28 Nov 2026<br>Bengaluru · 560001", true],
      ["We’ll send tracking once dispatched.", true],
    ],
  );
  assert.deepEqual([...phone.querySelectorAll("a")].map((link) => [link.textContent, link.getAttribute("href")]), [
    ["View order→", order],
    ["Contact Maple", "/contact"],
  ]);
  assert.equal(phone.querySelectorAll(".wa-phone-rule").length, 2);
  // In WhatsApp Desktop: the body as WhatsApp receives it, its title bold, the time, and the URL buttons.
  const text = desktop.querySelector(".wa-bubble-text")!;
  assert.equal(text.querySelector("strong")?.textContent, "Order confirmed");
  assert.equal(text.textContent, orderConfirmationBody
    .replace("*Order confirmed*", "Order confirmed")
    .replace("{{1}}", "Aditi").replace("{{2}}", "MF-10482").replace("{{3}}", "Nola Accent Chair × 1").replace("{{4}}", "₹26,400")
    .replace("{{5}}", "24–28 Nov 2026").replace("{{6}}", "Bengaluru · 560001") + "10:42");
  assert.deepEqual([...desktop.querySelectorAll("a")].map((link) => [link.textContent, link.getAttribute("href")]), [
    ["View order", order],
    ["Contact Maple", "/contact"],
  ]);
  assert.equal(doc.querySelector(".wa-contact-name")?.textContent, "Maple Furnishers");
  // As submitted: the exact body, and this order as the Cloud API sends it.
  const [body, payload] = [...doc.querySelectorAll("pre.wa-code")];
  assert.equal(body?.textContent, orderConfirmationBody);
  const sent = JSON.parse(payload!.textContent!);
  assert.equal(sent.name, "order_confirmation");
  assert.equal(sent.components[0].parameters[0].image.link, `${store}/whatsapp/order-media/nola`);
  assert.equal(sent.components[2].parameters[0].text, orderConfirmationSample.orderNumber);
  assert.match(doc.body.textContent!, /UTILITY/);
  assert.match(doc.body.textContent!, new RegExp(`View order: ${store}/account/orders/\\{\\{1\\}\\}`));
});

// Catches the long-order view drifting from the builder's limits (one line per value, a count for the extra pieces).
test("?order=long shows a long name, five pieces and a window across the new year", async () => {
  const { doc } = await render(() => Response.json(nola), { order: "long" });
  assert.equal(doc.querySelector(".wa-preview-orders [aria-current='page']")?.textContent, "A long name and five pieces");
  const phone = doc.querySelector(".wa-phone")!;
  assert.deepEqual([...phone.querySelectorAll(".wa-phone-text")].map((paragraph) => paragraph.innerHTML).slice(0, 3), [
    "Hi Ananthapadmanabhan, thank you for choosing Maple.",
    "#MF-2004817<br>Nola Accent Chair × 2, Terra Three Seater Sofa in Sage Bouclé × 1, Oak Side Table × 1 and 2 more pieces<br>Amount paid: ₹1,84,500.50",
    "Estimated delivery: 29 Dec 2026 – 4 Jan 2027<br>Thiruvananthapuram · 695001",
  ]);
  assert.match(doc.querySelector(".wa-bubble-text")!.textContent!, /Oak Side Table × 1 and 2 more pieces\nAmount paid: ₹1,84,500\.50/);
});

// Catches the preview leaking into the live store or its search listing.
test("the preview is development only and never indexed", async () => {
  assert.deepEqual(previewRoute.metadata.robots, { index: false, follow: false });
  assert.equal(previewRoute.dynamic, "force-dynamic");
  const previous = environment.NODE_ENV;
  environment.NODE_ENV = "production";
  try {
    await assert.rejects(() => previewRoute.default(), (error: { digest?: string }) => error.digest === "NEXT_HTTP_ERROR_FALLBACK;404");
  } finally {
    environment.NODE_ENV = previous;
  }
});

// Catches the store's header and footer wrapping the preview, or other paths losing them.
test("the store's own header and footer step aside for /previews", () => {
  assert.equal(minimalChrome("/previews/whatsapp"), "preview");
  for (const path of ["/preview/whatsapp", "/previewsx", "/products/previews", "/"]) assert.equal(minimalChrome(path), null, path);
  assert.equal(renderToStaticMarkup(<StoreChromeView path="/previews/whatsapp"><p>page</p></StoreChromeView>), "<p>page</p>");
});
