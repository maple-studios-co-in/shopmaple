import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ShopProvider, useShop } from "../components/shop-provider";
import { CartContents } from "../components/cart";

const dom = new JSDOM("<!doctype html><div id='root'></div>", {
  url: "http://localhost:3000",
});
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  sessionStorage: dom.window.sessionStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
  HTMLElement: dom.window.HTMLElement,
  HTMLImageElement: dom.window.HTMLImageElement,
});
type MutationBody = { quantity: number; mutation: { id: string; cartIdentity: string; expectedRevision: number } };
const savedCart = {
  items: [{
    variantId: "chair", handle: "chair", title: "Chair", variantTitle: "Blue",
    image: "/chair.jpg", pricePaise: 10000, quantity: 2, lineTotalPaise: 20000,
    available: true, stockPolicy: "continue",
  }],
  itemCount: 2, subtotalPaise: 20000, currency: "INR",
  checkoutEnabled: false, mode: "preview",
  mutationContext: { cartIdentity: "a".repeat(64), revision: 0 },
};
const updatedCart = {
  ...savedCart, items: [{ ...savedCart.items[0], quantity: 3, lineTotalPaise: 30000 }],
  itemCount: 3, subtotalPaise: 30000,
  mutationContext: { cartIdentity: "a".repeat(64), revision: 1 },
};
let shop: ReturnType<typeof useShop>;
function Probe() {
  shop = useShop();
  return <><button disabled={shop.busy}>Change quantity</button><p data-error>{shop.error}</p><output>{shop.cart.itemCount}</output><CartContents /></>;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function mount(fetcher: typeof fetch, preservePending = false) {
  if (!preservePending) sessionStorage.clear();
  localStorage.clear();
  const previous = globalThis.fetch;
  globalThis.fetch = fetcher;
  const root = createRoot(document.getElementById("root")!);
  await act(async () => root.render(<ShopProvider><Probe /></ShopProvider>));
  return async () => {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  };
}

test("successful cart writes retain server quantities and reject overlapping writes", async () => {
  const write = deferred<Response>();
  const calls: string[] = [];
  let body: MutationBody;
  const cleanup = await mount(async (input, init) => {
    calls.push(`${init?.method ?? "GET"} ${input}`);
    if (init?.method === "PUT") body = JSON.parse(String(init.body));
    return init?.method === "PUT" ? write.promise : Response.json(savedCart);
  });
  try {
    let first!: Promise<boolean>;
    await act(async () => { first = shop.setQuantity("chair", 3); });
    assert.equal(document.querySelector("button")!.disabled, true);
    assert.equal(await shop.setQuantity("chair", 4), false);
    await act(async () => { write.resolve(Response.json({ ...updatedCart, mutationResult: { id: body?.mutation?.id, status: "applied" } })); assert.equal(await first, true); });
    assert.equal(document.querySelector("output")!.textContent, "3");
    assert.equal(document.querySelector("button")!.disabled, false);
    assert.deepEqual(calls, ["GET /api/cart", "PUT /api/cart/items/chair"]);
    assert.equal(shop.cart.checkoutEnabled, false);
  } finally { await cleanup(); }
});

test("an unacknowledged write ends its wait within ten seconds without permitting another write", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const write = deferred<Response>();
  const calls: string[] = [];
  const cleanup = await mount(async (input, init) => {
    calls.push(`${init?.method ?? "GET"} ${input}`);
    return init?.method === "PUT" ? write.promise : Response.json(savedCart);
  });
  try {
    let outcome: boolean | undefined;
    await act(async () => { void shop.setQuantity("chair", 3).then((result) => { outcome = result; }); });
    await act(async () => { t.mock.timers.tick(10000); });
    assert.equal(outcome, false, "the shopper should receive a bounded failure result while the server outcome remains unknown");
    assert.equal(document.querySelector("button")!.disabled, true);
    assert.match(document.querySelector('[data-error]')!.textContent!, /confirm|pending|unknown/i);
    assert.equal(await shop.setQuantity("chair", 4), false);
    assert.equal(calls.filter((call) => call.startsWith("PUT")).length, 1);
  } finally { await cleanup(); t.mock.timers.reset(); }
});

test("cart updates persist their bound operation before dispatch and never retry with a fresh identity", async () => {
  const requests: MutationBody[] = [];
  let persistedAtDispatch = "";
  const cleanup = await mount(async (_input, init) => {
    if (init?.method !== "PUT") return Response.json(savedCart);
    requests.push(JSON.parse(String(init.body)));
    persistedAtDispatch = sessionStorage.getItem("maple-cart-pending-v1") ?? "";
    throw new TypeError("private transport detail");
  });
  try {
    await act(async () => { assert.equal(await shop.setQuantity("chair", 3), false); });
    assert.equal(requests.length, 1);
    const sent = requests[0];
    assert.ok(sent);
    assert.deepEqual(sent.mutation && {
      cartIdentity: sent.mutation.cartIdentity,
      expectedRevision: sent.mutation.expectedRevision,
    }, { cartIdentity: "a".repeat(64), expectedRevision: 0 });
    assert.match(sent.mutation.id, /^[0-9a-f-]{36}$/);
    assert.ok(persistedAtDispatch.includes(sent.mutation.id));
    assert.equal(document.querySelector("button")!.disabled, true);
    assert.equal(await shop.setQuantity("chair", 4), false);
    assert.equal(requests.length, 1);
    assert.doesNotMatch(shop.error, /private transport detail/);
  } finally { await cleanup(); }
});

test("explicit recovery replays the exact pending operation and applies the confirmed current cart", async () => {
  const requests: MutationBody[] = [];
  const cleanup = await mount(async (_input, init) => {
    if (init?.method !== "PUT") return Response.json(savedCart);
    const body = JSON.parse(String(init.body)) as MutationBody;
    requests.push(body);
    if (requests.length === 1) throw new TypeError("connection lost");
    return Response.json({ ...updatedCart, mutationResult: { id: body.mutation.id, status: "replayed" } });
  });
  try {
    await act(async () => { await shop.setQuantity("chair", 3); });
    const retry = [...document.querySelectorAll("button")].find((button) => /check cart update/i.test(button.textContent ?? ""));
    assert.ok(retry, "the shopper needs an explicit recovery action after an uncertain write");
    await act(async () => retry.click());
    assert.deepEqual(requests[1], requests[0]);
    assert.equal(document.querySelector("output")!.textContent, "3");
    assert.equal(document.querySelector("button")!.disabled, false);
    assert.equal(sessionStorage.getItem("maple-cart-pending-v1"), null);
    assert.equal(shop.cart.checkoutEnabled, false);
  } finally { await cleanup(); }
});

test("a stale GET after reload does not erase pending mutation identity or unlock a late commit", async () => {
  const requests: MutationBody[] = [];
  const firstCleanup = await mount(async (_input, init) => {
    if (init?.method !== "PUT") return Response.json(savedCart);
    requests.push(JSON.parse(String(init.body)));
    throw new TypeError("connection lost");
  });
  await act(async () => { await shop.setQuantity("chair", 3); });
  await firstCleanup();
  const cleanup = await mount(async (_input, init) => {
    if (init?.method !== "PUT") return Response.json(savedCart);
    const body = JSON.parse(String(init.body)) as MutationBody;
    requests.push(body);
    return Response.json({ ...updatedCart, mutationResult: { id: body.mutation.id, status: "replayed" } });
  }, true);
  try {
    assert.equal(document.querySelector("output")!.textContent, "2");
    assert.equal(document.querySelector("button")!.disabled, true, "a read before a late commit must not release the write guard");
    assert.equal(await shop.setQuantity("chair", 4), false);
    const retry = [...document.querySelectorAll("button")].find((button) => /check cart update/i.test(button.textContent ?? ""));
    assert.ok(retry);
    await act(async () => retry.click());
    assert.deepEqual(requests[1], requests[0]);
    assert.equal(document.querySelector("output")!.textContent, "3");
  } finally { await cleanup(); }
});

test("a terminal rejected receipt reconciles server quantities before another write is allowed", async () => {
  const read = deferred<Response>();
  let gets = 0;
  const cleanup = await mount(async (_input, init) => {
    if (init?.method !== "PUT") return ++gets === 1 ? Response.json(savedCart) : read.promise;
    const body = JSON.parse(String(init.body)) as MutationBody;
    return Response.json({ code: "CART_REVISION_CONFLICT", message: "Please check your cart.", mutationResult: { id: body.mutation?.id, status: "rejected" } }, { status: 409 });
  });
  try {
    let result: boolean | undefined;
    await act(async () => { void shop.setQuantity("chair", 3).then((value) => { result = value; }); });
    assert.equal(document.querySelector("button")!.disabled, true);
    assert.equal(await shop.setQuantity("chair", 4), false);
    await act(async () => { read.resolve(Response.json(updatedCart)); });
    assert.equal(result, false);
    assert.equal(document.querySelector("output")!.textContent, "3");
    assert.equal(document.querySelector("button")!.disabled, false);
    assert.equal(sessionStorage.getItem("maple-cart-pending-v1"), null);
  } finally { await cleanup(); }
});

test("an unrelated success receipt cannot unlock or replace the saved cart", async () => {
  const cleanup = await mount(async (_input, init) => init?.method === "PUT"
    ? Response.json({ ...updatedCart, mutationResult: { id: "bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb", status: "applied" } })
    : Response.json(savedCart));
  try {
    await act(async () => { assert.equal(await shop.setQuantity("chair", 3), false); });
    assert.equal(document.querySelector("output")!.textContent, "2");
    assert.equal(document.querySelector("button")!.disabled, true);
    assert.notEqual(sessionStorage.getItem("maple-cart-pending-v1"), null);
  } finally { await cleanup(); }
});

test("unavailable recovery storage prevents dispatching an unrecoverable write", async () => {
  let writes = 0;
  const cleanup = await mount(async (_input, init) => {
    if (init?.method === "PUT") writes++;
    return Response.json(savedCart);
  });
  const original = dom.window.Storage.prototype.setItem;
  dom.window.Storage.prototype.setItem = () => { throw new DOMException("storage denied", "SecurityError"); };
  try {
    await act(async () => { assert.equal(await shop.setQuantity("chair", 3), false); });
    assert.equal(writes, 0);
    assert.match(shop.error, /storage|save.*recovery/i);
  } finally { dom.window.Storage.prototype.setItem = original; await cleanup(); }
});

test("a failed initial cart read offers a bounded safe retry without dispatching a mutation", async () => {
  let gets = 0;
  const cleanup = await mount(async (_input, init) => {
    assert.notEqual(init?.method, "PUT");
    return ++gets === 1 ? new Response(null, { status: 503 }) : Response.json(savedCart);
  });
  try {
    const retry = [...document.querySelectorAll("button")].find((button) => /try again/i.test(button.textContent ?? ""));
    assert.ok(retry);
    await act(async () => retry.click());
    assert.equal(document.querySelector("output")!.textContent, "2");
    assert.equal(document.querySelector("button")!.disabled, false);
    assert.equal(gets, 2);
  } finally { await cleanup(); }
});

test("a matching success receipt with a stale revision cannot unlock further writes", async () => {
  const cleanup = await mount(async (_input, init) => {
    if (init?.method !== "PUT") return Response.json(savedCart);
    const body = JSON.parse(String(init.body)) as MutationBody;
    return Response.json({ ...savedCart, mutationResult: { id: body.mutation.id, status: "applied" } });
  });
  try {
    await act(async () => { assert.equal(await shop.setQuantity("chair", 3), false); });
    assert.equal(document.querySelector("button")!.disabled, true);
    assert.notEqual(sessionStorage.getItem("maple-cart-pending-v1"), null);
  } finally { await cleanup(); }
});

test("a proxy error with a matching rejection marker is not a definitive business receipt", async () => {
  let gets = 0;
  const cleanup = await mount(async (_input, init) => {
    if (init?.method !== "PUT") { gets++; return Response.json(savedCart); }
    const body = JSON.parse(String(init.body)) as MutationBody;
    return Response.json({ code: "UPSTREAM_TIMEOUT", mutationResult: { id: body.mutation.id, status: "rejected" } }, { status: 502 });
  });
  try {
    await act(async () => { assert.equal(await shop.setQuantity("chair", 3), false); });
    assert.equal(document.querySelector("button")!.disabled, true);
    assert.equal(gets, 1, "unknown response must not be converted into terminal confirmation by an unrelated GET");
    assert.notEqual(sessionStorage.getItem("maple-cart-pending-v1"), null);
  } finally { await cleanup(); }
});

test("an older provider response never clears a different persisted recovery operation", async () => {
  const write = deferred<Response>();
  let body!: MutationBody;
  const cleanup = await mount(async (_input, init) => {
    if (init?.method !== "PUT") return Response.json(savedCart);
    body = JSON.parse(String(init.body)) as MutationBody;
    return write.promise;
  });
  try {
    let first!: Promise<boolean>;
    await act(async () => { first = shop.setQuantity("chair", 3); });
    const replacement = JSON.stringify({ variantId: "chair", input: { ...body, mutation: { ...body.mutation, id: "cccccccc-cccc-4ccc-accc-cccccccccccc" } } });
    sessionStorage.setItem("maple-cart-pending-v1", replacement);
    await act(async () => { write.resolve(Response.json({ ...updatedCart, mutationResult: { id: body.mutation.id, status: "applied" } })); assert.equal(await first, false); });
    assert.equal(sessionStorage.getItem("maple-cart-pending-v1"), replacement);
    assert.equal(document.querySelector("button")!.disabled, true);
  } finally { await cleanup(); }
});

test("missing recovery storage does not silently release the direct mutation guard", async () => {
  const write = deferred<Response>();
  let body!: MutationBody;
  let writes = 0;
  const cleanup = await mount(async (_input, init) => {
    if (init?.method !== "PUT") return Response.json(savedCart);
    writes++;
    body = JSON.parse(String(init.body)) as MutationBody;
    return write.promise;
  });
  try {
    let first!: Promise<boolean>;
    await act(async () => { first = shop.setQuantity("chair", 3); });
    sessionStorage.removeItem("maple-cart-pending-v1");
    await act(async () => { write.resolve(Response.json({ ...updatedCart, mutationResult: { id: body.mutation.id, status: "applied" } })); assert.equal(await first, false); });
    await act(async () => { await shop.setQuantity("chair", 4); });
    assert.equal(writes, 1, "a missing saved operation cannot enable a new write while recovery is blocked");
  } finally { await cleanup(); }
});

test("keyboard recovery keeps focus in the cart when its recovery button disappears", async () => {
  let writes = 0;
  const cleanup = await mount(async (_input, init) => {
    if (init?.method !== "PUT") return Response.json(savedCart);
    const body = JSON.parse(String(init.body)) as MutationBody;
    if (++writes === 1) throw new TypeError("connection lost");
    return Response.json({ ...updatedCart, mutationResult: { id: body.mutation.id, status: "replayed" } });
  });
  try {
    await act(async () => { await shop.setQuantity("chair", 3); });
    const retry = [...document.querySelectorAll("button")].find((button) => /check cart update/i.test(button.textContent ?? ""));
    assert.ok(retry);
    retry.focus();
    await act(async () => retry.click());
    assert.equal(document.activeElement?.getAttribute("aria-label"), "Your saved cart");
    assert.equal(document.activeElement?.getAttribute("tabindex"), "-1");
  } finally { await cleanup(); }
});

test("a late success after timeout cannot overwrite a newer recovered cart", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const late = deferred<Response>();
  const requests: MutationBody[] = [];
  const currentCart = { ...updatedCart, itemCount: 4, subtotalPaise: 40000,
    items: [{ ...updatedCart.items[0], quantity: 4, lineTotalPaise: 40000 }],
    mutationContext: { cartIdentity: "a".repeat(64), revision: 2 } };
  const cleanup = await mount(async (_input, init) => {
    if (init?.method !== "PUT") return Response.json(savedCart);
    const body = JSON.parse(String(init.body)) as MutationBody;
    requests.push(body);
    if (requests.length === 1) return late.promise;
    return Response.json({ ...currentCart, mutationResult: { id: body.mutation.id, status: "replayed" } });
  });
  try {
    await act(async () => { void shop.setQuantity("chair", 3); });
    await act(async () => t.mock.timers.tick(10000));
    const retry = [...document.querySelectorAll("button")].find((button) => /check cart update/i.test(button.textContent ?? ""));
    assert.ok(retry);
    await act(async () => retry.click());
    assert.deepEqual(requests[1], requests[0]);
    assert.equal(document.querySelector("output")!.textContent, "4");
    await act(async () => late.resolve(Response.json({ ...updatedCart, mutationResult: { id: requests[0]!.mutation.id, status: "applied" } })));
    assert.equal(document.querySelector("output")!.textContent, "4");
    assert.equal(document.querySelector("button")!.disabled, false);
  } finally { await cleanup(); t.mock.timers.reset(); }
});

test("an incomplete mutation response body is bounded and retains the recovery operation", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"items":')); } }));
  const cleanup = await mount(async (_input, init) => init?.method === "PUT" ? response : Response.json(savedCart));
  try {
    let result: boolean | undefined;
    await act(async () => { void shop.setQuantity("chair", 3).then((value) => { result = value; }); });
    await act(async () => t.mock.timers.tick(10000));
    assert.equal(result, false);
    assert.equal(document.querySelector("button")!.disabled, true);
    assert.notEqual(sessionStorage.getItem("maple-cart-pending-v1"), null);
  } finally { await cleanup(); t.mock.timers.reset(); }
});

test("a timed-out initial read can retry and ignores its stale late result", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const late = deferred<Response>();
  let gets = 0;
  const cleanup = await mount(async () => ++gets === 1 ? late.promise : Response.json(savedCart));
  try {
    await act(async () => t.mock.timers.tick(10000));
    const retry = [...document.querySelectorAll("button")].find((button) => /try again/i.test(button.textContent ?? ""));
    assert.ok(retry);
    await act(async () => retry.click());
    assert.equal(document.querySelector("output")!.textContent, "2");
    await act(async () => late.resolve(Response.json(updatedCart)));
    assert.equal(document.querySelector("output")!.textContent, "2");
    assert.equal(document.querySelector("button")!.disabled, false);
  } finally { await cleanup(); t.mock.timers.reset(); }
});

test("failed reconciliation retains the rejected operation until a later read succeeds", async () => {
  let gets = 0;
  const requests: MutationBody[] = [];
  const cleanup = await mount(async (_input, init) => {
    if (init?.method !== "PUT") {
      gets++;
      return gets === 2 ? new Response(null, { status: 503 }) : Response.json(gets === 1 ? savedCart : updatedCart);
    }
    const body = JSON.parse(String(init.body)) as MutationBody;
    requests.push(body);
    return Response.json({ code: "CART_REVISION_CONFLICT", mutationResult: { id: body.mutation.id, status: "rejected" } }, { status: 409 });
  });
  try {
    await act(async () => { await shop.setQuantity("chair", 3); });
    assert.equal(document.querySelector("button")!.disabled, true);
    assert.notEqual(sessionStorage.getItem("maple-cart-pending-v1"), null);
    const retry = [...document.querySelectorAll("button")].find((button) => /check cart update/i.test(button.textContent ?? ""));
    assert.ok(retry);
    await act(async () => retry.click());
    assert.deepEqual(requests[1], requests[0]);
    assert.equal(document.querySelector("output")!.textContent, "3");
    assert.equal(document.querySelector("button")!.disabled, false);
  } finally { await cleanup(); }
});

test("recovery completion does not steal focus after the shopper moves elsewhere", async () => {
  const response = deferred<Response>();
  let request!: MutationBody;
  let writes = 0;
  const cleanup = await mount(async (_input, init) => {
    if (init?.method !== "PUT") return Response.json(savedCart);
    request = JSON.parse(String(init.body)) as MutationBody;
    if (++writes === 1) throw new TypeError("connection lost");
    return response.promise;
  });
  const other = document.createElement("input");
  document.body.append(other);
  try {
    await act(async () => { await shop.setQuantity("chair", 3); });
    const retry = [...document.querySelectorAll("button")].find((button) => /check cart update/i.test(button.textContent ?? ""));
    assert.ok(retry);
    retry.focus();
    await act(async () => retry.click());
    other.focus();
    await act(async () => response.resolve(Response.json({ ...updatedCart, mutationResult: { id: request.mutation.id, status: "replayed" } })));
    assert.equal(document.activeElement, other);
  } finally { other.remove(); await cleanup(); }
});

test("unmount aborts local waits without discarding the durable pending intent", async () => {
  const response = deferred<Response>();
  let signal: AbortSignal | null | undefined;
  let body!: MutationBody;
  const cleanup = await mount(async (_input, init) => {
    if (init?.method !== "PUT") return Response.json(savedCart);
    signal = init.signal;
    body = JSON.parse(String(init.body)) as MutationBody;
    return response.promise;
  });
  let result: boolean | undefined;
  await act(async () => { void shop.setQuantity("chair", 3).then((value) => { result = value; }); });
  const stored = sessionStorage.getItem("maple-cart-pending-v1");
  await cleanup();
  assert.equal(signal?.aborted, true);
  assert.equal(result, false);
  await act(async () => response.resolve(Response.json({ ...updatedCart, mutationResult: { id: body.mutation.id, status: "applied" } })));
  assert.equal(sessionStorage.getItem("maple-cart-pending-v1"), stored);
});

test("a changed cookie session rejects the old intent and never retargets it to a new cart", async () => {
  let gets = 0;
  const requests: MutationBody[] = [];
  const replacement = { ...savedCart, mutationContext: { cartIdentity: "b".repeat(64), revision: 0 } };
  const cleanup = await mount(async (_input, init) => {
    if (init?.method !== "PUT") return Response.json(++gets === 1 ? savedCart : replacement);
    const body = JSON.parse(String(init.body)) as MutationBody;
    requests.push(body);
    return Response.json({ code: "CART_SESSION_CHANGED", mutationResult: { id: body.mutation.id, status: "rejected" } }, { status: 409 });
  });
  try {
    await act(async () => { assert.equal(await shop.setQuantity("chair", 3), false); });
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.mutation.cartIdentity, "a".repeat(64));
    assert.equal(shop.cart.mutationContext?.cartIdentity, "b".repeat(64));
    assert.equal(shop.cart.itemCount, 2);
    assert.equal(document.querySelector("button")!.disabled, false);
  } finally { await cleanup(); }
});

test("failure to clear recovery storage keeps the same operation available for safe replay", async () => {
  const requests: MutationBody[] = [];
  const cleanup = await mount(async (_input, init) => {
    if (init?.method !== "PUT") return Response.json(savedCart);
    const body = JSON.parse(String(init.body)) as MutationBody;
    requests.push(body);
    return Response.json({ ...updatedCart, mutationResult: { id: body.mutation.id, status: requests.length === 1 ? "applied" : "replayed" } });
  });
  const remove = dom.window.Storage.prototype.removeItem;
  dom.window.Storage.prototype.removeItem = () => { throw new DOMException("storage denied", "SecurityError"); };
  try {
    await act(async () => { assert.equal(await shop.setQuantity("chair", 3), false); });
    assert.equal(document.querySelector("button")!.disabled, true);
    assert.notEqual(sessionStorage.getItem("maple-cart-pending-v1"), null);
    dom.window.Storage.prototype.removeItem = remove;
    const retry = [...document.querySelectorAll("button")].find((button) => /check cart update/i.test(button.textContent ?? ""));
    assert.ok(retry);
    await act(async () => retry.click());
    assert.deepEqual(requests[1], requests[0]);
    assert.equal(document.querySelector("button")!.disabled, false);
  } finally { dom.window.Storage.prototype.removeItem = remove; await cleanup(); }
});

test("a cart response without a usable mutation context cannot enable writes", async () => {
  let writes = 0;
  const cleanup = await mount(async (_input, init) => {
    if (init?.method === "PUT") writes++;
    return Response.json({ ...savedCart, mutationContext: undefined });
  });
  try {
    assert.equal(document.querySelector("button")!.disabled, true);
    assert.equal(await shop.setQuantity("chair", 3), false);
    assert.equal(writes, 0);
    assert.equal(shop.cartReady, false);
  } finally { await cleanup(); }
});
