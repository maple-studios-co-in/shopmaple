import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { detailOf, empty, fakeFetch, installDom, makeButton, session, setValue, staffA, summary } from "./support/crm-fixtures";
const { dom, container } = installDom();
const { createRoot } = await import("react-dom/client");
const { EnquiryInbox } = await import("../components/admin/enquiry-inbox");
const button = makeButton(container);
const rows = [summary(1, { name: "Asha Rao", status: "quoted", assignedToId: staffA.id }), summary(2, { name: "Rahul K", kind: "bulk" })];
const searches: { body: any; csrf: string | null }[] = [];
function transport(list: (path: string) => Response | Promise<Response> | undefined) {
  return fakeFetch((path, options) => {
    if (path === "/api/admin/enquiries/search" && options?.method === "POST") { searches.push({ body: JSON.parse(String(options.body)), csrf: new Headers(options.headers).get("X-CSRF-Token") }); return list(path) ?? Response.json({ items: rows, nextCursor: null }); }
    if (options?.method === "POST") return Response.json({});
    if (path.includes("/assignees")) return Response.json({ items: [staffA], nextCursor: null });
    if (path.startsWith("/api/admin/enquiries?") || path === "/api/admin/enquiries") return list(path) ?? Response.json({ items: rows, nextCursor: null });
    if (/\/api\/admin\/enquiries\/enq_[^/]+$/.test(path)) return Response.json(detailOf(rows[0]!));
    return Response.json(empty);
  });
}
const control = (label: string) => container.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`);

test("list rows show name, product and stage and link to both the enquiry and the contact", async () => {
  const previous = fetch; globalThis.fetch = transport(() => undefined);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => {}} />));
    const row = container.querySelector<HTMLElement>(`[data-enquiry-row="${rows[0]!.id}"]`)!;
    assert.ok(row, "rows are identifiable");
    assert.match(row.textContent!, /Asha Rao/); assert.match(row.textContent!, /Nimbus sofa/);
    assert.equal(row.querySelector("[data-stage]")?.getAttribute("data-stage"), "quoted");
    assert.match(row.querySelector("[data-stage]")?.textContent ?? "", /Quoted/);
    assert.ok(!container.textContent!.includes("customer@example.invalid"), "the list never shows contact details");
    await act(async () => row.querySelector<HTMLButtonElement>('button[aria-label="Open contact for Asha Rao"]')!.click());
    assert.ok(container.querySelector('[aria-label="Contact"]'), "the contact page opens in place");
    await act(async () => button("Back to enquiries").click());
    assert.ok(container.querySelector(`[data-enquiry-row="${rows[0]!.id}"]`));
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("filters build a GET query while free-text search posts a body with the same filters", async () => {
  const previous = fetch; const paths: string[] = [];
  globalThis.fetch = transport(path => { paths.push(path); return undefined; });
  const root = createRoot(container);
  try {
    await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => {}} />));
    await setValue(dom, control("Enquiry status"), "quoted", "change");
    assert.equal(paths.at(-1), "/api/admin/enquiries?status=quoted");
    await setValue(dom, control("Assignee"), staffA.id, "change");
    assert.equal(paths.at(-1), `/api/admin/enquiries?status=quoted&assigneeId=${staffA.id}`);
    await setValue(dom, control("Enquiry kind"), "bulk", "change");
    await setValue(dom, control("From date"), "2030-01-01", "change");
    await setValue(dom, control("To date"), "2030-01-31", "change");
    assert.equal(paths.at(-1), `/api/admin/enquiries?kind=bulk&status=quoted&assigneeId=${staffA.id}&from=2030-01-01&to=2030-01-31`);
    const before = paths.length;
    await setValue(dom, control("Search enquiries"), "nimbus");
    assert.equal(paths.length, before, "typing does not query on every keystroke");
    await act(async () => { control("Search enquiries")!.closest("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.equal(paths.at(-1), "/api/admin/enquiries/search", "search text is posted, never placed in a URL");
    assert.ok(paths.every(path => !path.includes("q=") && !path.includes("nimbus")));
    assert.deepEqual(searches.at(-1), { body: { kind: "bulk", status: "quoted", assigneeId: staffA.id, from: "2030-01-01", to: "2030-01-31", q: "nimbus" }, csrf: session.csrfToken });
    await act(async () => button("Clear filters").click());
    assert.equal(paths.at(-1), "/api/admin/enquiries");
    assert.equal((control("Search enquiries") as HTMLInputElement).value, "");
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("loading shows skeleton rows and an empty result is a composed state with a reset action", async () => {
  const previous = fetch; let resolve: (value: Response) => void = () => {};
  globalThis.fetch = transport(() => new Promise<Response>(r => { resolve = r; }));
  const root = createRoot(container);
  try {
    await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => {}} />));
    assert.ok(container.querySelector("[data-skeleton]"), "rows are skeletons while loading");
    await act(async () => resolve(Response.json(empty)));
    assert.equal(container.querySelector("[data-skeleton]"), null);
    assert.ok(container.querySelector("[data-empty]"));
    assert.match(container.textContent!, /no enquiries match/i);
    assert.ok(button("Clear filters"));
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("the view switcher moves between list, board, follow-ups and contacts without losing the session", async () => {
  const previous = fetch; globalThis.fetch = transport(() => undefined);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => {}} />));
    const tabs = container.querySelector('[role="tablist"][aria-label="CRM views"]')!;
    assert.ok(tabs, "views are a tablist");
    assert.deepEqual([...tabs.querySelectorAll('[role="tab"]')].map(tab => tab.textContent?.trim()), ["List", "Board", "Follow-ups", "Contacts"]);
    await act(async () => tabs.querySelector<HTMLButtonElement>('[role="tab"]:nth-child(2)')!.click());
    assert.ok(container.querySelector('[aria-label="Pipeline board"]'));
    assert.equal(tabs.querySelector('[role="tab"]:nth-child(2)')?.getAttribute("aria-selected"), "true");
    await act(async () => tabs.querySelector<HTMLButtonElement>('[role="tab"]:nth-child(3)')!.click());
    assert.ok(container.querySelector('[aria-label="Follow-up views"]'));
    await act(async () => tabs.querySelector<HTMLButtonElement>('[role="tab"]:nth-child(4)')!.click());
    assert.ok(container.querySelector('[aria-label="Contacts"]'));
    await act(async () => tabs.querySelector<HTMLButtonElement>('[role="tab"]:nth-child(1)')!.click());
    assert.ok(container.querySelector(`[data-enquiry-row="${rows[0]!.id}"]`));
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

// Review finding 15 (intentional behaviour change): the table no longer has its own stage, assignee and
// name filters. The server filters and the one search cover the whole inbox, not just the loaded page.
test("the list has one set of filters (the server's) and one text search, and headers still sort", async () => {
  const previous = fetch; const paths: string[] = [];
  globalThis.fetch = transport(path => { paths.push(path); return undefined; });
  const root = createRoot(container);
  const visible = () => [...container.querySelectorAll<HTMLElement>("[data-enquiry-row]")].map(row => row.dataset.enquiryRow);
  const count = (selector: string) => container.querySelectorAll(selector).length;
  try {
    await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => {}} />));
    assert.deepEqual(visible(), [rows[0]!.id, rows[1]!.id]);
    assert.equal(count('[aria-label^="Filter by"]'), 0, "no column filters duplicate the server filters");
    assert.equal(count('select[aria-label="Enquiry status"]'), 1, "one stage filter");
    assert.equal(count('select[aria-label="Assignee"]'), 1, "one assignee filter");
    assert.equal(count('input:not([type="date"])'), 1, "one text search");
    assert.ok(control("Search enquiries"), "the text search is the whole-inbox search");
    assert.doesNotMatch(container.textContent!, /column filters/i);
    const header = [...container.querySelectorAll<HTMLButtonElement>("th button")].find(item => item.textContent?.trim() === "Customer");
    assert.ok(header, "the customer column header sorts");
    await act(async () => header.click()); await act(async () => header.click());
    assert.equal(header.closest("th")?.getAttribute("aria-sort"), "descending");
    assert.deepEqual(visible(), [rows[1]!.id, rows[0]!.id], "descending by name puts Rahul first");
    const stage = [...container.querySelectorAll<HTMLButtonElement>("th button")].find(item => item.textContent?.trim() === "Stage");
    assert.ok(stage, "the stage column still sorts");
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("on narrow screens a Filters button shows the active count and opens the filters in a sheet that applies them together", async () => {
  const previous = fetch; const paths: string[] = [];
  globalThis.fetch = transport(path => { paths.push(path); return undefined; });
  const root = createRoot(container);
  const filters = () => [...container.querySelectorAll<HTMLButtonElement>("button")].find(item => /^Filters/.test(item.textContent?.trim() ?? ""));
  const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]');
  try {
    await act(async () => root.render(<EnquiryInbox session={session} onExpired={() => {}} />));
    assert.equal(filters()?.textContent?.trim(), "Filters", "no count while nothing is filtered");
    await setValue(dom, control("Enquiry status"), "quoted", "change");
    await setValue(dom, control("Enquiry kind"), "bulk", "change");
    assert.equal(filters()?.textContent?.trim(), "Filters (2)");
    await act(async () => filters()!.click());
    const panel = sheet();
    assert.ok(panel, "the filters open in a sheet");
    const inSheet = (label: string) => panel.querySelector<HTMLSelectElement | HTMLInputElement>(`[aria-label="${label}"]`);
    for (const label of ["Enquiry kind", "Enquiry status", "Enquiry assignment", "Assignee", "From date", "To date"]) assert.ok(inSheet(label), `${label} is in the sheet`);
    assert.equal(inSheet("Enquiry kind")!.value, "bulk", "the sheet starts from the active filters");
    const before = paths.length;
    await setValue(dom, inSheet("Enquiry assignment"), "unassigned", "change");
    await setValue(dom, inSheet("From date"), "2030-01-01", "change");
    assert.equal(paths.length, before, "nothing is requested until the filters are applied");
    const apply = [...panel.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.trim() === "Apply filters");
    assert.ok(apply, "the sheet has an apply action");
    await act(async () => apply.click());
    assert.equal(paths.length, before + 1, "applying sends one request");
    assert.equal(paths.at(-1), "/api/admin/enquiries?kind=bulk&status=quoted&assignment=unassigned&from=2030-01-01");
    assert.equal(sheet(), null, "applying closes the sheet");
    assert.equal(filters()?.textContent?.trim(), "Filters (4)");
    assert.equal((control("Enquiry assignment") as HTMLSelectElement).value, "unassigned", "the inline bar shows the same state");
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});
