import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { contactId, empty, fakeFetch, installDom, makeButton, session, setValue, staffA, summary } from "./support/crm-fixtures";
const { dom, container } = installDom();
const { createRoot } = await import("react-dom/client");
const { ContactPage, ContactsDirectory } = await import("../components/admin/contact-page");
const button = makeButton(container);
const control = (label: string) => container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`);
const contact = { id: contactId, name: "Meera Iyer", email: "meera@example.invalid", phone: "+91 91111 22222", city: "Bengaluru", tags: ["trade", "repeat"], notes: "Prefers <walnut>", version: 0, createdAt: "2030-01-01T00:00:00.000Z", updatedAt: "2030-01-05T00:00:00.000Z" };
const enquiries = [summary(2, { name: "Meera", status: "quoted", createdAt: "2030-01-06T00:00:00.000Z" }), summary(1, { name: "Meera Iyer" })];
const timeline = [
  { id: "a3", source: "enquiry", enquiryId: enquiries[0]!.id, action: "email_sent", actorId: staffA.id, stage: null, subject: "Your sofa quote", body: "Hi Meera, <b>quote</b> attached.", createdAt: "2030-01-08T10:00:00.000Z" },
  { id: "a2", source: "enquiry", enquiryId: enquiries[0]!.id, action: "status_changed", actorId: staffA.id, stage: "quoted", subject: null, body: null, createdAt: "2030-01-07T10:00:00.000Z" },
  { id: enquiries[1]!.id, source: "enquiry", enquiryId: enquiries[1]!.id, action: "enquiry_received", actorId: null, stage: null, subject: null, body: null, createdAt: "2030-01-07T09:00:00.000Z" },
  { id: "c1", source: "contact", enquiryId: null, action: "task_completed", actorId: staffA.id, stage: null, subject: null, body: "Visit showroom", createdAt: "2030-01-06T10:00:00.000Z" },
];
function transport(onWrite: (body: any) => Response, overrides?: (path: string) => Response | undefined) {
  return fakeFetch((path, options) => {
    if (options?.method === "POST") return onWrite(JSON.parse(String(options.body)));
    const override = overrides?.(path); if (override) return override;
    if (path.includes("/assignees")) return Response.json({ items: [staffA], nextCursor: null });
    if (path.includes("/timeline")) return Response.json({ items: timeline, nextCursor: null });
    if (path.endsWith(`/crm/contacts/${contactId}`)) return Response.json({ contact, enquiries });
    if (path.startsWith("/api/admin/crm/contacts")) return Response.json({ items: [contact], nextCursor: null });
    return Response.json(empty);
  });
}

test("the contact page shows details, every enquiry with its stage, and a combined readable timeline", async () => {
  const previous = fetch; const opened: string[] = []; let back = 0;
  globalThis.fetch = transport(() => Response.json({}));
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ContactPage session={session} contactId={contactId} onDenied={() => {}} onOpenEnquiry={id => opened.push(id)} onBack={() => { back++; }} today="2030-01-10" />));
    const page = container.querySelector('[aria-label="Contact"]')!;
    assert.match(page.textContent!, /Meera Iyer/); assert.match(page.textContent!, /meera@example\.invalid/); assert.match(page.textContent!, /Bengaluru/);
    assert.deepEqual([...page.querySelectorAll("[data-tag]")].map(tag => tag.textContent?.trim()), ["trade", "repeat"]);
    assert.match(page.textContent!, /Prefers <walnut>/); assert.equal(page.querySelector("walnut"), null);
    const rows = [...page.querySelectorAll<HTMLElement>("[data-enquiry-row]")];
    assert.deepEqual(rows.map(row => row.dataset.enquiryRow), [enquiries[0]!.id, enquiries[1]!.id]);
    assert.equal(rows[0]!.querySelector("[data-stage]")?.getAttribute("data-stage"), "quoted");
    await act(async () => rows[0]!.querySelector<HTMLButtonElement>("button")!.click());
    assert.deepEqual(opened, [enquiries[0]!.id]);
    const entries = [...page.querySelectorAll<HTMLElement>("[data-timeline-entry]")];
    assert.deepEqual(entries.map(entry => entry.dataset.timelineEntry), ["a3", "a2", enquiries[1]!.id, "c1"], "newest first across enquiry and contact events");
    assert.match(entries[0]!.textContent!, /Email sent/); assert.match(entries[0]!.textContent!, /Your sofa quote/); assert.match(entries[0]!.textContent!, /<b>quote<\/b>/);
    assert.equal(page.querySelector("b"), null);
    assert.match(entries[1]!.textContent!, /Moved to Quoted/);
    assert.match(entries[2]!.textContent!, /Enquiry received/);
    assert.match(entries[3]!.textContent!, /Follow-up done/); assert.match(entries[3]!.textContent!, /Visit showroom/);
    assert.ok(page.querySelector('[aria-label="Follow-ups"]'), "contact tasks live on the contact page");
    await act(async () => button("Back").click()); assert.equal(back, 1);
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("editing saves name, phone, city, tags and notes with the current version, and a conflict demands a reload", async () => {
  const previous = fetch; const writes: any[] = []; let conflict = false;
  globalThis.fetch = transport(body => { writes.push(body); const { expectedVersion, ...fields } = body; return conflict ? Response.json({ code: "CONTACT_VERSION_CONFLICT" }, { status: 409 }) : Response.json({ ...contact, ...fields, version: expectedVersion + 1 }); });
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ContactPage session={session} contactId={contactId} onDenied={() => {}} onOpenEnquiry={() => {}} onBack={() => {}} today="2030-01-10" />));
    await act(async () => button("Edit contact").click());
    assert.equal((control("Contact name") as HTMLInputElement).value, "Meera Iyer");
    assert.equal(control("Contact email"), null, "email is the key and cannot be edited here");
    await setValue(dom, control("Contact name"), "Meera K. Iyer");
    await setValue(dom, control("Phone"), "+91 91111 33333");
    await setValue(dom, control("City"), "Mysuru");
    await setValue(dom, control("Tags"), "trade, vip ,  ");
    await setValue(dom, control("Internal notes"), "Prefers walnut, call after 6pm");
    await act(async () => button("Save contact").click());
    assert.deepEqual(writes, [{ expectedVersion: 0, name: "Meera K. Iyer", phone: "+91 91111 33333", city: "Mysuru", tags: ["trade", "vip"], notes: "Prefers walnut, call after 6pm" }]);
    assert.match(container.querySelector('[role="status"]')?.textContent ?? "", /saved/i);
    assert.match(container.textContent!, /Meera K\. Iyer/); assert.match(container.textContent!, /Mysuru/);
    conflict = true;
    await act(async () => button("Edit contact").click());
    await setValue(dom, control("City"), "Chennai");
    await act(async () => button("Save contact").click());
    assert.equal(writes[1]!.expectedVersion, 1);
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /changed|reload/i);
    assert.equal(button("Save contact").disabled, true);
    assert.ok(button("Reload contact"));
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});

test("the directory searches contacts on submit, shows an empty state and opens a contact", async () => {
  const previous = fetch; const paths: string[] = []; const opened: string[] = [];
  globalThis.fetch = transport(() => Response.json({}), path => { paths.push(path); return path.includes("q=nobody") ? Response.json(empty) : undefined; });
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ContactsDirectory session={session} onDenied={() => {}} onOpenContact={id => opened.push(id)} />));
    assert.equal(paths[0], "/api/admin/crm/contacts");
    const row = container.querySelector<HTMLElement>(`[data-contact-row="${contactId}"]`)!;
    assert.match(row.textContent!, /Meera Iyer/); assert.match(row.textContent!, /Bengaluru/);
    await act(async () => row.querySelector<HTMLButtonElement>("button")!.click());
    assert.deepEqual(opened, [contactId]);
    await setValue(dom, control("Search contacts"), "nobody");
    await act(async () => { control("Search contacts")!.closest("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.equal(paths.at(-1), "/api/admin/crm/contacts?q=nobody");
    assert.ok(container.querySelector("[data-empty]")); assert.match(container.textContent!, /no contacts match/i);
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; }
});
