import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { installUiDom } from "./support/ui-dom";
// Staff see a product page's custom request in the inbox: a Custom filter and the requested options on the detail.
const dom = installUiDom();
const { createRoot } = await import("react-dom/client");
const { EnquiryInbox } = await import("../components/admin/enquiry-inbox");
const container = document.getElementById("root")!;
const page = document.body;
const session = { user: { id: "staff", email: "staff@example.invalid", role: "editor" as const }, csrfToken: "a".repeat(64) };
const row = { id: "enq_00000000-0000-4000-8000-000000000009", kind: "custom", status: "new", version: 0, assignedToId: null, contactId: null, name: "Asha Rao", product: "Aero Dining Chair", nextDueOn: null, createdAt: "2026-11-01T00:00:00.000Z" };
const detail = { ...row, email: "asha@example.invalid", phone: "9811000000", message: "Can the arms be a little lower?", lostReason: null, reviews: [],
  context: { product: "Aero Dining Chair", handle: "aero-dining-chair", variant: "Deep Atlantic", sku: "AERO-A", pincode: "110015", fabric: "Olive boucle", finish: "Walnut legs", size: "Seat width 60 cm", quantity: 6 } };
const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim();

test("the inbox filters custom requests and lays out the requested fabric, finish, size and quantity", async () => {
  const previous = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes("/assignees") || String(url).includes("/activity") || String(url).includes("/delivery")) return Response.json({ items: [], nextCursor: null });
    return Response.json(String(url).includes(row.id) ? detail : { items: [row], nextCursor: null });
  };
  const root = createRoot(container);
  try {
    await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => { throw Error("unexpected expiry"); }} />));
    const kind = page.querySelector<HTMLSelectElement>('[aria-label="Enquiry kind"]')!;
    assert.ok([...kind.options].some((option) => option.value === "custom" && option.textContent === "Custom"), "Custom is a kind staff can filter by");
    await act(async () => { kind.value = "custom"; kind.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    assert.ok(urls.some((url) => url.includes("kind=custom")));
    assert.match(page.textContent!, /Custom enquiry/);
    const open = [...page.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Open enquiry")!;
    await act(async () => open.click());
    const requested = page.querySelector("[data-custom-options]");
    assert.ok(requested, "The detail has a requested-options block");
    const pairs = [...requested.querySelectorAll("dt")].map((dt) => [text(dt), text(dt.nextElementSibling)]);
    assert.deepEqual(pairs, [["Fabric", "Olive boucle"], ["Finish", "Walnut legs"], ["Size or dimensions", "Seat width 60 cm"], ["Quantity", "6"]]);
    assert.equal(requested.querySelector("a")?.getAttribute("href"), "/products/aero-dining-chair");
    assert.match(text(requested)!, /No deposit/);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});
