import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import * as accountRoute from "../app/account/(signed-in)/page";
import * as ordersRoute from "../app/account/(signed-in)/orders/page";
import * as orderRoute from "../app/account/(signed-in)/orders/[number]/page";
import * as addressesRoute from "../app/account/(signed-in)/addresses/page";
import * as detailsRoute from "../app/account/(signed-in)/details/page";
import { setRequestCookies } from "./support/next-headers";

// The account pages (Figma 392:1255, 392:1338, 392:1432; owner's spec, 10 Nov 2026), rendered on the server with the
// API answering through a stand-in fetch.
type Route = { default: (props: any) => Promise<React.ReactNode>; dynamic?: string; metadata?: { robots?: unknown } };
type Seen = { path: string; cookie: string | null };
const on = { status: "ok", catalogMode: "preview", checkoutEnabled: false, accountsEnabled: true };
const off = { ...on, accountsEnabled: false };
const signedOut = () => Response.json({ code: "ACCOUNT_AUTH_REQUIRED", message: "Sign in to continue." }, { status: 401 });
const accountsOff = () => Response.json({ code: "NOT_FOUND", message: "Not found." }, { status: 404 });

const address = { id: "3f1d2c4b-5a6e-4f70-8a9b-0c1d2e3f4a5b", label: "Home", name: "Aditi Sharma", line1: "14 Palm Avenue", line2: "Apartment 402", city: "Bengaluru",
  state: "29", pin: "560001", phone: "+919876543210", isDefault: true };
const summary = { number: "MF-10482", placedAt: "2026-11-10T06:30:00.000Z", status: "confirmed", statusLabel: "Confirmed", itemCount: 1, totalPaise: 2640000,
  firstItem: { title: "Nola Accent Chair", variant: "Natural cane · Oak finish", imageUrl: "https://store.maplefurnishers.com/media/keeri/nola_01.webp" } };
const overview = { customer: { name: "Aditi Sharma", email: "aditi.sharma@example.com", phone: "+919876543210" }, counts: { orders: 3, addresses: 2 },
  latestOrder: summary, defaultAddress: address };
const detail = {
  ...summary,
  items: [{ title: "Nola Accent Chair", variant: "Natural cane · Oak finish", quantity: 1, linePaise: 2490000, imageUrl: null }],
  delivery: { name: "Aditi Sharma", line1: "14 Palm Avenue", line2: "Apartment 402", city: "Bengaluru", state: "29", pin: "560001", phone: "+91 ••••• •3210" },
  totals: { subtotalPaise: 2490000, deliveryPaise: 150000, taxPaise: 379831, totalPaise: 2640000, taxIncluded: true },
  payment: { label: "Paid online", reference: "pay_QX1a2b3c4d" },
  estimate: { from: "2026-11-24", to: "2026-11-28" },
  journey: [
    { key: "confirmed", label: "Confirmed", state: "done", at: "2026-11-10T06:35:00.000Z" },
    { key: "preparing", label: "Preparing", state: "upcoming", at: null },
    { key: "dispatched", label: "Dispatched", state: "upcoming", at: null },
    { key: "delivered", label: "Delivered", state: "upcoming", at: null },
  ],
};

async function visit(route: Route, props: { searchParams?: Record<string, string>; params?: Record<string, string> }, answer: (path: string) => Response | Promise<Response>) {
  const seen: Seen[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    seen.push({ path, cookie: new Headers(init?.headers).get("cookie") });
    return answer(path);
  };
  try {
    let tree: React.ReactNode;
    try {
      tree = await route.default({ searchParams: Promise.resolve(props.searchParams ?? {}), params: Promise.resolve(props.params ?? {}) });
    } catch (error) {
      const digest = String((error as { digest?: unknown }).digest ?? error);
      return { seen, html: "", digest, redirect: digest.startsWith("NEXT_REDIRECT;") ? digest.split(";").slice(2, -2).join(";") : null };
    }
    const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
    const stream = await renderToReadableStream(<AppRouterContext.Provider value={router}>{tree}</AppRouterContext.Provider>);
    await stream.allReady;
    return { seen, html: (await new Response(stream).text()).replace(/<!--.*?-->/g, ""), digest: null, redirect: null };
  } finally {
    globalThis.fetch = previous;
  }
}
const api = (routes: Record<string, () => Response>) => (path: string) => (routes[path] ?? (() => new Response(null, { status: 599 })))();
afterEach(() => setRequestCookies({}));

test("every account page is rendered per request, never stored and kept out of search engines", async () => {
  for (const route of [accountRoute, ordersRoute, orderRoute, addressesRoute, detailsRoute] as Route[]) {
    assert.equal(route.dynamic, "force-dynamic");
    assert.deepEqual(route.metadata?.robots, { index: false, follow: false });
  }
  const { default: config } = await import("../next.config");
  const rules = await config.headers!();
  assert.deepEqual(rules.find((rule) => rule.source === "/account/:path*")?.headers, [{ key: "Cache-Control", value: "private, no-store" }]);
});

test("with accounts switched off, /account keeps today's page and asks nothing else", async () => {
  for (const health of [() => Response.json(off), () => new Response("<html>", { status: 502 }), () => { throw new Error("connection refused"); }]) {
    const { html, seen } = await visit(accountRoute, {}, (path) => (path === "/api/health" ? health() : accountsOff()));
    assert.match(html, /Online account sign-in and order history are not available on this storefront yet\./);
    assert.deepEqual(seen.map((s) => s.path), ["/api/health"]);
  }
});

test("signed out, /account leads to the login page, carrying a safe ?next= on to it", async () => {
  const { redirect, seen } = await visit(accountRoute, { searchParams: { next: "/checkout" } }, api({ "/api/health": () => Response.json(on), "/api/account": signedOut }));
  // Without a session cookie there is nothing to ask the account API (security review, 11 Nov 2026: every server-side
  // read shares the API's loopback rate bucket, so anonymous visits must not spend it).
  assert.deepEqual(seen.map((s) => s.path), ["/api/health"]);
  assert.equal(redirect, "/account/login?next=%2Fcheckout");
  const plain = await visit(accountRoute, {}, api({ "/api/health": () => Response.json(on), "/api/account": signedOut }));
  assert.equal(plain.redirect, "/account/login");
  const unsafe = await visit(accountRoute, { searchParams: { next: "//evil.example" } }, api({ "/api/health": () => Response.json(on), "/api/account": signedOut }));
  assert.equal(unsafe.redirect, "/account/login");
});

test("the sign-in pages: Figma's words, never cached or indexed, closed while accounts are off, skipped once signed in", async () => {
  const routes = {
    login: await import("../app/account/(auth)/login/page"),
    signUp: await import("../app/account/(auth)/sign-up/page"),
    forgot: await import("../app/account/(auth)/forgot-password/page"),
  };
  for (const [route, words] of [
    [routes.login, ["Welcome back.", "Sign in to your own corner of Maple.", "Forgot password?", "New to Maple?", "Just browsing?", "Continue as guest",
      "Good living", "begins at home.", "Back to shop"]],
    [routes.signUp, ["Create your account", "Your Maple story starts here.", "First name", "Last name", "At least 8 characters, including a number.",
      "By joining, you agree to our", "Already have an account?", "Thoughtfully made. Personally yours.", "A home.", "Entirely you."]],
    [routes.forgot, ["Reset your password.", "Send code", "Remembered it?"]],
  ] as Array<[Route, string[]]>) {
    assert.equal(route.dynamic, "force-dynamic");
    assert.deepEqual(route.metadata?.robots, { index: false, follow: false });
    const { html, seen } = await visit(route, { searchParams: { next: "/checkout" } }, api({ "/api/health": () => Response.json(on) }));
    for (const expected of words) assert.ok(html.includes(expected.replace("&", "&amp;")), expected);
    assert.deepEqual(seen.map((s) => s.path), ["/api/health"], "no session cookie: nothing else is asked");
    assert.match(html, /<main id="main" class="auth-panel"/);
    assert.match(html, /href="\/"[^>]*>← Back to shop/);
    const closed = await visit(route, {}, api({ "/api/health": () => Response.json(off) }));
    assert.equal(closed.redirect, "/account");
  }
  const login = await visit(routes.login, { searchParams: { next: "/checkout" } }, api({ "/api/health": () => Response.json(on) }));
  assert.match(login.html, /href="\/checkout"[^>]*>Continue as guest/, "from the checkout, a guest goes back to it");
  setRequestCookies({ maple_account: "session-token" });
  const already = await visit(routes.login, { searchParams: { next: "/account/orders" } }, api({ "/api/health": () => Response.json(on), "/api/account": () => Response.json(overview) }));
  assert.equal(already.redirect, "/account/orders");
  const looped = await visit(routes.signUp, { searchParams: { next: "/account/login" } }, api({ "/api/health": () => Response.json(on), "/api/account": () => Response.json(overview) }));
  assert.equal(looped.redirect, "/account", "a sign-in page never sends back to a sign-in page");
  const stale = await visit(routes.login, {}, api({ "/api/health": () => Response.json(on), "/api/account": signedOut }));
  assert.equal(stale.redirect, null, "an expired session still sees the form");
  const preview = await visit(routes.login, { searchParams: { preview: "design" } }, api({}));
  assert.deepEqual(preview.seen, [], "the design preview asks the API nothing");
  assert.ok(preview.html.includes("Welcome back."));
});

test("only the account session cookie is forwarded to the API", async () => {
  setRequestCookies({ maple_cart: "cart-token", maple_account: "session-token", maple_staff: "staff-token" });
  const { seen } = await visit(accountRoute, {}, api({ "/api/health": () => Response.json(on), "/api/account": () => Response.json(overview) }));
  assert.equal(seen.find((s) => s.path === "/api/account")?.cookie, "maple_account=session-token");
});

test("signed in, /account is the overview: shortcuts, the latest order and the customer's details", async () => {
  setRequestCookies({ maple_account: "session-token" });
  const { html } = await visit(accountRoute, {}, api({ "/api/health": () => Response.json(on), "/api/account": () => Response.json(overview) }));
  for (const expected of ["Hello, Aditi.", "A space that’s yours.", "03 orders", "02 addresses", "Your profile", "Your latest order", "#MF-10482 · 10 Nov 2026",
    "Confirmed", "Nola Accent Chair", "Natural cane · Oak finish", "₹26,400", "aditi.sharma@example.com", "14 Palm Avenue, Apartment 402", "Bengaluru, Karnataka 560001"])
    assert.ok(html.includes(expected), expected);
  assert.match(html, /href="\/account\/orders\/MF-10482"[^>]*>View order</);
  for (const href of ["/account/orders", "/account/addresses", "/account/details"]) assert.match(html, new RegExp(`href="${href}"`), href);
  assert.match(html, /aria-current="page"[^>]*>Overview|>Overview<\/a>/);
  assert.match(html, />Sign out</);
});

test("a new account without orders or addresses is told what comes next", async () => {
  setRequestCookies({ maple_account: "session-token" });
  const fresh = { customer: { name: null, email: "new@example.com", phone: null }, counts: { orders: 0, addresses: 0 }, latestOrder: null, defaultAddress: null };
  const { html } = await visit(accountRoute, {}, api({ "/api/health": () => Response.json(on), "/api/account": () => Response.json(fresh) }));
  assert.match(html, /No orders yet/);
  assert.match(html, /href="\/collections\/all"/);
  assert.match(html, /No saved address yet/);
  assert.ok(html.includes("new@example.com"));
  assert.doesNotMatch(html, /Hello, null/);
});

test("a signed-in visitor with ?next= goes straight there; an API outage is explained", async () => {
  setRequestCookies({ maple_account: "session-token" });
  const next = await visit(accountRoute, { searchParams: { next: "/checkout" } }, api({ "/api/health": () => Response.json(on), "/api/account": () => Response.json(overview) }));
  assert.equal(next.redirect, "/checkout");
  const down = await visit(accountRoute, {}, api({ "/api/health": () => Response.json(on), "/api/account": () => new Response("no", { status: 500 }) }));
  assert.match(down.html, /couldn.t load your account/i);
});

test("the order list sends a signed-out visitor to sign in and back, and lists a customer's orders", async () => {
  const out = await visit(ordersRoute, {}, api({ "/api/account": signedOut, "/api/account/orders": signedOut }));
  assert.equal(out.redirect, "/account/login?next=%2Faccount%2Forders");
  assert.deepEqual(out.seen, [], "no session cookie: the API is not asked");
  setRequestCookies({ maple_account: "session-token" });
  const disabled = await visit(ordersRoute, {}, api({ "/api/account": accountsOff, "/api/account/orders": accountsOff }));
  assert.equal(disabled.redirect, "/account", "with accounts off the list is not there, even for an old session");
  const orders = [summary, { ...summary, number: "MF-10316", placedAt: "2026-09-21T05:00:00.000Z", status: "delivered", statusLabel: "Delivered" }];
  const { html, seen } = await visit(ordersRoute, {}, api({ "/api/account": () => Response.json(overview), "/api/account/orders": () => Response.json({ orders }) }));
  assert.ok(seen.every((s) => s.cookie === "maple_account=session-token"));
  for (const expected of ["Your orders.", "#MF-10482", "#MF-10316", "21 Sep 2026", "Showing 2 orders", "Hello, Aditi."]) assert.ok(html.includes(expected), expected);
});

test("an order opens by its number for its owner, and anything else is a plain not-found", async () => {
  setRequestCookies({ maple_account: "session-token" });
  const bad = await visit(orderRoute, { params: { number: "not-a-number" } }, api({}));
  assert.equal(bad.digest, "NEXT_HTTP_ERROR_FALLBACK;404");
  assert.deepEqual(bad.seen, [], "a malformed number never reaches the API");
  const missing = await visit(orderRoute, { params: { number: "MF-99999" } }, api({ "/api/account": () => Response.json(overview),
    "/api/account/orders/MF-99999": () => Response.json({ code: "ORDER_NOT_FOUND", message: "Not found." }, { status: 404 }) }));
  assert.equal(missing.digest, "NEXT_HTTP_ERROR_FALLBACK;404");
  const { html, seen } = await visit(orderRoute, { params: { number: "10482" } }, api({ "/api/account": () => Response.json(overview), "/api/account/orders/MF-10482": () => Response.json(detail) }));
  assert.ok(seen.some((s) => s.path === "/api/account/orders/MF-10482"), "typed as 10482, asked for as MF-10482");
  for (const expected of ["Order #MF-10482", "Placed 10 Nov 2026 · 1 item", "Order confirmed", "Confirmed", "Preparing", "Dispatched", "Delivered", "Est. 24–28 Nov",
    "Coming home to", "14 Palm Avenue, Apartment 402", "Bengaluru, Karnataka 560001", "+91 ••••• •3210", "Estimated delivery · 24–28 Nov 2026",
    "Payment summary", "₹24,900", "₹1,500", "Total paid", "₹26,400", "Inclusive of applicable taxes", "Paid online · Ref. pay_QX1a2b3c4d", "Get order support"])
    assert.ok(html.includes(expected), expected);
  assert.doesNotMatch(html, /9876543210/, "the full phone number is not printed");
  assert.match(html, /aria-current="step"|data-step-state="done"/);
  assert.match(html, /href="\/contact\?product=[^"]*MF-10482/);
});

test("an order whose GST is added shows it as its own line", async () => {
  setRequestCookies({ maple_account: "session-token" });
  const excluded = { ...detail, totals: { subtotalPaise: 2110000, deliveryPaise: 150000, taxPaise: 379800, totalPaise: 2639800, taxIncluded: false }, estimate: null };
  const { html } = await visit(orderRoute, { params: { number: "MF-10482" } }, api({ "/api/account": () => Response.json(overview), "/api/account/orders/MF-10482": () => Response.json(excluded) }));
  assert.match(html, />GST</);
  assert.ok(html.includes("₹3,798"));
  assert.doesNotMatch(html, /Inclusive of applicable taxes/);
  assert.doesNotMatch(html, /Estimated delivery ·/, "no estimate, no invented date");
});

test("saved addresses and account details load for the signed-in customer", async () => {
  setRequestCookies({ maple_account: "session-token" });
  const addresses = await visit(addressesRoute, {}, api({ "/api/account": () => Response.json(overview), "/api/account/addresses": () => Response.json({ addresses: [address] }) }));
  for (const expected of ["Your addresses.", "A familiar place for every delivery.", "Add new address", "Home", "14 Palm Avenue", "Bengaluru, Karnataka 560001", "+91 98••• ••210", "Default address"]) assert.ok(addresses.html.includes(expected), expected);
  const details = await visit(detailsRoute, {}, api({ "/api/account": () => Response.json(overview) }));
  assert.ok(details.html.includes("Your details."));
  assert.ok(details.html.includes("Keep your account up to date."));
  assert.match(details.html, /<input[^>]*name="firstName"[^>]*value="Aditi"|<input[^>]*value="Aditi"[^>]*name="firstName"/);
  assert.match(details.html, /<input[^>]*name="lastName"[^>]*value="Sharma"|<input[^>]*value="Sharma"[^>]*name="lastName"/);
  assert.ok(details.html.includes("aditi.sharma@example.com"));
  assert.doesNotMatch(details.html, /<input[^>]*name="email"/, "the sign-in email is not an editable field");
  assert.match(details.html, /<input[^>]*type="email"[^>]*readOnly=""|<input[^>]*readOnly=""[^>]*type="email"/i, "it is shown read-only");
  for (const words of ["Password &amp; security", "Change password", "Save changes", "Cancel"]) assert.ok(details.html.includes(words), words);
  const out = await visit(detailsRoute, {}, api({ "/api/account": signedOut }));
  assert.equal(out.redirect, "/account/login?next=%2Faccount%2Fdetails");
});

test("outside production, ?preview=design shows every page with sample data and asks the API nothing", async () => {
  for (const [route, props, expected] of [
    [accountRoute, {}, "Hello, Aditi."],
    [ordersRoute, {}, "Showing 3 orders"],
    [orderRoute, { params: { number: "MF-10482" } }, "Order #MF-10482"],
    [addressesRoute, {}, "Your addresses."],
    [detailsRoute, {}, "Your details."],
  ] as Array<[Route, { params?: Record<string, string> }, string]>) {
    const { html, seen } = await visit(route, { ...props, searchParams: { preview: "design" } }, api({}));
    assert.deepEqual(seen, [], expected);
    assert.ok(html.includes(expected), expected);
  }
  const signIn = await visit(accountRoute, { searchParams: { preview: "sign-in" } }, api({}));
  assert.equal(signIn.redirect, "/account/login?preview=design");
  const environment = process.env as Record<string, string | undefined>;
  const previous = environment.NODE_ENV;
  environment.NODE_ENV = "production";
  try {
    const live = await visit(accountRoute, { searchParams: { preview: "design" } }, api({ "/api/health": () => Response.json(off) }));
    assert.match(live.html, /not available on this storefront yet/, "production never shows sample data");
  } finally {
    environment.NODE_ENV = previous;
  }
});
