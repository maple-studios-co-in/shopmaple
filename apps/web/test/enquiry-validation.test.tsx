import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { HomeProjectForm } from "../components/home-forms";
import { checkEnquiry, isPhoneNumber, type EnquiryValues } from "../lib/enquiry-validation";
import { installUiDom } from "./support/ui-dom";

// QA report, 16 Nov 2026: a bad value only ever drew "Please check your details and try again", the browser's email
// check passed "name@site" (which the enquiry service then refused), and a name of digits or a phone of letters went
// through. Every enquiry form now checks each box before sending and says, under the box, what to put right.

const values = (over: Partial<EnquiryValues> = {}): EnquiryValues => ({ name: "", email: "asha@example.com", phone: "", message: "", ...over });

test("names are letters in any script, with the marks names carry; digits and symbols are refused", () => {
  for (const name of ["Asha Rao", "Dr. A. D'Souza-Rao", "José Núñez", "आशा राव", "Zoë"]) assert.equal(checkEnquiry(values({ name }), { name: "required" }).name, undefined, name);
  assert.equal(checkEnquiry(values({ name: "123" }), {}).name, "Please use letters only for your name.");
  assert.equal(checkEnquiry(values({ name: "Asha_99" }), {}).name, "Please use letters only for your name.");
  assert.equal(checkEnquiry(values({ name: "A" }), {}).name, "Please enter your full name.");
  assert.equal(checkEnquiry(values(), { name: "required" }).name, "Please enter your name.");
  assert.equal(checkEnquiry(values(), { name: "optional" }).name, undefined, "an optional name may be left out");
});

test("an email must be complete: the enquiry service's own check, so nothing that passes here is refused there", () => {
  assert.equal(checkEnquiry(values({ email: "" }), {}).email, "Please enter your email address.");
  for (const email of ["testing@test", "asha@", "@example.com", "asha example@x.com", "asha"]) {
    assert.equal(checkEnquiry(values({ email }), {}).email, "Please enter a complete email address, like name@example.com.", email);
  }
  assert.equal(checkEnquiry(values({ email: " Asha@Example.com " }), {}).email, undefined);
});

test("a phone number is digits of the right length: ten for India (after 0 or 91 if given), or a + country code", () => {
  for (const phone of ["98765 43210", "+91 98765 43210", "098765-43210", "919876543210", "(011) 2345 6789", "+44 20 7946 0958", "+1 (415) 555-0100"]) {
    assert.ok(isPhoneNumber(phone), phone);
  }
  for (const phone of ["12345", "98765 4321", "0123456789", "+91 12345", "+91 0876543210", "98765432101234"]) assert.ok(!isPhoneNumber(phone), phone);
  assert.equal(checkEnquiry(values({ phone: "rghrthgsrgh" }), {}).phone, "Please use digits only for your phone number.");
  assert.equal(checkEnquiry(values({ phone: "12345" }), {}).phone, "Please enter a 10-digit phone number, or add your country code with +.");
  assert.equal(checkEnquiry(values(), { phone: "required" }).phone, "Please enter your phone number.");
  assert.equal(checkEnquiry(values(), { phone: "optional" }).phone, undefined);
});

test("a required message must be written in words; the form chooses what to ask for", () => {
  assert.equal(checkEnquiry(values(), { message: "required", messagePrompt: "Please tell us how we can help." }).message, "Please tell us how we can help.");
  assert.equal(checkEnquiry(values({ message: "!!!" }), { message: "required" }).message, "Please write your message in words.");
  assert.equal(checkEnquiry(values({ message: "Hello" }), { message: "required" }).message, undefined);
  assert.equal(checkEnquiry(values({ message: "" }), { message: "optional" }).message, undefined);
});

/** The homepage's enquiry card in a browser-like page; `fetch` records what the form sends. */
async function withProjectForm(run: (doc: Document, sent: unknown[]) => Promise<void>) {
  const dom = installUiDom("http://localhost:3000/");
  const globals = { FormData: globalThis.FormData };
  Object.assign(globalThis, { FormData: dom.window.FormData });
  const sent: unknown[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "/api/enquiries");
    sent.push(JSON.parse(String(init?.body)));
    return Response.json({ reference: "enq_00000000-0000-4000-8000-000000000000", mode: "preview", notificationSent: false });
  };
  // React's DOM is loaded once the window exists, so it reads typing through the browser's own input event, as it would
  // in a real browser, rather than an old-browser fallback.
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<HomeProjectForm card />));
    await run(document, sent);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
    Object.assign(globalThis, globals);
    dom.window.close();
  }
}
async function type(doc: Document, name: string, value: string) {
  const field = doc.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!;
  const view = doc.defaultView!;
  const proto = field instanceof view.HTMLTextAreaElement ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(field, value);
    field.dispatchEvent(new view.Event("input", { bubbles: true }));
  });
}
const send = async (doc: Document) => {
  await act(async () => { doc.querySelector("form")!.requestSubmit(); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
};
const problem = (doc: Document, name: string) => {
  const field = doc.querySelector(`[name="${name}"]`)!;
  const id = field.getAttribute("aria-describedby");
  return { invalid: field.getAttribute("aria-invalid"), text: id ? doc.getElementById(id)?.textContent ?? null : null };
};

test("the homepage form names each wrong box, moves to the first, sends nothing, and clears each message as it is put right", async () => {
  await withProjectForm(async (doc, sent) => {
    assert.equal(doc.querySelector("form")!.noValidate, true, "the form's own words, not the browser's");
    // The tester's values from the report.
    await type(doc, "name", "123");
    await type(doc, "email", "testing@test");
    await type(doc, "phone", "rghrthgsrgh");
    await type(doc, "message", "testing");
    await send(doc);
    assert.equal(sent.length, 0, "nothing is sent while a box is wrong");
    assert.deepEqual(problem(doc, "name"), { invalid: "true", text: "Please use letters only for your name." });
    assert.deepEqual(problem(doc, "email"), { invalid: "true", text: "Please enter a complete email address, like name@example.com." });
    assert.deepEqual(problem(doc, "phone"), { invalid: "true", text: "Please use digits only for your phone number." });
    assert.deepEqual(problem(doc, "message"), { invalid: null, text: null });
    assert.equal(doc.activeElement?.getAttribute("name"), "name", "the first wrong box takes the focus");
    assert.equal(doc.querySelector('[role="alert"]'), null, "no vague message under the button");
    // Putting a box right clears its message at once; the others stay until they are fixed too.
    await type(doc, "name", "Asha Rao");
    assert.deepEqual(problem(doc, "name"), { invalid: null, text: null });
    assert.equal(problem(doc, "email").invalid, "true");
    await type(doc, "email", "Asha@Example.com");
    await type(doc, "phone", "98765 43210");
    await send(doc);
    assert.deepEqual(sent, [{ kind: "project", name: "Asha Rao", email: "asha@example.com", phone: "98765 43210", message: "testing", context: { product: "", variant: "", sku: "", pincode: "" } }]);
    assert.match(doc.querySelector('[role="status"]')?.textContent ?? "", /Your enquiry has been saved/);
  });
});

test("only the email is needed on the homepage form: an empty name, phone and message are fine, an empty email is not", async () => {
  await withProjectForm(async (doc, sent) => {
    await type(doc, "email", "");
    await send(doc);
    assert.equal(sent.length, 0);
    assert.deepEqual(problem(doc, "email"), { invalid: "true", text: "Please enter your email address." });
    assert.equal(problem(doc, "name").invalid, null);
    await type(doc, "email", "dev@example.com");
    await send(doc);
    assert.equal(sent.length, 1);
  });
});
