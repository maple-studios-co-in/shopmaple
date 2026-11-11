import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act, type ReactElement } from "react";

// The sign-in pages (owner's spec, 11 Nov 2026): password sign-in (Figma 392:1652), sign-up (392:1697) proven by an
// emailed code, and "Forgot password?" (an emailed code, then a new password).
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3000/account/login" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import("react-dom/client");
const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
const { LoginForm, SignUpForm, ForgotPasswordForm } = await import("../components/account/auth/auth-forms");
const { authHref, safeAuthNext, safeNextPath } = await import("../lib/account/next-path");

type Call = { method: string; path: string; body: any };
async function mount(element: ReactElement, route: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const navigation: string[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const call = { method: init?.method ?? "GET", path: new URL(String(input), "http://localhost:3000").pathname, body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    return route(call);
  };
  const router = { bfcacheId: "test", back() {}, forward() {}, hmrRefresh() {}, prefetch() {},
    refresh() { navigation.push("refresh"); }, push(href: string) { navigation.push(`push ${href}`); }, replace(href: string) { navigation.push(`replace ${href}`); } };
  const root = createRoot(document.getElementById("root")!);
  await act(async () => root.render(<AppRouterContext.Provider value={router}>{element}</AppRouterContext.Provider>));
  return { calls, navigation, cleanup: async () => { await act(async () => root.unmount()); globalThis.fetch = previous; } };
}
const input = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
function type(name: string, value: string) {
  const element = input(name);
  assert.ok(element, `the ${name} field is shown`);
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  element.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
}
const submit = () => act(async () => { document.querySelector<HTMLFormElement>("form")!.requestSubmit(); });
const settle = async (ticks = 6) => { for (let i = 0; i < ticks; i++) await act(async () => { await new Promise((r) => setTimeout(r, 8)); }); };
const button = (label: RegExp) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => label.test(b.textContent ?? ""));
const link = (label: RegExp) => [...document.querySelectorAll<HTMLAnchorElement>("a")].find((a) => label.test(a.textContent ?? ""));
const description = (element: HTMLElement | null) =>
  (element?.getAttribute("aria-describedby") ?? "").split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
const heading = () => document.querySelector("h1")?.textContent ?? "";
const accepted = () => Response.json({ ok: true }, { status: 202 });
const customer = { customer: { name: "Aditi Sharma", email: "aditi.sharma@example.com", phone: null } };
const refused = (code: string) => Response.json({ code, message: "Fixed sentence." }, { status: 400 });

// ---- Login ------------------------------------------------------------------------------------------------------------

test("login: Figma 392:1652's words and links, which keep where the visitor was going", async () => {
  const { cleanup } = await mount(<LoginForm next="/checkout" />, accepted);
  try {
    assert.equal(heading(), "Welcome back.");
    assert.match(document.body.textContent ?? "", /Sign in to your own corner of Maple\./);
    assert.equal(input("email")!.getAttribute("placeholder"), "you@example.com");
    assert.equal(input("password")!.getAttribute("type"), "password");
    assert.equal(input("password")!.getAttribute("autocomplete"), "current-password");
    assert.equal(link(/Forgot password\?/)!.getAttribute("href"), "/account/forgot-password?next=%2Fcheckout");
    assert.equal(link(/Create an account/)!.getAttribute("href"), "/account/sign-up?next=%2Fcheckout");
    assert.ok(button(/^Sign in$/));
  } finally { await cleanup(); }
});

test("login: a bad email or an empty password is caught on the page and never sent", async () => {
  const { calls, cleanup } = await mount(<LoginForm next="/account" />, accepted);
  try {
    type("email", "aditi@");
    type("password", "secret123");
    await submit();
    assert.equal(calls.length, 0);
    assert.equal(input("email")!.getAttribute("aria-invalid"), "true");
    assert.match(description(input("email")), /valid email/i);
    assert.equal(document.activeElement, input("email"));
    type("email", "aditi.sharma@example.com");
    type("password", "");
    await submit();
    assert.equal(calls.length, 0);
    assert.match(description(input("password")), /enter your password/i);
    assert.equal(document.activeElement, input("password"));
  } finally { await cleanup(); }
});

test("login: the email is keyed as the account keys it, the password goes exactly as typed, and success returns safely", async () => {
  for (const [next, target] of [["/checkout", "/checkout"], ["//evil.example/steal", "/account"], ["/account/login", "/account"]] as const) {
    const { calls, navigation, cleanup } = await mount(<LoginForm next={next} />, () => Response.json(customer));
    try {
      type("email", "  Aditi.Sharma@Example.com ");
      type("password", " pass word 9 ");
      await submit();
      await settle();
      assert.deepEqual(calls.map((call) => [call.method, call.path]), [["POST", "/api/account/sign-in/password"]]);
      assert.deepEqual(calls[0]!.body, { email: "aditi.sharma@example.com", password: " pass word 9 " }, "spaces are part of a password");
      assert.deepEqual(navigation, [`replace ${target}`, "refresh"], next);
    } finally { await cleanup(); }
  }
});

test("login: a wrong password, too many tries and an outage each say what to do, on the password field", async () => {
  let answer = () => refused("CREDENTIALS_INVALID");
  const { navigation, cleanup } = await mount(<LoginForm next="/account" />, () => answer());
  try {
    type("email", "aditi.sharma@example.com");
    type("password", "wrongpass1");
    await submit();
    await settle();
    assert.equal(input("password")!.getAttribute("aria-invalid"), "true");
    assert.match(description(input("password")), /don.t match.*reset your password/i);
    assert.equal(document.activeElement, input("password"));
    answer = () => refused("TOO_MANY_ATTEMPTS");
    await submit();
    await settle();
    assert.match(description(input("password")), /too many tries/i);
    answer = () => { throw new TypeError("offline"); };
    await submit();
    await settle();
    assert.match(description(input("password")), /couldn.t reach maple/i);
    assert.equal(button(/^Sign in$/)!.disabled, false, "the visitor can try again");
    assert.deepEqual(navigation, []);
  } finally { await cleanup(); }
});

// ---- Sign-up ----------------------------------------------------------------------------------------------------------

test("sign-up: Figma 392:1697's fields and words; nothing is sent until the details pass", async () => {
  const { calls, cleanup } = await mount(<SignUpForm next="/account" resendCooldownMs={0} />, accepted);
  try {
    assert.equal(heading(), "Create your account");
    for (const name of ["firstName", "lastName", "email", "password"]) assert.ok(input(name), name);
    assert.equal(input("password")!.getAttribute("autocomplete"), "new-password");
    assert.match(description(input("password")), /At least 8 characters, including a number\./);
    assert.equal(link(/^Terms$/)!.getAttribute("href"), "/policies/terms-of-service");
    assert.equal(link(/Privacy Policy/)!.getAttribute("href"), "/policies/privacy-policy");
    assert.equal(link(/^Sign in$/)!.getAttribute("href"), "/account/login");

    await submit();
    assert.match(description(input("firstName")), /first name/i);
    type("firstName", "Aditi");
    type("email", "not-an-email");
    await submit();
    assert.match(description(input("email")), /valid email/i);
    type("email", "aditi.sharma@example.com");
    for (const weak of ["short1", "longbutnonumber"]) {
      type("password", weak);
      await submit();
      assert.match(description(input("password")), /8 characters, including a number/i, weak);
      assert.equal(document.activeElement, input("password"));
    }
    assert.equal(calls.length, 0, "no code is asked for until every field passes");
  } finally { await cleanup(); }
});

test("sign-up: the code step reads the same whatever the API says, then the code proves the email and keeps the password", async () => {
  const messages: string[] = [];
  for (const outcome of [accepted, () => new Response("upstream error", { status: 502 }), () => { throw new TypeError("offline"); }]) {
    const { calls, navigation, cleanup } = await mount(<SignUpForm next="/checkout" resendCooldownMs={0} />, (call) =>
      call.path.endsWith("/start") ? outcome() : Response.json(customer));
    try {
      type("firstName", "  Aditi ");
      type("lastName", "Sharma");
      type("email", " Aditi.Sharma@Example.com");
      type("password", "maple2026");
      await submit();
      await settle();
      const starts = calls.filter((call) => call.path === "/api/account/sign-in/start");
      assert.deepEqual(starts.map((call) => call.body), [{ email: "aditi.sharma@example.com", purpose: "sign-up" }]);
      assert.equal(document.activeElement, input("code"), "focus moves to the code");
      messages.push(document.querySelector("[data-sign-in-sent]")?.textContent ?? "");
      type("code", "123 456");
      await submit();
      await settle();
      const verifies = calls.filter((call) => call.path === "/api/account/sign-in/verify");
      assert.deepEqual(verifies.map((call) => call.body), [{ email: "aditi.sharma@example.com", code: "123456", password: "maple2026", name: "Aditi Sharma" }]);
      assert.deepEqual(navigation, ["replace /checkout", "refresh"]);
    } finally { await cleanup(); }
  }
  assert.equal(new Set(messages).size, 1, "an outage reads exactly like a sent code");
  assert.match(messages[0]!, /aditi\.sharma@example\.com/);
});

test("sign-up: a wrong or used-up code is explained, a new one can be sent, and the details can be changed", async () => {
  let verify = "CODE_INVALID";
  const { calls, cleanup } = await mount(<SignUpForm next="/account" resendCooldownMs={0} />, (call) =>
    call.path.endsWith("/start") ? accepted() : refused(verify));
  try {
    type("firstName", "Aditi");
    type("email", "aditi.sharma@example.com");
    type("password", "maple2026");
    await submit();
    await settle();
    type("code", "12ab");
    await submit();
    assert.equal(calls.filter((call) => call.path.endsWith("/verify")).length, 0, "a code that is not six digits never leaves the page");
    type("code", "654321");
    await submit();
    await settle();
    assert.match(description(input("code")), /isn.t right/i);
    verify = "TOO_MANY_ATTEMPTS";
    await submit();
    await settle();
    assert.equal(button(/^Create account$/)!.disabled, true, "a used-up code cannot be tried again");
    await act(async () => button(/send a new code/i)!.click());
    await settle();
    assert.equal(calls.filter((call) => call.path.endsWith("/start")).length, 2);
    assert.equal(button(/^Create account$/)!.disabled, false);
    await act(async () => button(/change your details/i)!.click());
    await settle();
    assert.equal(input("email")!.value, "aditi.sharma@example.com", "what was typed is kept");
    assert.equal(input("firstName")!.value, "Aditi");
    assert.equal(document.activeElement, input("email"));
  } finally { await cleanup(); }
});

// ---- Forgot password --------------------------------------------------------------------------------------------------

test("forgot password: the email, then the code with a new password that must follow the rules, then signed in", async () => {
  const { calls, navigation, cleanup } = await mount(<ForgotPasswordForm next="/account/orders" resendCooldownMs={0} />, (call) =>
    call.path.endsWith("/start") ? accepted() : Response.json(customer));
  try {
    assert.equal(heading(), "Reset your password.");
    assert.equal(link(/^Sign in$/)!.getAttribute("href"), "/account/login?next=%2Faccount%2Forders");
    type("email", "Aditi.Sharma@example.com");
    await submit();
    await settle();
    assert.deepEqual(calls.map((call) => call.body), [{ email: "aditi.sharma@example.com", purpose: "reset" }]);
    assert.equal(heading(), "Check your email.");
    type("code", "123456");
    type("password", "short");
    await submit();
    assert.equal(calls.length, 1, "a password that breaks the rules never spends the code");
    assert.match(description(input("password")), /8 characters, including a number/i);
    type("password", "newmaple77");
    await submit();
    await settle();
    assert.deepEqual(calls[1]!.body, { email: "aditi.sharma@example.com", code: "123456", password: "newmaple77" });
    assert.deepEqual(navigation, ["replace /account/orders", "refresh"]);
  } finally { await cleanup(); }
});

// ---- Where each page leads --------------------------------------------------------------------------------------------

test("?next= is honoured only for a path on this site, and never for a sign-in page itself", () => {
  const cases: Array<[unknown, string]> = [
    ["/checkout", "/checkout"],
    ["/account/orders?tab=delivered#list", "/account/orders?tab=delivered#list"],
    ["/%2F%2Fevil.example", "/%2F%2Fevil.example"],
    ["//evil.example", "/account"],
    // Dot segments that URL parsing collapses into "//evil.example" after a check of the raw text (security review,
    // 11 Nov 2026): the result is checked again once normalised.
    ["/.//evil.example", "/account"],
    ["/..//evil.example", "/account"],
    ["/%2e//evil.example", "/account"],
    ["/%2E%2E//evil.example", "/account"],
    ["/x/..//evil.example/login", "/account"],
    ["/./checkout", "/checkout"],
    ["https://evil.example/checkout", "/account"],
    ["/\\evil.example", "/account"],
    ["javascript:alert(1)", "/account"],
    ["checkout", "/account"],
    ["/\tcheckout", "/account"],
    ["", "/account"],
    [undefined, "/account"],
    [["/checkout"], "/account"],
    ["/" + "a".repeat(600), "/account"],
  ];
  for (const [raw, expected] of cases) assert.equal(safeNextPath(raw), expected, JSON.stringify(raw));
  assert.equal(safeNextPath("//evil.example", "/checkout"), "/checkout", "a caller may name its own fallback");
  for (const loop of ["/account/login", "/account/sign-up?next=/checkout", "/account/forgot-password#x", "/account/login/"])
    assert.equal(safeAuthNext(loop), "/account", loop);
  assert.equal(safeAuthNext("/account/loginhelp"), "/account/loginhelp", "only the sign-in pages themselves");
  assert.equal(authHref("login"), "/account/login");
  assert.equal(authHref("login", "/checkout"), "/account/login?next=%2Fcheckout");
  assert.equal(authHref("sign-up", "//evil.example"), "/account/sign-up");
  assert.equal(authHref("forgot-password", "/account", true), "/account/forgot-password?preview=design");
});
