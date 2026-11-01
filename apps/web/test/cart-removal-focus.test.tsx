import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { ShopProvider, useShop } from "../components/shop-provider";
import { CartContents, CartDrawer } from "../components/cart";

const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3000/cart" });
Object.assign(globalThis, {
  window: dom.window, self: dom.window, document: dom.window.document,
  localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage,
  HTMLElement: dom.window.HTMLElement, HTMLImageElement: dom.window.HTMLImageElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
// JSDOM has no native dialog methods. Focus assertions below exercise our cart
// code; browser verification remains responsible for the native modal lifecycle.
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
  this.dispatchEvent(new dom.window.Event("close"));
};
const chair = {
  variantId: "chair", handle: "chair", title: "Chair", variantTitle: "Blue",
  image: "/chair.jpg", pricePaise: 10000, quantity: 1, lineTotalPaise: 10000,
  available: true, stockPolicy: "stocked",
};
const table = { ...chair, variantId: "table", handle: "table", title: "Table" };
const cart = {
  items: [chair, table], itemCount: 2, subtotalPaise: 20000, currency: "INR",
  checkoutEnabled: false, mode: "preview",
  mutationContext: { cartIdentity: "a".repeat(64), revision: 0 },
};
const onlyChair = { ...cart, items: [chair], itemCount: 1, subtotalPaise: 10000 };
const empty = { ...cart, items: [], itemCount: 0, subtotalPaise: 0 };
type CartFixture = typeof cart;
type Mutation = { quantity: number; mutation: { id: string } };
function Harness({ drawer }: { drawer: boolean }) {
  const [visible, setVisible] = useState(true);
  const shop = useShop();
  return <>
    <h1>Cart fixture</h1>
    <button onClick={() => shop.setCartOpen(true)}>Open cart</button>
    <button onClick={() => setVisible(false)}>Hide cart</button>
    <button>Elsewhere</button>
    {visible && (drawer ? <CartDrawer /> : <CartContents />)}
  </>;
}
function button(name: string) {
  const result = [...document.querySelectorAll<HTMLButtonElement>("button")]
    .find(node => (node.getAttribute("aria-label") ?? node.textContent) === name);
  assert.ok(result, `button ${name} exists`);
  return result;
}
async function click(control: HTMLElement) {
  control.focus();
  await act(async () => control.click());
}
function blurDisabledControl(control: HTMLButtonElement) {
  // JSDOM refuses blur() on a disabled element, whereas browsers can blur it
  // when disabled or clicked away. Model that native focusout without focusin.
  const disabled = control.disabled;
  control.disabled = false;
  control.blur();
  control.disabled = disabled;
}
async function mount(initial: CartFixture = cart, drawer = false) {
  localStorage.clear(); sessionStorage.clear();
  const previous = globalThis.fetch;
  let resolve!: (response: Response) => void;
  const response = new Promise<Response>(yes => { resolve = yes; });
  let mutation: Mutation | undefined;
  let mutationPath = "";
  globalThis.fetch = async (input, init) => {
    if (init?.method === "PUT") {
      mutationPath = String(input);
      mutation = JSON.parse(String(init.body));
      return response;
    }
    assert.equal(String(input), "/api/cart");
    return Response.json(initial);
  };
  const root = createRoot(document.getElementById("root")!);
  await act(async () => root.render(<ShopProvider><Harness drawer={drawer} /></ShopProvider>));
  if (drawer) await click(button("Open cart"));
  return {
    async finish(next: CartFixture, expectedPath: string, status = 200) {
      assert.equal(mutationPath, expectedPath);
      assert.equal(mutation?.quantity, 0, "removal sends zero quantity");
      await act(async () => {
        resolve(status === 200 ? Response.json({
          ...next, mutationContext: { ...next.mutationContext, revision: 1 },
          mutationResult: { id: mutation!.mutation.id, status: "applied" },
        }) : Response.json({ code: "UNAVAILABLE" }, { status }));
      });
    },
    async cleanup() { await act(async () => root.unmount()); globalThis.fetch = previous; },
  };
}

test("acknowledged removal removes only its line and preserves the remaining cart", async () => {
  const session = await mount();
  try {
    await click(button("Remove Table"));
    await session.finish(onlyChair, "/api/cart/items/table");
    assert.equal(document.querySelectorAll(".cart-line").length, 1);
    assert.ok(button("Remove Chair"));
    assert.equal(sessionStorage.getItem("maple-cart-pending-v1"), null);
  } finally { await session.cleanup(); }
});

test("failed removal keeps the line and focused control available for recovery", async () => {
  const session = await mount();
  try {
    const remove = button("Remove Chair");
    await click(remove);
    await session.finish(cart, "/api/cart/items/chair", 503);
    assert.equal(document.querySelectorAll(".cart-line").length, 2);
    assert.ok(document.activeElement === remove, "failed removal retains its focused control");
    assert.ok(button("Check cart update"));
  } finally { await session.cleanup(); }
});

test("removing the first line moves keyboard focus to the next line's remove control", async () => {
  const session = await mount();
  try {
    await click(button("Remove Chair"));
    await session.finish({ ...onlyChair, items: [table] }, "/api/cart/items/chair");
    assert.ok(document.activeElement === button("Remove Table"), "focus moves to Remove Table");
  } finally { await session.cleanup(); }
});

test("removing the last of multiple lines moves keyboard focus to the preceding line", async () => {
  const session = await mount();
  try {
    await click(button("Remove Table"));
    await session.finish(onlyChair, "/api/cart/items/table");
    assert.ok(document.activeElement === button("Remove Chair"), "focus moves to Remove Chair");
  } finally { await session.cleanup(); }
});

for (const action of ["Remove Chair", "Decrease quantity of Chair"]) {
  test(`${action} on the final line moves keyboard focus to Explore furniture`, async () => {
    const session = await mount(onlyChair);
    try {
      await click(button(action));
      await session.finish(empty, "/api/cart/items/chair");
      assert.equal(document.activeElement?.textContent, "Explore furniture");
      assert.equal(document.activeElement?.getAttribute("href"), "/collections/all");
    } finally { await session.cleanup(); }
  });
}

test("removal completion preserves focus moved elsewhere while the request was pending", async () => {
  const session = await mount();
  try {
    await click(button("Remove Chair"));
    const elsewhere = button("Elsewhere"); elsewhere.focus();
    await session.finish({ ...onlyChair, items: [table] }, "/api/cart/items/chair");
    assert.ok(document.activeElement === elsewhere, "focus remains elsewhere");
  } finally { await session.cleanup(); }
});

test("an unfocused removal does not steal keyboard focus", async () => {
  const session = await mount();
  try {
    const elsewhere = button("Elsewhere"); elsewhere.focus();
    await act(async () => button("Remove Chair").click());
    await session.finish({ ...onlyChair, items: [table] }, "/api/cart/items/chair");
    assert.ok(document.activeElement === elsewhere, "unfocused removal preserves focus elsewhere");
  } finally { await session.cleanup(); }
});

test("removal does not reclaim focus after the shopper leaves its control and later blurs", async () => {
  const session = await mount();
  try {
    await click(button("Remove Chair"));
    const elsewhere = button("Elsewhere"); elsewhere.focus(); elsewhere.blur();
    await session.finish({ ...onlyChair, items: [table] }, "/api/cart/items/chair");
    assert.ok(document.activeElement === document.body, "deliberate blur is not removal focus loss");
  } finally { await session.cleanup(); }
});

test("pointer interaction with nonfocusable content cancels pending removal focus restoration", async () => {
  const session = await mount();
  try {
    const remove = button("Remove Chair");
    await click(remove);
    const heading = document.querySelector("h1")!;
    heading.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true }));
    // JSDOM does not perform the browser's click-away focus change itself.
    // The request remains unresolved until after that pointer intent and blur.
    blurDisabledControl(remove);
    assert.ok(document.activeElement === document.body, "clicking nonfocusable content leaves body focused");
    await session.finish({ ...onlyChair, items: [table] }, "/api/cart/items/chair");
    assert.ok(document.activeElement === document.body, "removal must not undo the shopper's pointer departure");
  } finally { await session.cleanup(); }
});

test("Tab departure cancels pending removal focus restoration even without a new focused element", async () => {
  const session = await mount();
  try {
    const remove = button("Remove Chair");
    await click(remove);
    document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    blurDisabledControl(remove);
    assert.ok(document.activeElement === document.body, "Tab can leave the document without a new focused element");
    await session.finish({ ...onlyChair, items: [table] }, "/api/cart/items/chair");
    assert.ok(document.activeElement === document.body, "removal must not undo Tab departure");
  } finally { await session.cleanup(); }
});

test("automatic blur from disabling a pending removal control still permits focus restoration", async () => {
  const session = await mount();
  try {
    const remove = button("Remove Chair");
    await click(remove);
    assert.equal(remove.disabled, true);
    // Browsers may blur a newly disabled button without new pointer/Tab intent.
    blurDisabledControl(remove);
    assert.ok(document.activeElement === document.body, "automatic disable blur has occurred before the response");
    await session.finish({ ...onlyChair, items: [table] }, "/api/cart/items/chair");
    assert.ok(document.activeElement === button("Remove Table"), "automatic disable blur still restores adjacent focus");
  } finally { await session.cleanup(); }
});

test("a closed drawer stays closed without moving focus into it after removal completes", async () => {
  const session = await mount(onlyChair, true);
  try {
    await click(button("Remove Chair"));
    await act(async () => document.querySelector("dialog")!.close());
    await session.finish(empty, "/api/cart/items/chair");
    assert.equal(document.querySelector("dialog")!.open, false);
    assert.equal(document.querySelector("dialog")!.contains(document.activeElement), false);
  } finally { await session.cleanup(); }
});

test("unmounting cart contents during removal preserves focus outside the cart", async () => {
  const session = await mount();
  try {
    await click(button("Remove Chair"));
    const hide = button("Hide cart"); await click(hide);
    await session.finish({ ...onlyChair, items: [table] }, "/api/cart/items/chair");
    assert.equal(document.querySelector('[aria-label="Your saved cart"]'), null);
    assert.ok(document.activeElement === hide, "unmounted cart preserves outside focus");
  } finally { await session.cleanup(); }
});
