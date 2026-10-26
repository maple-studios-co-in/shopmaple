import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { EnquiryInbox } from "../components/admin/enquiry-inbox";
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const container = document.getElementById("root")!;
const session = { user: { id: "staff", email: "staff@example.invalid", role: "editor" as const }, csrfToken: "a".repeat(64) };
const row = { id: "enq_00000000-0000-4000-8000-000000000001", kind: "contact", status: "new", version: 0, createdAt: "2026-10-26T00:00:00.000Z" };
const detail = { ...row, name: "<img src=x onerror=alert(1)>", email: "synthetic@example.invalid", phone: "+910000000000", message: "<script>alert(1)</script>", context: { product: "Chair", variant: "Blue", sku: "TEST", pincode: "110015" }, reviews: [] };
function button(text: string) { const b = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === text); assert.ok(b, `Missing ${text}`); return b; }
const click = async (text: string) => act(async () => button(text).click());
test("inbox fetches private metadata then escaped detail and reviews with current version and CSRF", async () => {
    const previous = globalThis.fetch;
    const calls: {
        url: string;
        options?: RequestInit;
    }[] = [];
    globalThis.fetch = async (url, options) => {
        calls.push({ url: String(url), options });
        if (String(url).includes("/assignees") || String(url).includes("/activity")) return Response.json({ items: [], nextCursor: null });
        if (options?.method === "POST")
            return Response.json({ ...detail, status: "reviewed", version: 1, reviews: [{ id: "audit", actorId: "staff", version: 1, action: "reviewed", createdAt: row.createdAt }] });
        return Response.json(String(url).includes(row.id) ? detail : { items: [row], nextCursor: null });
    };
    const root = createRoot(container);
    try {
        await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => { throw Error("unexpected expiry"); }}/>));
        assert.match(container.textContent!, /Customer enquiries/);
        assert.ok(!container.textContent!.includes(detail.email), "Metadata list must not preload customer contact details");
        await click("Open enquiry");
        assert.match(container.textContent!, /synthetic@example.invalid/);
        assert.ok(container.textContent!.includes(detail.message));
        assert.equal(container.querySelector("script,img"), null, "Customer strings must be rendered as text");
        await click("Mark reviewed");
        assert.match(container.textContent!, /Reviewed/);
        const write = calls.find(call => call.options?.method === "POST")!;
        assert.equal(new Headers(write.options?.headers).get("X-CSRF-Token"), session.csrfToken);
        assert.deepEqual(JSON.parse(String(write.options?.body)), { expectedVersion: 0 });
        assert.ok(calls.every(call => call.options?.cache === "no-store"));
    }
    finally {
        await act(async () => root.unmount());
        globalThis.fetch = previous;
    }
});
test("access denial clears customer content and session expiry returns to sign in", async () => {
    const previous = globalThis.fetch;
    for (const status of [403, 401]) {
        let expired = 0;
        globalThis.fetch = async () => Response.json({}, { status });
        const root = createRoot(container);
        try {
            await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => { expired++; }}/>));
            if (status === 401)
                assert.equal(expired, 1);
            else
                assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /access/i);
            assert.ok(!container.textContent!.includes(detail.email));
        }
        finally {
            await act(async () => root.unmount());
        }
    }
    globalThis.fetch = previous;
});
test("a review conflict preserves detail and requires deliberate reload without silently retrying", async () => {
    const previous = globalThis.fetch;
    let writes = 0;
    globalThis.fetch = async (url, options) => String(url).includes("/assignees") || String(url).includes("/activity") ? Response.json({ items: [], nextCursor: null }) : options?.method === "POST" ? (writes++, Response.json({}, { status: 409 })) : Response.json(String(url).includes(row.id) ? detail : { items: [row], nextCursor: null });
    const root = createRoot(container);
    try {
        await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => { }}/>));
        await click("Open enquiry");
        await click("Mark reviewed");
        assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /changed|reload/i);
        assert.equal(writes, 1);
        assert.ok(button("Reload inbox"));
        assert.ok(container.textContent!.includes(detail.email));
        assert.ok(button("Reload enquiry"));
        assert.equal(button("Mark reviewed").disabled, true);
    }
    finally {
        await act(async () => root.unmount());
        globalThis.fetch = previous;
    }
});
test("filters reset pagination and malformed replies fail closed", async () => {
    const previous = globalThis.fetch;
    const paths: string[] = [];
    let malformed = false;
    globalThis.fetch = async (url) => { paths.push(String(url)); return Response.json(malformed ? { items: [{ ...row, email: "unexpected@example.invalid" }], nextCursor: null } : { items: [row], nextCursor: "opaque" }); };
    const root = createRoot(container);
    try {
        await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => { }}/>));
        await click("Next page");
        assert.equal(paths.at(-1), "/api/admin/enquiries?cursor=opaque");
        const select = container.querySelector<HTMLSelectElement>('[aria-label="Enquiry kind"]')!;
        await act(async () => { select.value = "bulk"; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
        assert.equal(paths.at(-1), "/api/admin/enquiries?kind=bulk");
        malformed = true;
        await click("Reload inbox");
        assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /couldn't load/i);
        assert.equal(container.querySelector("li"), null);
    }
    finally {
        await act(async () => root.unmount());
        globalThis.fetch = previous;
    }
});
