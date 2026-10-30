import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { installUiDom } from "./support/ui-dom";
// The detail opens in a sheet, which portals to document.body when rendered without AdminRoot:
// queries read the whole page, and Radix needs the DOM in place before it is imported.
const dom = installUiDom();
const { createRoot } = await import("react-dom/client");
const { EnquiryInbox } = await import("../components/admin/enquiry-inbox");
const container = document.getElementById("root")!;
const page = document.body;
const session = { user: { id: "staff", email: "staff@example.invalid", role: "editor" as const }, csrfToken: "a".repeat(64) };
const row = { id: "enq_00000000-0000-4000-8000-000000000001", kind: "contact", status: "new", version: 0, assignedToId: null, contactId: null, name: "Synthetic", product: "", createdAt: "2026-10-26T00:00:00.000Z" };
const detail = { ...row, name: "<img src=x onerror=alert(1)>", email: "synthetic@example.invalid", phone: "+910000000000", message: "<script>alert(1)</script>", context: { product: "Chair", variant: "Blue", sku: "TEST", pincode: "110015" }, reviews: [] };
function button(text: string) { const b = [...page.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === text); assert.ok(b, `Missing ${text}`); return b; }
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
            return Response.json({ ...detail, status: "contacted", version: 1, reviews: [{ id: "audit", actorId: "staff", version: 1, action: "reviewed", createdAt: row.createdAt }] });
        return Response.json(String(url).includes(row.id) ? detail : { items: [row], nextCursor: null });
    };
    const root = createRoot(container);
    try {
        await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => { throw Error("unexpected expiry"); }}/>));
        assert.match(page.textContent!, /Customer enquiries/);
        assert.ok(!page.textContent!.includes(detail.email), "Metadata list must not preload customer contact details");
        await click("Open enquiry");
        assert.match(page.textContent!, /synthetic@example.invalid/);
        assert.ok(page.textContent!.includes(detail.message));
        assert.equal(page.querySelector("script,img"), null, "Customer strings must be rendered as text");
        await click("Contacted");
        assert.match(page.textContent!, /Contacted/);
        const write = calls.find(call => call.options?.method === "POST")!;
        assert.equal(new Headers(write.options?.headers).get("X-CSRF-Token"), session.csrfToken);
        assert.deepEqual(JSON.parse(String(write.options?.body)), { expectedVersion: 0, stage: "contacted" });
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
                assert.match(page.querySelector('[role="alert"]')?.textContent ?? "", /access/i);
            assert.ok(!page.textContent!.includes(detail.email));
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
        await click("Contacted");
        assert.match(page.querySelector('[role="alert"]')?.textContent ?? "", /changed|reload/i);
        assert.equal(writes, 1);
        assert.ok(button("Reload inbox"));
        assert.ok(page.textContent!.includes(detail.email));
        assert.ok(button("Reload enquiry"));
        assert.equal(button("Contacted").disabled, true);
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
        assert.match(page.querySelector('[role="alert"]')?.textContent ?? "", /couldn't load/i);
        assert.equal(page.querySelector("li"), null);
    }
    finally {
        await act(async () => root.unmount());
        globalThis.fetch = previous;
    }
});
test("opening a row shows the enquiry in a sheet with its activity as a timeline, and closing it removes the sheet", async () => {
    const previous = globalThis.fetch;
    const activity = [
        { id: "act2", action: "status_changed", version: 2, actorId: "c000000000000000000000001", createdAt: "2026-10-26T10:00:00.000Z", assigneeId: null, body: null, stage: "contacted" },
        { id: "act1", action: "note", version: 1, actorId: "c000000000000000000000001", createdAt: "2026-10-26T09:00:00.000Z", assigneeId: null, body: "Called about the blue chair" },
    ];
    globalThis.fetch = async (url) => {
        const path = String(url);
        if (path.includes("/assignees")) return Response.json({ items: [{ id: "c000000000000000000000001", email: "owner@example.invalid" }], nextCursor: null });
        if (path.includes("/activity")) return Response.json({ items: activity, nextCursor: null });
        if (path.endsWith("/delivery")) return Response.json({ enquiryId: row.id, enabled: true, delivery: null });
        if (path.includes("/crm/tasks")) return Response.json({ items: [], nextCursor: null });
        return Response.json(path.includes(row.id) ? { ...detail, name: "Synthetic" } : { items: [row], nextCursor: null });
    };
    const root = createRoot(container);
    try {
        await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => {}}/>));
        assert.equal(page.querySelector('[role="dialog"]'), null, "no sheet before an enquiry is opened");
        await act(async () => container.querySelector<HTMLElement>(`[data-enquiry-row="${row.id}"]`)!.click());
        const sheet = page.querySelector<HTMLElement>('[role="dialog"]');
        assert.ok(sheet, "clicking the row opens the enquiry in a sheet");
        assert.ok(!container.contains(sheet), "the sheet is an overlay, not inline in the list");
        assert.match(sheet.textContent!, /Enquiry details/);
        assert.match(sheet.textContent!, /synthetic@example\.invalid/);
        const entries = [...sheet.querySelectorAll<HTMLElement>("[data-timeline] [data-timeline-entry]")];
        assert.deepEqual(entries.map(entry => entry.dataset.timelineEntry), ["act2", "act1"], "activity reads as a timeline, newest first");
        assert.match(entries[0]!.textContent!, /Moved to Contacted/);
        assert.match(entries[1]!.textContent!, /Called about the blue chair/);
        assert.ok(entries.every(entry => entry.querySelector("[data-timeline-marker]")), "each entry has a dot marker");
        await act(async () => button("Close enquiry").click());
        assert.equal(page.querySelector('[role="dialog"]'), null, "closing removes the sheet");
    }
    finally {
        await act(async () => root.unmount());
        globalThis.fetch = previous;
    }
});

test("on a phone the enquiry table scrolls inside its own container instead of widening the page", async () => {
    const previous = globalThis.fetch;
    globalThis.fetch = async (url) => String(url).includes("/assignees") ? Response.json({ items: [], nextCursor: null }) : Response.json({ items: [row], nextCursor: null });
    const root = createRoot(container);
    try {
        await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => { throw Error("unexpected expiry"); }}/>));
        const scroller = page.querySelector<HTMLElement>('[data-slot="table-container"]')!;
        assert.ok(scroller.classList.contains("overflow-x-auto"), "The table has its own horizontal scroll container");
        // Grid and flex items default to min-width: auto, so any ancestor without min-w-0 lets the
        // table's content width stretch it past a 375 px screen.
        const section = page.querySelector('section[aria-label="Customer enquiries"]')!;
        const stretching: string[] = [];
        for (let node = scroller.parentElement; node && node !== section; node = node.parentElement) {
            if (!node.classList.contains("min-w-0")) stretching.push(`${node.tagName.toLowerCase()}.${[...node.classList].join(".")}`);
        }
        assert.deepEqual(stretching, [], "Every container between the inbox and the table can shrink below the table's width");
    }
    finally {
        await act(async () => root.unmount());
        globalThis.fetch = previous;
    }
});
