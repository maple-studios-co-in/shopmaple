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
const detail = { ...row, name: "Synthetic", email: "synthetic@example.invalid", phone: "", message: "Help", context: { product: "", variant: "", sku: "", pincode: "" }, reviews: [] };
function button(text: string) { const b = [...page.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === text); assert.ok(b, `Missing ${text}`); return b; }
const click = async (text: string) => act(async () => button(text).click());
async function choose(value: string) { await act(async () => { const select = page.querySelector<HTMLSelectElement>('[aria-label="Assign to"]')!; assert.ok(select, "Assignment control must be available"); select.value = value; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); }); }
async function note(value: string) { await act(async () => { const input = page.querySelector<HTMLTextAreaElement>('[aria-label="Internal note"]')!; assert.ok(input, "Internal note composer must be available"); input.value = value; input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); }); }
function transport(overrides?: (path: string, options?: RequestInit) => Response | Promise<Response> | undefined) {
    return async (url: string | URL | Request, options?: RequestInit) => {
        const path = String(url); const result = overrides?.(path, options); if (result) return result;
        if (path.includes("/assignees")) return Response.json({ items: [{ id: "c000000000000000000000001", email: "owner@example.invalid" }], nextCursor: null });
        if (path.includes("/activity")) return Response.json({ items: [], nextCursor: null });
        return Response.json(path.includes(row.id) ? detail : { items: [row], nextCursor: null });
    };
}
test("assigns then saves a literal internal note with the latest version and CSRF, without contacting a customer", async () => {
    const previous = fetch; const writes: { path: string; options?: RequestInit }[] = [];
    globalThis.fetch = transport((path, options) => {
        if (options?.method !== "POST") return;
        writes.push({ path, options });
        return Response.json({ ...detail, assignedToId: "c000000000000000000000001", version: writes.length });
    });
    const root = createRoot(container);
    try {
        await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => {}}/>));
        await click("Open enquiry");
        assert.equal(document.activeElement?.textContent, "Enquiry details");
        await choose("c000000000000000000000001"); await click("Save assignment");
        assert.match(page.textContent!, /Current assignee: owner@example.invalid/);
        await note("<script>private</script>\nFollow up internally"); await click("Add internal note");
        assert.equal(writes.length, 2);
        assert.equal(writes[0]!.path, `/api/admin/enquiries/${row.id}/assignment`);
        assert.deepEqual(JSON.parse(String(writes[0]!.options?.body)), { expectedVersion: 0, assigneeId: "c000000000000000000000001" });
        assert.equal(writes[1]!.path, `/api/admin/enquiries/${row.id}/notes`);
        assert.deepEqual(JSON.parse(String(writes[1]!.options?.body)), { expectedVersion: 1, body: "<script>private</script>\nFollow up internally" });
        assert.ok(writes.every(write => new Headers(write.options?.headers).get("X-CSRF-Token") === session.csrfToken));
        assert.equal(page.querySelector<HTMLTextAreaElement>("textarea")?.value, "");
        assert.match(page.textContent!, /does not send.*reply/i);
        assert.equal(page.querySelector("script"), null);
    } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("pages eligible assignees and literal activity, and supports unassignment", async () => {
    const previous = fetch; const paths: string[] = []; let unassigned = false;
    globalThis.fetch = transport((path, options) => {
        paths.push(path);
        if (path.includes("/assignees")) return Response.json(path.includes("cursor=") ? { items: [{ id: "c000000000000000000000002", email: "later@example.invalid" }], nextCursor: null } : { items: [{ id: "c000000000000000000000001", email: "owner@example.invalid" }], nextCursor: "staffpage" });
        if (path.includes("/activity")) return Response.json(path.includes("cursor=") ? { items: [{ id: "note1", action: "note", actorId: "c000000000000000000000004", version: 1, createdAt: row.createdAt, assigneeId: null, body: "<img src=x>\nPrivate history" }], nextCursor: null } : { items: [{ id: "assign2", action: "assigned", actorId: "c000000000000000000000003", version: 2, createdAt: row.createdAt, assigneeId: "c000000000000000000000001", body: null }], nextCursor: "activitypage" });
        if (options?.method === "POST") { const body = JSON.parse(String(options.body)); unassigned = body.assigneeId === null; return Response.json({ ...detail, assignedToId: body.assigneeId, version: 3 }); }
    });
    const root = createRoot(container);
    try {
        await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => {}}/>)); await click("Open enquiry");
        await click("More assignees"); assert.match(page.textContent!, /later@example.invalid/);
        await choose("c000000000000000000000002"); await click("Save assignment");
        await choose(""); await click("Save assignment"); assert.equal(unassigned, true);
        await click("Older activity"); assert.match(page.textContent!, /Private history/);
        assert.equal(page.querySelector("img"), null);
        assert.ok(paths.some(path => path.includes("assignees?cursor=staffpage")));
        assert.ok(paths.some(path => path.includes("activity?cursor=activitypage")));
    } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("retains a draft after a conflict and deliberate reload, blocks duplicate writes until reload", async () => {
    const previous = fetch; let writes = 0; let version = 0;
    globalThis.fetch = transport((path, options) => {
        if (options?.method === "POST") { writes++; version = 4; return Response.json({}, { status: 409 }); }
        if (path.endsWith(row.id)) return Response.json({ ...detail, version });
    });
    const root = createRoot(container);
    try {
        await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => {}}/>)); await click("Open enquiry");
        await note("Keep this unsaved draft"); await click("Add internal note");
        assert.match(page.querySelector('[role="alert"]')?.textContent ?? "", /changed/i);
        assert.equal(page.querySelector<HTMLTextAreaElement>("textarea")?.value, "Keep this unsaved draft");
        assert.equal(button("Add internal note").disabled, true); assert.equal(writes, 1);
        await click("Reload enquiry");
        assert.equal(page.querySelector<HTMLTextAreaElement>("textarea")?.value, "Keep this unsaved draft");
        assert.equal(button("Add internal note").disabled, false);
    } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("a failed note request preserves the draft without automatic retry", async () => {
    const previous = fetch; let writes = 0;
    globalThis.fetch = transport((_path, options) => { if (options?.method === "POST") { writes++; return Promise.reject(Error("offline")); } });
    const root = createRoot(container);
    try {
        await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => {}}/>)); await click("Open enquiry");
        await note("Offline draft"); await click("Add internal note");
        assert.equal(page.querySelector<HTMLTextAreaElement>("textarea")?.value, "Offline draft");
        assert.match(page.querySelector('[role="alert"]')?.textContent ?? "", /couldn't|failed|unable/i);
        assert.equal(writes, 1);
    } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("denied workflow requests clear all private detail and drafts", async () => {
    const previous = fetch;
    for (const status of [401, 403]) {
        let expired = 0;
        globalThis.fetch = transport((_path, options) => options?.method === "POST" ? Response.json({}, { status }) : undefined);
        const root = createRoot(container);
        try {
            await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => { expired++; }}/>)); await click("Open enquiry");
            await note("Sensitive draft"); await click("Add internal note");
            assert.equal(page.querySelector("textarea"), null);
            assert.ok(!page.textContent!.includes(detail.email));
            assert.equal(expired, status === 401 ? 1 : 0);
        } finally { await act(async () => root.unmount()); }
    }
    globalThis.fetch = previous;
});

test("account changes remove drafts and ignore old in-flight reads", async () => {
    const previous = fetch; let resolveOld: (response: Response) => void = () => {}; let hold = false;
    globalThis.fetch = transport((path) => path.endsWith(row.id) && hold ? new Promise<Response>(resolve => { resolveOld = resolve; }) : undefined);
    const root = createRoot(container);
    try {
        await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => {}}/>)); await click("Open enquiry"); await note("Old account draft");
        await act(async () => root.render(<EnquiryInbox session={{ ...session, csrfToken: "b".repeat(64), user: { ...session.user, id: "second" } }} onExpired={() => {}}/>));
        assert.equal(page.querySelector("textarea"), null); assert.ok(!page.textContent!.includes(detail.email));
        hold = true; await click("Open enquiry");
        await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => {}}/>));
        await act(async () => resolveOld(Response.json(detail)));
        assert.ok(!page.textContent!.includes(detail.email));
    } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("reviewing preserves the unsaved internal draft and updates the version for the next note", async () => {
    const previous = fetch; const writes: { path: string; body: unknown }[] = [];
    globalThis.fetch = transport((path, options) => { if (options?.method === "POST") { writes.push({ path, body: JSON.parse(String(options.body)) }); return Response.json({ ...detail, status: "contacted", version: writes.length, reviews: [{ id: "review", actorId: "staff", action: "reviewed", version: 1, createdAt: row.createdAt }] }); } });
    const root = createRoot(container);
    try {
        await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => {}}/>)); await click("Open enquiry");
        await note("Draft across review"); await click("Contacted");
        assert.equal(page.querySelector<HTMLTextAreaElement>("textarea")?.value, "Draft across review");
        await click("Add internal note"); assert.deepEqual(writes[1]!.body, { expectedVersion: 1, body: "Draft across review" });
    } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("assignment filtering resets paging and removes rows that no longer match after a write", async () => {
    const previous = fetch; const paths: string[] = [];
    globalThis.fetch = transport((path, options) => {
        paths.push(path);
        if (options?.method === "POST") return Response.json({ ...detail, assignedToId: "c000000000000000000000001", version: 1 });
        if (!path.includes(row.id) && !path.includes("assignees")) return Response.json({ items: [row], nextCursor: "inboxpage" });
    });
    const root = createRoot(container);
    try {
        await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => {}}/>)); await click("Next page");
        const filter = page.querySelector<HTMLSelectElement>('[aria-label="Enquiry assignment"]'); assert.ok(filter, "Assignment filter must be available");
        await act(async () => { filter.value = "unassigned"; filter.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
        assert.equal(paths.at(-1), "/api/admin/enquiries?assignment=unassigned");
        await click("Open enquiry"); await choose("c000000000000000000000001"); await click("Save assignment");
        assert.equal([...page.querySelectorAll("button")].filter(item => item.textContent === "Open enquiry").length, 0);
    } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("closing detail restores keyboard focus to its opener", async () => {
    const previous = fetch; globalThis.fetch = transport(); const root = createRoot(container);
    try {
        await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => {}}/>));
        const opener = button("Open enquiry"); opener.focus(); await click("Open enquiry"); await click("Close enquiry");
        assert.ok(document.activeElement === opener, "Closing should return focus to the enquiry opener");
    } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("keeps unavailable assignees visible and allows clearing them", async () => {
    const previous = fetch; let body: unknown;
    globalThis.fetch = transport((path, options) => {
        if (options?.method === "POST") { body = JSON.parse(String(options.body)); return Response.json({ ...detail, assignedToId: null, version: 1 }); }
        if (path.endsWith(row.id)) return Response.json({ ...detail, assignedToId: "c000000000000000000000099" });
    });
    const root = createRoot(container);
    try {
        await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => {}}/>)); await click("Open enquiry");
        assert.match(page.textContent!, /Current assignee: Staff c000000000000000000000099/);
        assert.equal(button("Save assignment").disabled, true);
        await choose(""); await click("Save assignment");
        assert.deepEqual(body, { expectedVersion: 0, assigneeId: null });
    } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("pending note disables concurrent actions and timeout retains draft until deliberate reload", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] }); const previous = fetch; let writes = 0;
    globalThis.fetch = transport((_path, options) => {
        if (options?.method === "POST") { writes++; return new Promise<Response>((_resolve, reject) => options.signal?.addEventListener("abort", () => reject(Error("aborted")))); }
    });
    const root = createRoot(container);
    try {
        await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => {}}/>)); await click("Open enquiry"); await note("Timeout draft"); await click("Add internal note");
        for (const text of ["Add internal note", "Contacted", "Close enquiry", "Reload inbox", "Save assignment"]) assert.equal(button(text).disabled, true, text);
        await click("Add internal note"); assert.equal(writes, 1);
        await act(async () => t.mock.timers.tick(15_000));
        assert.match(page.textContent!, /timed out/);
        assert.equal(page.querySelector<HTMLTextAreaElement>("textarea")?.value, "Timeout draft");
        assert.equal(button("Add internal note").disabled, true);
        await click("Reload enquiry"); assert.equal(button("Add internal note").disabled, false);
    } finally { await act(async () => root.unmount()); globalThis.fetch = previous; t.mock.timers.reset(); }
});

test("late activity from a closed enquiry cannot appear in another enquiry", async () => {
    const previous = fetch; let resolveOld: (response: Response) => void = () => {}; let first = true;
    const other = { ...detail, id: "enq_00000000-0000-4000-8000-000000000002", email: "second@example.invalid" };
    globalThis.fetch = transport((path) => {
        if (path.includes(`${row.id}/activity`) && first) { first = false; return new Promise<Response>(resolve => { resolveOld = resolve; }); }
        if (path.endsWith(other.id)) return Response.json(other);
        if (path === "/api/admin/enquiries") return Response.json({ items: [row, { ...row, id: other.id }], nextCursor: null });
    });
    const root = createRoot(container);
    try {
        await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => {}}/>)); await click("Open enquiry"); await note("First draft"); await click("Close enquiry");
        const openers = [...page.querySelectorAll<HTMLButtonElement>("button")].filter(item => item.textContent === "Open enquiry"); await act(async () => openers[1]!.click());
        await act(async () => resolveOld(Response.json({ items: [{ id: "late", action: "note", version: 1, actorId: "c000000000000000000000001", createdAt: row.createdAt, assigneeId: null, body: "Private old activity" }], nextCursor: null })));
        assert.match(page.textContent!, /second@example.invalid/); assert.ok(!page.textContent!.includes("Private old activity"));
        assert.equal(page.querySelector<HTMLTextAreaElement>("textarea")?.value, "");
    } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("changing filters hides prior rows while the replacement list loads", async () => {
    const previous = fetch; let resolveList: (response: Response) => void = () => {};
    globalThis.fetch = transport(path => path.includes("kind=bulk") ? new Promise<Response>(resolve => { resolveList = resolve; }) : undefined);
    const root = createRoot(container);
    try {
        await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => {}}/>));
        await act(async () => { const filter = page.querySelector<HTMLSelectElement>('[aria-label="Enquiry kind"]')!; filter.value = "bulk"; filter.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
        assert.ok(!page.textContent!.includes(row.id), "Prior filter rows must not appear under a new filter");
        await act(async () => resolveList(Response.json({ items: [], nextCursor: null })));
        assert.match(page.textContent!, /No enquiries match/);
    } finally { await act(async () => resolveList(Response.json({ items: [], nextCursor: null }))); await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("on narrow screens a native stage select drives the same stage change, and Lost still asks for a reason", async () => {
    const previous = fetch; const writes: { path: string; body: any }[] = [];
    globalThis.fetch = transport((path, options) => { if (options?.method === "POST") { const body = JSON.parse(String(options.body)); writes.push({ path, body }); return Response.json({ ...detail, status: body.stage ?? detail.status, version: writes.length }); } });
    const root = createRoot(container);
    const stage = () => page.querySelector<HTMLSelectElement>('select[aria-label="Pipeline stage"]');
    const pick = async (value: string) => act(async () => { const select = stage()!; select.value = value; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    try {
        await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => {}}/>)); await click("Open enquiry");
        assert.ok(stage(), "a native stage select is available");
        assert.equal(stage()!.value, "new", "the select shows the current stage");
        assert.deepEqual([...stage()!.options].map(option => option.textContent), ["New", "Contacted", "Quoted", "Won", "Lost"]);
        await pick("contacted");
        assert.deepEqual(writes, [{ path: `/api/admin/enquiries/${row.id}/stage`, body: { expectedVersion: 0, stage: "contacted" } }]);
        assert.equal(stage()!.value, "contacted");
        assert.equal(button("Contacted").getAttribute("aria-pressed"), "true", "the segmented control shows the same state");
        await pick("lost");
        assert.equal(writes.length, 1, "Lost waits for a reason");
        assert.ok(page.querySelector('textarea[aria-label="Reason for losing"]'), "the reason prompt opens");
        assert.equal(stage()!.value, "contacted", "the select keeps the saved stage until Lost is confirmed");
    } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});
