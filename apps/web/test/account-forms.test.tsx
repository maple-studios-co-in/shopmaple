import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { addressInputSchema, type AccountAddress } from "@shopmaple/contracts/account";

// Saved addresses (Figma 392:1527 "Saved Address") and the customer's details (392:1585 "Edit Account").
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3000/account/addresses" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement, HTMLSelectElement: dom.window.HTMLSelectElement, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
const { AddressBook, newAddressRequest } = await import("../components/account/address-book");
const { AccountDetailsForm, splitName, tidyName } = await import("../components/account/account-details-form");
// The API from before addresses had names: the same strict request schema without `label` (main before PR 130).
const namelessApiSchema = addressInputSchema.omit({ label: true });

const home: AccountAddress = { id: "3f1d2c4b-5a6e-4f70-8a9b-0c1d2e3f4a5b", label: "Home", name: "Aditi Sharma", line1: "14 Palm Avenue", line2: "Apartment 402",
  city: "Bengaluru", state: "29", pin: "560001", phone: "+919876543210", isDefault: true };
// Saved before addresses had names: its card is headed by its city.
const studio: AccountAddress = { id: "6a7b8c9d-0e1f-4a2b-9c3d-4e5f6a7b8c9d", label: "", name: "Aditi Sharma", line1: "Studio 3, Lake Road", line2: "",
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
const submit = (selector = "form") => act(async () => {
  const form = document.querySelector<HTMLFormElement>(selector);
  assert.ok(form, "a form is shown");
  form!.requestSubmit();
});
const settle = async (ticks = 4) => { for (let i = 0; i < ticks; i++) await act(async () => { await new Promise((r) => setTimeout(r, 8)); }); };
const cards = () => [...document.querySelectorAll<HTMLElement>("[data-address]")];
const title = (card: HTMLElement) => card.querySelector("h2")?.textContent;
const description = (element: Element | null) =>
  (element?.getAttribute("aria-describedby") ?? "").split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
const text = () => document.getElementById("root")!.textContent ?? "";

test("each address is a card named for its place, the default first on its own colour, and another can be made the default", async () => {
  const { calls, cleanup } = await mount(<AddressBook initial={[home, studio]} />, () =>
    Response.json({ address: { ...studio, isDefault: true }, addresses: [{ ...studio, isDefault: true }, { ...home, isDefault: false }] }));
  try {
    assert.ok(button(/^Add new address$/), "the design's button opens a new address");
    assert.deepEqual(cards().map((card) => card.getAttribute("data-address")), [home.id, studio.id]);
    assert.deepEqual(cards().map(title), ["Home", "Pune"], "the place's name, else its city");
    assert.ok(cards()[0]!.hasAttribute("data-default"));
    assert.equal(cards()[1]!.hasAttribute("data-default"), false);
    assert.equal(cards()[0]!.querySelector(".account-address-badge")?.textContent, "Default address");
    assert.equal(cards()[1]!.querySelector(".account-address-badge"), null);
    // Who receives it, the address, and the number at a glance (Figma: "+91 98••• ••210").
    const lines = [...cards()[0]!.querySelectorAll(".account-address-lines .account-line")];
    assert.deepEqual(lines.slice(0, 3).map((line) => line.textContent), ["Aditi Sharma", "14 Palm Avenue, Apartment 402", "Bengaluru, Karnataka 560001"]);
    // The dots are shown, not read out: a screen reader hears "Phone number ending 210".
    assert.equal(lines[3]!.querySelector('[aria-hidden="true"]')?.textContent, "+91 98••• ••210");
    assert.equal(lines[3]!.querySelector(".sr-only")?.textContent, "Phone number ending 210");
    assert.equal(lines.length, 4);
    assert.equal(button(/set as default/i, cards()[0]!), undefined, "the default has nothing to make default");
    assert.match(button(/^edit address/i, cards()[0]!)!.textContent!, /Edit address, Home, 14 Palm Avenue/, "each button names its address");
    await press(/set as default/i, cards()[1]!);
    await settle();
    assert.deepEqual(calls.map((c) => [c.method, c.path, c.body]), [["PATCH", `/api/account/addresses/${studio.id}`, { isDefault: true }]]);
    assert.deepEqual(cards().map((card) => card.getAttribute("data-address")), [studio.id, home.id]);
    assert.ok(cards()[0]!.hasAttribute("data-default"));
    assert.match(text(), /Pune is now your default address\./);
  } finally { await cleanup(); }
});

test("a new address is checked on the page with each problem tied to its field, then saved with its name", async () => {
  const saved: AccountAddress = { ...studio, id: "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", label: "Office", line1: "22 Hill Road", city: "Mumbai", state: "27", pin: "400050" };
  const { calls, cleanup } = await mount(<AddressBook initial={[home]} />, () => Response.json({ address: saved, addresses: [home, saved] }, { status: 201 }));
  try {
    await press(/^add new address$/i);
    assert.equal(document.activeElement, field("label"), "the form opens at its first field");
    await submit();
    assert.equal(calls.length, 0, "nothing incomplete is sent");
    for (const name of ["name", "line1", "city", "state", "pin", "phone"]) {
      assert.equal(field(name)!.getAttribute("aria-invalid"), "true", name);
      assert.notEqual(description(field(name)).trim(), "", `${name} says what is wrong`);
    }
    assert.equal(field("label")!.getAttribute("aria-invalid"), null, "naming the place is optional");
    assert.equal(document.activeElement, field("name"), "focus goes to the first problem");
    fill({ label: "Office", name: "Aditi Sharma", line1: "22 Hill Road", line2: "", city: "Mumbai", state: "27", pin: "400050", phone: "98123 45678" });
    await submit();
    await settle();
    assert.deepEqual(calls.map((c) => [c.method, c.path]), [["POST", "/api/account/addresses"]]);
    assert.deepEqual(calls[0]!.body, { label: "Office", name: "Aditi Sharma", line1: "22 Hill Road", line2: "", city: "Mumbai", state: "27", pin: "400050", phone: "+919812345678" });
    assert.deepEqual(cards().map(title), ["Home", "Office"]);
    assert.equal(field("line1"), null, "the form closes once saved");
    assert.match(text(), /Address saved/);
  } finally { await cleanup(); }
});

test("editing sends only what changed, a name included, and removing asks first", async () => {
  const edited = { ...studio, label: "Studio", city: "Mysuru", state: "29", pin: "570001" };
  const { calls, cleanup } = await mount(<AddressBook initial={[home, studio]} />, (call) =>
    call.method === "PATCH" ? Response.json({ address: edited, addresses: [home, edited] }) : Response.json({ addresses: [home] }));
  try {
    await press(/^edit address/i, cards()[1]!);
    assert.equal((field("line1") as HTMLInputElement).value, "Studio 3, Lake Road", "the form opens with the address in it");
    assert.equal((field("phone") as HTMLInputElement).value, "+91 98123 45678", "the whole number, to edit");
    fill({ label: "Studio", city: "Mysuru", state: "29", pin: "570001" });
    await submit();
    await settle();
    assert.deepEqual(calls[0], { method: "PATCH", path: `/api/account/addresses/${studio.id}`, body: { label: "Studio", city: "Mysuru", state: "29", pin: "570001" } });
    assert.equal(title(cards()[1]!), "Studio");
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

test("a place's name is at most 40 characters of plain text", async () => {
  const { calls, cleanup } = await mount(<AddressBook initial={[home]} />, () => new Response(null, { status: 500 }));
  try {
    await press(/^edit address/i, cards()[0]!);
    // Too long, or holding a control character (a pasted tab): the same message fits both.
    for (const label of ["x".repeat(41), "Home\tOffice"]) {
      fill({ label });
      await submit();
      assert.equal(calls.length, 0, JSON.stringify(label));
      assert.equal(field("label")!.getAttribute("aria-invalid"), "true");
      assert.equal(description(field("label")).trim(), "Name the place in plain text, up to 40 characters.");
    }
  } finally { await cleanup(); }
});

test("a place left unnamed sends no label, so an API from before addresses had names still saves it", async () => {
  const blank = { label: "", name: "Aditi Sharma", line1: "22 Hill Road", line2: "", city: "Mumbai", state: "27", pin: "400050", phone: "+919812345678" };
  assert.equal("label" in newAddressRequest(blank), false, "a blank name is left out");
  assert.equal(newAddressRequest({ ...blank, label: "Office" }).label, "Office", "a given name is sent");
  assert.equal(namelessApiSchema.safeParse(newAddressRequest(blank)).success, true, "the older API takes it");
  assert.equal(namelessApiSchema.safeParse(blank).success, false, "as it would not with an empty label");

  const saved: AccountAddress = { ...studio, id: "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", line1: "22 Hill Road", city: "Mumbai", state: "27", pin: "400050" };
  const { calls, cleanup } = await mount(<AddressBook initial={[studio]} />, (call) =>
    call.method === "POST" ? Response.json({ address: saved, addresses: [studio, saved] }, { status: 201 })
      : Response.json({ address: { ...studio, city: "Satara" }, addresses: [{ ...studio, city: "Satara" }, saved] }));
  try {
    await press(/^add new address$/i);
    fill({ label: "   ", name: "Aditi Sharma", line1: "22 Hill Road", city: "Mumbai", state: "27", pin: "400050", phone: "98123 45678" });
    await submit();
    await settle();
    assert.equal(calls[0]!.method, "POST");
    assert.deepEqual(calls[0]!.body, { name: "Aditi Sharma", line1: "22 Hill Road", line2: "", city: "Mumbai", state: "27", pin: "400050", phone: "+919812345678" });
    assert.equal(namelessApiSchema.safeParse(calls[0]!.body).success, true);

    // Editing an address an older API returned (no name, read as "") leaves the name out too.
    await press(/^edit address/i, cards()[0]!);
    fill({ city: "Satara" });
    await submit();
    await settle();
    assert.deepEqual(calls[1], { method: "PATCH", path: `/api/account/addresses/${studio.id}`, body: { city: "Satara" } });
  } finally { await cleanup(); }
});

test("closing the form puts focus back on what opened it, else on the list's heading", async () => {
  const nine = Array.from({ length: 9 }, (_, index) => ({ ...studio, id: `6a7b8c9d-0e1f-4a2b-9c3d-4e5f6a7b8c${String(index).padStart(2, "0")}`, isDefault: index === 0 }));
  const tenth: AccountAddress = { ...studio, id: "6a7b8c9d-0e1f-4a2b-9c3d-4e5f6a7b8c99", isDefault: false };
  const { cleanup } = await mount(<AddressBook initial={nine} />, (call) =>
    call.method === "POST" ? Response.json({ address: tenth, addresses: [...nine, tenth] }, { status: 201 })
      : Response.json({ address: { ...nine[3]!, city: "Satara" }, addresses: nine.map((a, i) => (i === 3 ? { ...a, city: "Satara" } : a)) }));
  try {
    const editOf = (index: number) => button(/^edit address/i, cards()[index]!);
    // Cancel from an address's form: back to that address's "Edit address".
    await press(/^edit address/i, cards()[2]!);
    await press(/^Cancel$/);
    await settle(1);
    assert.ok(document.activeElement === editOf(2), "Cancel: focus is on that address's Edit address");
    // Saved: the same.
    await press(/^edit address/i, cards()[3]!);
    fill({ city: "Satara" });
    await submit();
    await settle();
    assert.ok(document.activeElement === editOf(3), "saved: focus is on that address's Edit address");
    // Cancel from a new address: back to "Add new address".
    await press(/^add new address$/i);
    await press(/^Cancel$/);
    await settle(1);
    assert.ok(document.activeElement === button(/^add new address$/i), "focus is on Add new address");
    // The tenth address saved: "Add new address" is gone, so the list's heading takes focus, never the page itself.
    await press(/^add new address$/i);
    fill({ name: "Aditi Sharma", line1: "Studio 3, Lake Road", city: "Pune", state: "27", pin: "411001", phone: "98123 45678" });
    await submit();
    await settle();
    assert.equal(button(/^add new address$/i), undefined);
    assert.ok(document.activeElement !== document.body, "focus did not fall to the page");
    assert.equal(document.activeElement?.tagName, "H2");
    assert.equal(document.activeElement?.textContent, "Saved addresses");
    assert.equal(document.querySelector(".account-address-list")?.getAttribute("aria-labelledby"), document.activeElement?.id, "it names the list");
  } finally { await cleanup(); }
});

test("ten addresses is the most, and a session that ended asks the customer to sign in again", async () => {
  const ten = Array.from({ length: 10 }, (_, index) => ({ ...studio, id: `6a7b8c9d-0e1f-4a2b-9c3d-4e5f6a7b8c${String(index).padStart(2, "0")}`, isDefault: index === 0 }));
  let cleanup = (await mount(<AddressBook initial={ten} />, () => new Response(null, { status: 500 }))).cleanup;
  try {
    assert.equal(button(/add new address/i), undefined);
    assert.match(text(), /up to 10 addresses/);
  } finally { await cleanup(); }
  ({ cleanup } = await mount(<AddressBook initial={[home, studio]} />, () => Response.json({ code: "ACCOUNT_AUTH_REQUIRED", message: "Sign in." }, { status: 401 })));
  try {
    await press(/set as default/i, cards()[1]!);
    await settle();
    assert.ok(document.querySelector('a[href="/account/login?next=%2Faccount%2Faddresses"]'), "a way back in, returning here");
    assert.match(text(), /signed out/i);
  } finally { await cleanup(); }
});

test("a full address book refused by the API says why", async () => {
  const { cleanup } = await mount(<AddressBook initial={[home]} />, () => Response.json({ code: "ADDRESS_LIMIT", message: "Ten addresses." }, { status: 409 }));
  try {
    await press(/add new address/i);
    fill({ name: "Aditi Sharma", line1: "22 Hill Road", city: "Mumbai", state: "27", pin: "400050", phone: "9812345678" });
    await submit();
    await settle();
    assert.match(text(), /up to 10 addresses/);
  } finally { await cleanup(); }
});

test("one name is asked as first and last name: the first word, then the rest", () => {
  assert.deepEqual(splitName("Aditi Sharma"), { first: "Aditi", last: "Sharma" });
  assert.deepEqual(splitName("  Aditi   Rao  Sharma "), { first: "Aditi", last: "Rao Sharma" });
  assert.deepEqual(splitName("Aditi"), { first: "Aditi", last: "" });
  assert.deepEqual(splitName(null), { first: "", last: "" });
  assert.equal(tidyName("  Asha   Rao "), "Asha Rao");
  assert.equal(tidyName("   "), null);
  assert.equal(tidyName(null), null);
});

test("a saved name with extra spaces is not a change, and each name field takes the account's 120 characters", async () => {
  const customer = { name: "Asha  Rao", email: "asha@example.com", phone: null };
  const { calls, cleanup } = await mount(<AccountDetailsForm customer={customer} />, (call) => Response.json({ customer: { ...customer, ...call.body } }));
  try {
    assert.equal((field("firstName") as HTMLInputElement).value, "Asha");
    assert.equal((field("lastName") as HTMLInputElement).value, "Rao");
    await submit();
    assert.equal(calls.length, 0, "Save with nothing edited sends nothing");
    assert.match(text(), /No changes to save/);

    assert.equal((field("firstName") as HTMLInputElement).maxLength, 120);
    assert.equal((field("lastName") as HTMLInputElement).maxLength, 120);
    // The whole name is still at most 120: each field alone may hold it, together they may not.
    fill({ firstName: "a".repeat(61), lastName: "b".repeat(61) });
    await submit();
    assert.equal(calls.length, 0);
    assert.equal(field("lastName")!.getAttribute("aria-invalid"), "true");
    assert.match(description(field("lastName")), /120 characters in all/);
    fill({ firstName: "a".repeat(120), lastName: "" });
    await submit();
    await settle();
    assert.deepEqual(calls[0]!.body, { name: "a".repeat(120) });
  } finally { await cleanup(); }
});

test("your details change the name and phone, the sign-in email stays as it is, and Cancel puts back what is saved", async () => {
  const customer = { name: "Aditi Sharma", email: "aditi.sharma@example.com", phone: "+919876543210" };
  const { calls, cleanup } = await mount(<AccountDetailsForm customer={customer} />, (call) => Response.json({ customer: { ...customer, ...call.body } }));
  try {
    const email = document.querySelector<HTMLInputElement>('input[type="email"]')!;
    assert.equal(email.value, "aditi.sharma@example.com");
    assert.equal(email.readOnly, true, "the sign-in email is shown, not edited");
    assert.equal(email.name, "", "and never sent");
    assert.equal((field("firstName") as HTMLInputElement).value, "Aditi");
    assert.equal((field("lastName") as HTMLInputElement).value, "Sharma");
    assert.equal((field("phone") as HTMLInputElement).value, "+91 98765 43210");
    assert.ok(button(/^Save changes$/) && button(/^Cancel$/) && button(/^Change password$/), "the design's three buttons");
    assert.equal(button(/^Save changes$/)!.getAttribute("form"), document.querySelector("form")!.id, "Save changes sends the details form");
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
    await act(async () => button(/^Save changes$/)!.click());
    await settle();
    assert.deepEqual(calls[0], { method: "PATCH", path: "/api/account", body: { phone: "+919812345678" } });
    assert.match(text(), /Your details are saved/);

    fill({ firstName: "Aditi", lastName: "Rao Sharma" });
    await submit();
    await settle();
    assert.deepEqual(calls[1]!.body, { name: "Aditi Rao Sharma" }, "first and last name are kept as one name");

    fill({ firstName: "Someone", lastName: "Else" });
    await press(/^Cancel$/);
    assert.equal((field("firstName") as HTMLInputElement).value, "Aditi", "Cancel puts back what is saved");
    assert.equal((field("lastName") as HTMLInputElement).value, "Rao Sharma");

    fill({ firstName: "", lastName: "" });
    await submit();
    await settle();
    assert.deepEqual(calls[2]!.body, { name: null }, "an emptied name is cleared, not sent blank");
  } finally { await cleanup(); }
});

test("Change password emails a code to the sign-in address; the code and a new password set it", async () => {
  const customer = { name: "Aditi Sharma", email: "aditi.sharma@example.com", phone: null };
  let wrongFirst = true;
  const { calls, cleanup } = await mount(<AccountDetailsForm customer={customer} resendCooldownMs={0} />, (call) => {
    if (call.path === "/api/account/sign-in/start") return Response.json({ ok: true }, { status: 202 });
    if (call.path === "/api/account/sign-in/verify") {
      if (wrongFirst) { wrongFirst = false; return Response.json({ code: "CODE_INVALID", message: "Wrong code." }, { status: 400 }); }
      return Response.json({ customer });
    }
    return new Response(null, { status: 404 });
  });
  try {
    assert.equal(field("code"), null, "nothing to fill until the customer asks");
    await press(/^Change password$/);
    await settle();
    assert.deepEqual(calls.map((c) => [c.method, c.path, c.body]), [["POST", "/api/account/sign-in/start", { email: "aditi.sharma@example.com", purpose: "reset" }]]);
    assert.match(text(), /We’ve sent a 6-digit code to aditi\.sharma@example\.com\./);
    assert.equal(document.activeElement, field("code"));

    await submit(".account-password-form");
    assert.match(description(field("code")), /Enter the 6-digit code/);
    fill({ code: "123456", password: "short" });
    await submit(".account-password-form");
    assert.match(description(field("password")), /at least 8 characters, including a number/i);
    assert.equal(calls.length, 1, "nothing is sent until both are right");

    fill({ password: "newpass123" });
    await submit(".account-password-form");
    await settle();
    assert.deepEqual(calls[1]!.body, { email: "aditi.sharma@example.com", code: "123456", password: "newpass123" });
    assert.match(description(field("code")), /That code isn’t right/);

    fill({ code: "654321" });
    await submit(".account-password-form");
    await settle();
    assert.equal(field("code"), null, "the code step closes");
    assert.match(text(), /Your password is changed\. You’re still signed in here; other devices were signed out\./);
    assert.ok(button(/^Change password$/), "and it can be changed again");
  } finally { await cleanup(); }
});
