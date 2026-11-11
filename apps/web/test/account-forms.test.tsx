import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import type { AccountAddress } from "@shopmaple/contracts/account";

// Saved addresses and account details (owner's spec, 10 Nov 2026; no frames, drawn to the account pages' system).
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3000/account/addresses" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement, HTMLSelectElement: dom.window.HTMLSelectElement, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
const { AddressBook } = await import("../components/account/address-book");
const { AccountDetailsForm } = await import("../components/account/account-details-form");

const home: AccountAddress = { id: "3f1d2c4b-5a6e-4f70-8a9b-0c1d2e3f4a5b", name: "Aditi Sharma", line1: "14 Palm Avenue", line2: "Apartment 402",
  city: "Bengaluru", state: "29", pin: "560001", phone: "+919876543210", isDefault: true };
const studio: AccountAddress = { id: "6a7b8c9d-0e1f-4a2b-9c3d-4e5f6a7b8c9d", name: "Aditi Sharma", line1: "Studio 3, Lake Road", line2: "",
  city: "Pune", state: "27", pin: "411001", phone: "+919812345678", isDefault: false };
type Call = { method: string; path: string; body: any };
async function mount(element: React.ReactElement, route: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const call = { method: init?.method ?? "GET", path: new URL(String(input), "http://localhost:3000").pathname, body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    return route(call);
  };
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch() {} };
  const root = createRoot(document.getElementById("root")!);
  await act(async () => root.render(<AppRouterContext.Provider value={router}>{element}</AppRouterContext.Provider>));
  return { calls, cleanup: async () => { await act(async () => root.unmount()); globalThis.fetch = previous; } };
}
const field = (name: string) => document.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
function fill(values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    const element = field(name);
    assert.ok(element, `the ${name} field is shown`);
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")!.set!.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    element.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  }
}
const button = (label: RegExp, scope: ParentNode = document) => [...scope.querySelectorAll<HTMLButtonElement>("button")].find((b) => label.test(b.textContent ?? ""));
/** Clicks a button, failing as an assertion when the page does not offer it. */
async function press(label: RegExp, scope: ParentNode = document) {
  const found = button(label, scope);
  assert.ok(found, `"${label.source}" is offered`);
  await act(async () => found!.click());
}
const submit = () => act(async () => {
  const form = document.querySelector<HTMLFormElement>("form");
  assert.ok(form, "a form is shown");
  form!.requestSubmit();
});
const settle = async (ticks = 4) => { for (let i = 0; i < ticks; i++) await act(async () => { await new Promise((r) => setTimeout(r, 8)); }); };
const cards = () => [...document.querySelectorAll<HTMLElement>("[data-address]")];
const description = (element: Element | null) =>
  (element?.getAttribute("aria-describedby") ?? "").split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
const text = () => document.getElementById("root")!.textContent ?? "";

test("the default address comes first, marked, and another can be made the default", async () => {
  const { calls, cleanup } = await mount(<AddressBook initial={[home, studio]} />, (call) =>
    Response.json({ address: { ...studio, isDefault: true }, addresses: [{ ...studio, isDefault: true }, { ...home, isDefault: false }] }));
  try {
    assert.deepEqual(cards().map((card) => card.getAttribute("data-address")), [home.id, studio.id]);
    assert.match(cards()[0]!.textContent!, /Default/);
    assert.match(cards()[0]!.textContent!, /14 Palm Avenue, Apartment 402/);
    assert.match(cards()[0]!.textContent!, /Bengaluru, Karnataka 560001/);
    assert.equal(button(/make default/i, cards()[0]!), undefined, "the default has nothing to make default");
    await press(/make default/i, cards()[1]!);
    await settle();
    assert.deepEqual(calls.map((c) => [c.method, c.path, c.body]), [["PATCH", `/api/account/addresses/${studio.id}`, { isDefault: true }]]);
    assert.deepEqual(cards().map((card) => card.getAttribute("data-address")), [studio.id, home.id]);
    assert.match(cards()[0]!.textContent!, /Default/);
  } finally { await cleanup(); }
});

test("a new address is checked on the page with each problem tied to its field, then saved", async () => {
  const saved: AccountAddress = { ...studio, id: "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", line1: "22 Hill Road", city: "Mumbai", state: "27", pin: "400050" };
  const { calls, cleanup } = await mount(<AddressBook initial={[home]} />, () => Response.json({ address: saved, addresses: [home, saved] }, { status: 201 }));
  try {
    await press(/add an address/i);
    assert.equal(document.activeElement, field("name"), "the form opens at its first field");
    await submit();
    assert.equal(calls.length, 0, "nothing incomplete is sent");
    for (const name of ["name", "line1", "city", "state", "pin", "phone"]) {
      assert.equal(field(name)!.getAttribute("aria-invalid"), "true", name);
      assert.notEqual(description(field(name)).trim(), "", `${name} says what is wrong`);
    }
    assert.equal(document.activeElement, field("name"), "focus goes to the first problem");
    fill({ name: "Aditi Sharma", line1: "22 Hill Road", line2: "", city: "Mumbai", state: "27", pin: "400050", phone: "98123 45678" });
    await submit();
    await settle();
    assert.deepEqual(calls.map((c) => [c.method, c.path]), [["POST", "/api/account/addresses"]]);
    assert.deepEqual(calls[0]!.body, { name: "Aditi Sharma", line1: "22 Hill Road", line2: "", city: "Mumbai", state: "27", pin: "400050", phone: "+919812345678" });
    assert.equal(cards().length, 2);
    assert.equal(field("line1"), null, "the form closes once saved");
    assert.match(text(), /Address saved/);
  } finally { await cleanup(); }
});

test("editing sends only what changed, and removing asks first", async () => {
  const { calls, cleanup } = await mount(<AddressBook initial={[home, studio]} />, (call) =>
    call.method === "PATCH"
      ? Response.json({ address: { ...studio, city: "Mysuru", state: "29", pin: "570001" }, addresses: [home, { ...studio, city: "Mysuru", state: "29", pin: "570001" }] })
      : Response.json({ addresses: [home] }));
  try {
    await press(/^edit/i, cards()[1]!);
    assert.equal((field("line1") as HTMLInputElement).value, "Studio 3, Lake Road", "the form opens with the address in it");
    fill({ city: "Mysuru", state: "29", pin: "570001" });
    await submit();
    await settle();
    assert.deepEqual(calls[0], { method: "PATCH", path: `/api/account/addresses/${studio.id}`, body: { city: "Mysuru", state: "29", pin: "570001" } });
    assert.match(cards()[1]!.textContent!, /Mysuru, Karnataka 570001/);

    await press(/^remove/i, cards()[1]!);
    assert.equal(calls.length, 1, "one click does not delete");
    assert.match(cards()[1]!.textContent!, /Remove this address\?/);
    await press(/remove address/i, cards()[1]!);
    await settle();
    assert.deepEqual(calls[1], { method: "DELETE", path: `/api/account/addresses/${studio.id}`, body: null });
    assert.equal(cards().length, 1);
  } finally { await cleanup(); }
});

test("ten addresses is the most, and a session that ended asks the customer to sign in again", async () => {
  const ten = Array.from({ length: 10 }, (_, index) => ({ ...studio, id: `6a7b8c9d-0e1f-4a2b-9c3d-4e5f6a7b8c${String(index).padStart(2, "0")}`, isDefault: index === 0 }));
  let cleanup = (await mount(<AddressBook initial={ten} />, () => new Response(null, { status: 500 }))).cleanup;
  try {
    assert.equal(button(/add an address/i), undefined);
    assert.match(text(), /up to 10 addresses/);
  } finally { await cleanup(); }
  ({ cleanup } = await mount(<AddressBook initial={[home, studio]} />, () => Response.json({ code: "ACCOUNT_AUTH_REQUIRED", message: "Sign in." }, { status: 401 })));
  try {
    await press(/make default/i, cards()[1]!);
    await settle();
    assert.ok(document.querySelector('a[href="/account/login?next=%2Faccount%2Faddresses"]'), "a way back in, returning here");
    assert.match(text(), /signed out/i);
  } finally { await cleanup(); }
});

test("a full address book refused by the API says why", async () => {
  const { cleanup } = await mount(<AddressBook initial={[home]} />, () => Response.json({ code: "ADDRESS_LIMIT", message: "Ten addresses." }, { status: 409 }));
  try {
    await press(/add an address/i);
    fill({ name: "Aditi Sharma", line1: "22 Hill Road", city: "Mumbai", state: "27", pin: "400050", phone: "9812345678" });
    await submit();
    await settle();
    assert.match(text(), /up to 10 addresses/);
  } finally { await cleanup(); }
});

test("account details change the name and phone, and the sign-in email stays as it is", async () => {
  const customer = { name: "Aditi Sharma", email: "aditi.sharma@example.com", phone: "+919876543210" };
  const { calls, cleanup } = await mount(<AccountDetailsForm customer={customer} />, (call) => Response.json({ customer: { ...customer, ...call.body } }));
  try {
    assert.equal(field("email"), null, "the email is not a field");
    assert.match(text(), /aditi\.sharma@example\.com/);
    assert.equal((field("name") as HTMLInputElement).value, "Aditi Sharma");
    await submit();
    assert.equal(calls.length, 0, "nothing changed, nothing sent");
    assert.match(text(), /No changes to save/);

    fill({ phone: "12345" });
    await submit();
    assert.equal(calls.length, 0);
    assert.equal(field("phone")!.getAttribute("aria-invalid"), "true");
    assert.match(description(field("phone")), /10-digit mobile number/i);
    assert.equal(document.activeElement, field("phone"));

    fill({ phone: "98123 45678" });
    await submit();
    await settle();
    assert.deepEqual(calls[0], { method: "PATCH", path: "/api/account", body: { phone: "+919812345678" } });
    assert.match(text(), /Your details are saved/);

    fill({ name: "" });
    await submit();
    await settle();
    assert.deepEqual(calls[1]!.body, { name: null }, "an emptied name is cleared, not sent blank");
  } finally { await cleanup(); }
});
