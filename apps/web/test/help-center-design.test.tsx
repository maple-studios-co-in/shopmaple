import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import ServicePage from "../app/pages/[slug]/page";

// The Help Center follows the "Maple Website review" design; Bulk Enquiry keeps its look on
// utilities. Both reach markup through data-* hooks only.
async function element(slug: string, query: Record<string, string> = {}) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 });
  try {
    return await ServicePage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(query) });
  } finally {
    globalThis.fetch = previous;
  }
}
const render = async (slug: string, query: Record<string, string> = {}) =>
  new JSDOM(renderToStaticMarkup(await element(slug, query))).window.document;
const address = "A-2/56-57, W.H.S., Kirti Nagar, New Delhi, Delhi, 110015";

test("help center hero: eyebrow, accented headline, contact rows, map card and enquiry card", async () => {
  const doc = await render("contact");
  const intro = doc.querySelector('[data-service-section="intro"]')!;
  assert.ok(intro.closest("[data-store]"), "the rebuilt hero sits inside the scoped storefront base");
  assert.equal(doc.querySelector("[data-contact-eyebrow]")?.textContent, "GET IN TOUCH");
  const h1 = doc.querySelector("h1")!;
  assert.equal(h1.textContent, "Tell us what you need. We’ll help you shape it");
  assert.equal(h1.querySelector("[data-heading-accent]")?.textContent, "you shape it");
  const rows = [...doc.querySelectorAll<HTMLAnchorElement>("[data-contact-links] a")];
  assert.deepEqual(rows.map((row) => row.getAttribute("href")), [
    "tel:+918796130252",
    "mailto:contact@maplefurnishers.com",
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
  ]);
  for (const row of rows) assert.ok(row.querySelector("svg[aria-hidden=true]"), "each contact row has a decorative icon");
  const map = doc.querySelector("[data-map-card]")!;
  const mapLink = map.querySelector<HTMLAnchorElement>("a")!;
  assert.match(mapLink.textContent ?? "", /View on Google Maps/);
  assert.equal(mapLink.getAttribute("href"), `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`);
  assert.equal(mapLink.getAttribute("target"), "_blank");
  assert.match(mapLink.getAttribute("rel") ?? "", /noreferrer/);
  const form = doc.querySelector("[data-enquiry-form]")!;
  assert.ok(form.closest("[data-enquiry-card]"));
  for (const field of form.querySelectorAll("input, textarea")) {
    const label = field.closest("label");
    assert.ok(label?.textContent?.trim(), `${field.getAttribute("name")} has a real label`);
  }
  assert.deepEqual([...form.querySelectorAll("input, textarea")].map((field) => field.getAttribute("name")), ["name", "email", "phone", "message"]);
  assert.ok(form.querySelector('input[name="email"][required][type="email"]'));
  assert.equal(form.querySelector('input[name="name"][required]'), null, "contact keeps its optional name");
  assert.equal(form.querySelector("[data-enquiry-note]")?.textContent, "Your information is safe with us");
  const submit = form.querySelector('button[type="submit"]')!;
  assert.match(submit.textContent ?? "", /Send Enquiry/);
});

test("help center topics: eyebrow, italic heading, category list, FAQ and support strip", async () => {
  const doc = await render("contact");
  const help = doc.querySelector('[data-service-section="help"]')!;
  assert.ok(help.closest("[data-store]"));
  assert.deepEqual([...help.querySelectorAll("[data-section-title] p, [data-section-title] h2")].map((n) => n.textContent), ["Everything we do starts with why", "Browse from category"]);
  const buttons = [...help.querySelectorAll<HTMLButtonElement>("[data-help-categories] button")];
  assert.deepEqual(buttons.map((b) => b.querySelector("strong")?.textContent), ["Order Tracking And Delivery", "Payment & Invoice", "Manage Account", "Warranty", "Damaged Or Defective Item"]);
  assert.deepEqual(buttons.map((b) => b.getAttribute("aria-pressed")), ["true", "false", "false", "false", "false"]);
  assert.equal(buttons[0]!.getAttribute("data-active"), "true");
  assert.equal(help.querySelectorAll("[data-help-answers] details").length, 5);
  const support = help.querySelector("[data-help-support]")!;
  assert.match(support.textContent ?? "", /Still need help\?/);
  assert.match(support.textContent ?? "", /Account sign-in and order tracking are not available/);
  const contact = support.querySelector<HTMLAnchorElement>('a[href="mailto:contact@maplefurnishers.com"]')!;
  assert.match(contact.textContent ?? "", /Contact Support/);
  assert.deepEqual([...doc.querySelectorAll("h1, h2, h3")].map((n) => n.tagName).slice(0, 2), ["H1", "H2"]);
});

test("help center and bulk enquiry carry no legacy page classes and leave the shared cities band alone", async () => {
  for (const slug of ["contact", "bulk-enquiry"]) {
    const doc = await render(slug, { product: "Aera chair", pincode: "110015" });
    assert.equal(doc.querySelector('[class*="cp-"]'), null, `${slug} uses utilities, not contact-parity rules`);
    assert.ok(doc.querySelector("[data-store]"));
    assert.ok(doc.querySelector("[data-enquiry-context]")?.closest("[data-store]"));
    assert.equal(doc.querySelector(".home-cities")?.closest("[data-store]"), null, `${slug} keeps the cities band outside the scoped base`);
  }
  const bulk = await render("bulk-enquiry");
  assert.ok(bulk.querySelector('[data-service-section="hero"] form button[type="submit"]')?.textContent?.includes("Request Proposal"));
  assert.equal(bulk.querySelector("[data-business-cta] a")?.getAttribute("target"), "_blank");
  assert.equal(bulk.querySelectorAll("[data-divider]").length, 3);
});

test("contact-parity.css keeps only the rules the returns form still uses", () => {
  const css = readFileSync(new URL("../styles/contact-parity.css", import.meta.url), "utf8");
  const classes = new Set([...css.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((match) => match[1]));
  const allowed = new Set(["cp-form", "cp-form-pair", "cp-email-note", "cp-enquiry-context", "button"]);
  assert.deepEqual([...classes].filter((name) => !allowed.has(name!)), []);
});

async function mounted(slug: string, query: Record<string, string>, run: (doc: Document, posts: unknown[]) => Promise<void>) {
  const page = await element(slug, query);
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/pages/" + slug });
  const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, FormData: globalThis.FormData };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  // The form reads its fields with FormData, which must be the window's own to accept a jsdom form.
  globalThis.FormData = dom.window.FormData as unknown as typeof FormData;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
  const posts: unknown[] = [];
  let reply: () => Response = () => Response.json({ reference: "enq_" + "0".repeat(8) + "-0000-0000-0000-" + "0".repeat(12), mode: "preview", notificationSent: false });
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "/api/enquiries");
    assert.equal(init?.method, "POST");
    assert.ok(new Headers(init?.headers).get("Idempotency-Key"));
    posts.push(JSON.parse(String(init?.body)));
    return reply();
  };
  (posts as unknown as { fail: () => void }).fail = () => { reply = () => new Response("", { status: 429 }); };
  const root = createRoot(dom.window.document.getElementById("root")!);
  try {
    await act(async () => root.render(page));
    await run(dom.window.document, posts);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    dom.window.close();
  }
}
function fill(doc: Document, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    const field = doc.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")!.set!;
    setter.call(field, value);
    field.dispatchEvent(new doc.defaultView!.Event("input", { bubbles: true }));
  }
}

test("help center form submits the same contact enquiry, with query context, and reports success and failure", async () => {
  await mounted("contact", { product: "Aera chair", variant: "Cream", sku: "AE-1", pincode: "110015" }, async (doc, posts) => {
    assert.equal(doc.querySelector("[data-enquiry-context] strong")?.textContent, "Aera chair");
    await act(async () => fill(doc, { name: "Asha", email: "Asha@Example.com", phone: "9876543210", message: "A sofa" }));
    await act(async () => doc.querySelector<HTMLButtonElement>('[data-enquiry-form] button[type="submit"]')!.click());
    assert.deepEqual(posts[0], {
      kind: "contact", name: "Asha", email: "asha@example.com", phone: "9876543210", message: "A sofa",
      context: { product: "Aera chair", variant: "Cream", sku: "AE-1", pincode: "110015" },
    });
    assert.match(doc.querySelector('[data-enquiry-form] [role="status"]')?.textContent ?? "", /Your enquiry has been saved\. Reference: enq_/);
    (posts as unknown as { fail: () => void }).fail();
    await act(async () => fill(doc, { message: "A bed" }));
    await act(async () => doc.querySelector<HTMLButtonElement>('[data-enquiry-form] button[type="submit"]')!.click());
    assert.equal(doc.querySelector('[data-enquiry-form] [role="alert"]')?.textContent, "Too many enquiries. Please try again later.");
    assert.equal(doc.querySelectorAll('[data-enquiry-form] [role="status"]').length, 0, "the failure replaces the earlier confirmation");
    assert.equal((posts[1] as { message: string }).message, "A bed");
  });
});

test("bulk enquiry form still submits a bulk enquiry without a message", async () => {
  await mounted("bulk-enquiry", {}, async (doc, posts) => {
    assert.equal(doc.querySelectorAll("[data-enquiry-form] textarea").length, 0);
    await act(async () => fill(doc, { name: "Ravi", email: "ravi@example.com", phone: "9876543210" }));
    await act(async () => doc.querySelector<HTMLButtonElement>('[data-enquiry-form] button[type="submit"]')!.click());
    assert.deepEqual(posts[0], { kind: "bulk", name: "Ravi", email: "ravi@example.com", phone: "9876543210", message: "", context: { product: "", variant: "", sku: "", pincode: "" } });
    assert.match(doc.querySelector('[data-enquiry-form] [role="status"]')?.textContent ?? "", /Reference: enq_/);
  });
});
