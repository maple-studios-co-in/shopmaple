import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fakeFetch, installDom, setValue } from "./support/crm-fixtures";

// The Return & Exchange frame (Figma 150:3952, mobile 150:4558): the Help page head, then "Find your order",
// which hands the order number to the care team as an enquiry, since the store has no order lookup.
const { dom, container } = installDom();
// As in the other mounted-page tests: next/link schedules its prefetch through `self`, and the form reads
// its fields with the window's own FormData.
Object.assign(globalThis, { self: dom.window, FormData: dom.window.FormData });
const { createRoot } = await import("react-dom/client");
const { ReturnsPageContent } = await import("../components/service-pages");
const { resolveServicePages } = await import("../lib/service-page-defaults");
const { resolveSiteChrome } = await import("../lib/site-chrome-defaults");

const content = resolveServicePages(undefined).returns;
const footer = resolveSiteChrome(undefined).footer;
const text = (element: Element | null | undefined) => (element?.textContent ?? "").replace(/\s+/g, " ").trim();
const field = (name: string) => container.querySelector<HTMLInputElement>(`input[name="${name}"]`);

async function mount(transport: typeof fetch) {
  const previous = globalThis.fetch;
  globalThis.fetch = transport;
  const root = createRoot(container);
  await act(async () => root.render(<ReturnsPageContent content={content} footer={footer} />));
  return async () => { await act(async () => root.unmount()); globalThis.fetch = previous; };
}
async function submit() {
  const form = container.querySelector("form")!;
  await act(async () => { form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

// Catches the page losing a part of the frame, or its editable heading and line no longer being used.
test("the Return & Exchange page has the Help head, the Find your order form, the guidance and customer care", () => {
  const doc = parse(renderToStaticMarkup(<ReturnsPageContent content={content} footer={footer} />));
  assert.deepEqual([...doc.querySelectorAll('nav[aria-label="Breadcrumb"] li')].map(text), ["Home", "Help", "Return & Exchange"]);
  assert.deepEqual([...doc.querySelectorAll("[data-help-tabs] a")].filter(link => link.getAttribute("aria-current") === "page").map(link => link.getAttribute("href")), ["/pages/returns"]);
  assert.deepEqual([...doc.querySelectorAll("h1")].map(text), ["Return & Exchange"]);
  assert.equal(text(doc.querySelector("[data-help-opening]")), "Enter your order number and the email you ordered with, and our care team will get back to you about a return or exchange.");
  assert.equal(doc.querySelector("[data-help-photo] img")?.getAttribute("src"), "/media/policies/return-exchange.jpg");
  const form = doc.querySelector("form[data-return-lookup]")!;
  assert.equal(text(form.querySelector("h2")), "Find your order");
  assert.deepEqual([...form.querySelectorAll("label")].map(label => [text(label), label.querySelector("input")?.getAttribute("placeholder")]), [
    ["Order number", "e.g. #1001"],
    ["Email or phone number", "Used when placing your order"],
  ]);
  assert.equal(text(form.querySelector('button[type="submit"]')), "Find your order");
  assert.equal(text(form.querySelector("[data-return-note]")), "You can find your order number in your confirmation email.");
  assert.equal(doc.querySelector('[data-return-help] a')?.getAttribute("href"), "tel:+918796130252");
  const guidance = doc.querySelector("[data-return-guidance]")!;
  assert.equal(text(guidance.querySelector("h2")), "Before you raise a request");
  assert.equal(text(guidance.querySelector("a")), "Read the Refund Policy");
  assert.equal(guidance.querySelector("a")?.getAttribute("href"), "/policies/refund-policy");
  assert.equal(text(doc.querySelector("[data-customer-care] h2")), "A little help, whenever you need it.");
});

// Catches the order number never reaching the care team, or the customer not being told it did.
test("an order number and email are sent to the care team, and the page confirms where the reply will go", async () => {
  const sent: { path: string; body: unknown }[] = [];
  const unmount = await mount(fakeFetch((path, options) => {
    sent.push({ path, body: JSON.parse(String(options?.body)) });
    return Response.json({ reference: "enq_00000000-0000-4000-8000-000000000001", mode: "preview", notificationSent: false }, { status: 201 });
  }) as typeof fetch);
  try {
    await setValue(dom, field("order"), "1001");
    await setValue(dom, field("contact"), "meera@example.invalid");
    await submit();
    assert.deepEqual(sent, [{
      path: "/api/enquiries",
      body: { kind: "contact", name: "", email: "meera@example.invalid", phone: "", message: "Return or exchange request for order #1001.", context: { product: "Return & Exchange", variant: "", sku: "", pincode: "" } },
    }]);
    const status = container.querySelector('[role="status"]');
    assert.match(text(status), /order #1001/);
    assert.match(text(status), /meera@example\.invalid/);
    assert.match(text(status), /enq_00000000-0000-4000-8000-000000000001/);
  } finally { await unmount(); }
});

// Catches a phone number being posted as an email and refused, losing the request without a word.
test("a phone number sends nothing and offers the care team's number instead", async () => {
  let calls = 0;
  const unmount = await mount((async () => { calls++; return Response.json({}); }) as typeof fetch);
  try {
    await setValue(dom, field("order"), "#1001");
    await setValue(dom, field("contact"), "+91 98765 43210");
    await submit();
    assert.equal(calls, 0);
    const alert = container.querySelector('[role="alert"]');
    assert.match(text(alert), /email you ordered with/);
    assert.equal(alert?.querySelector("a")?.getAttribute("href"), "tel:+918796130252");
  } finally { await unmount(); }
});

// Catches a bad field being sent, or the customer not being shown which field to fix.
test("a missing order number is pointed out on its field and nothing is sent", async () => {
  let calls = 0;
  const unmount = await mount((async () => { calls++; return Response.json({}); }) as typeof fetch);
  try {
    await setValue(dom, field("contact"), "meera@example.invalid");
    await submit();
    assert.equal(calls, 0);
    assert.equal(field("order")?.getAttribute("aria-invalid"), "true");
    assert.equal(field("contact")?.getAttribute("aria-invalid"), null);
    const error = dom.window.document.getElementById(field("order")?.getAttribute("aria-describedby")?.split(" ").find(id => id.endsWith("-error")) ?? "");
    assert.equal(text(error), "Enter your order number, for example #1001.");
  } finally { await unmount(); }
});

// Catches an outage looking like success, or leaving the customer with no other way to reach the team.
test("when the request cannot be saved the page says so and gives the care team's email and phone", async () => {
  const unmount = await mount((async () => Response.json({ error: "unavailable" }, { status: 503 })) as typeof fetch);
  try {
    await setValue(dom, field("order"), "#1001");
    await setValue(dom, field("contact"), "meera@example.invalid");
    await submit();
    const alert = container.querySelector('[role="alert"]');
    assert.match(text(alert), /could not be saved/);
    assert.deepEqual([...alert!.querySelectorAll("a")].map(link => link.getAttribute("href")), ["mailto:contact@maplefurnishers.com", "tel:+918796130252"]);
    assert.equal(text(container.querySelector('[role="status"]')), "");
  } finally { await unmount(); }
});

function parse(markup: string) {
  const host = dom.window.document.createElement("div");
  host.innerHTML = markup;
  return host;
}
