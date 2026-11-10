import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { BlogFeaturedSlider } from "../components/blog/featured-slider";
import { BlogCardList } from "../components/blog/card-list";
import { BlogShareButton } from "../components/blog/share-button";
import { BlogAddToCart } from "../components/blog/add-to-cart";
import { ShopProvider } from "../components/shop-provider";

// What the blog pages do in the browser (Figma 268:4185, 268:4825; owner, 10 Nov 2026).
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3000/blogs/recent-stories" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document,
  localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });

async function mount(element: React.ReactNode, check: (host: HTMLElement) => Promise<void> | void) {
  const host = document.getElementById("root")!;
  const root = createRoot(host);
  try {
    await act(async () => root.render(element));
    await check(host);
  } finally {
    await act(async () => root.unmount());
  }
}
const slide = (n: number) => <article key={n} data-blog-slide><h2>Story {n}</h2></article>;

test("the featured slider moves by its arrows, dots and keys, and hides the stories out of view", async () => {
  await mount(<BlogFeaturedSlider label="Featured stories">{[slide(1), slide(2), slide(3)]}</BlogFeaturedSlider>, async (host) => {
    const dots = () => [...host.querySelectorAll<HTMLButtonElement>("button[data-slide-dot]")];
    const current = () => dots().findIndex((dot) => dot.getAttribute("aria-current") === "true");
    const frames = () => [...host.querySelectorAll<HTMLElement>("[data-slide-frame]")];
    const prev = host.querySelector<HTMLButtonElement>("button[data-slide-prev]")!;
    const next = host.querySelector<HTMLButtonElement>("button[data-slide-next]")!;
    assert.equal(current(), 0);
    assert.deepEqual(frames().map((frame) => frame.getAttribute("aria-hidden")), [null, "true", "true"]);
    assert.ok(frames()[1]!.hasAttribute("inert"), "a story out of view takes no focus");
    assert.equal(prev.disabled, true);
    await act(async () => next.click());
    assert.equal(current(), 1);
    assert.equal(prev.disabled, false);
    assert.deepEqual(frames().map((frame) => frame.getAttribute("aria-hidden")), ["true", null, "true"]);
    assert.match(host.querySelector<HTMLElement>("[data-blog-slides]")!.style.transform, /translateX\(-100%\)/);
    await act(async () => dots()[2]!.click());
    assert.equal(current(), 2);
    assert.equal(next.disabled, true, "the last story has nothing after it");
    await act(async () => host.querySelector("[data-blog-featured]")!.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
    assert.equal(current(), 1);
    assert.equal(dots()[0]!.getAttribute("aria-label"), "Show story 1 of 3");
  });
});

test("a swipe moves the slider and never opens the story it started on", async () => {
  const story = (n: number) => <article key={n} data-blog-slide><a href={`#story-${n}`}>Story {n}</a></article>;
  await mount(<BlogFeaturedSlider label="Featured stories">{[story(1), story(2), story(3)]}</BlogFeaturedSlider>, async (host) => {
    const track = host.querySelector<HTMLElement>("[data-blog-slides]")!;
    const Pointer = (dom.window as unknown as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? dom.window.MouseEvent;
    await act(async () => {
      track.dispatchEvent(new Pointer("pointerdown", { bubbles: true, clientX: 300 }));
      track.dispatchEvent(new Pointer("pointerup", { bubbles: true, clientX: 120 }));
    });
    assert.match(track.style.transform, /translateX\(-100%\)/, "a swipe to the left shows the next story");
    const link = host.querySelector("a")!;
    const afterSwipe = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => { link.dispatchEvent(afterSwipe); });
    assert.equal(afterSwipe.defaultPrevented, true, "the click that ends a swipe does not open a story");
    const plain = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => { link.dispatchEvent(plain); });
    assert.equal(plain.defaultPrevented, false, "a plain click still opens it");
  });
});

test("Load more shows six more cards each time and steps aside once every card shows", async () => {
  const card = (n: number) => <article key={n} data-blog-card>Card {n}</article>;
  await mount(<BlogCardList step={6}>{Array.from({ length: 14 }, (_, n) => card(n + 1))}</BlogCardList>, async (host) => {
    const hidden = () => [...host.querySelectorAll<HTMLElement>("article[data-blog-card]")].map((item) => item.hidden);
    assert.equal(hidden().filter((value) => !value).length, 6);
    const more = () => host.querySelector<HTMLButtonElement>("button[data-load-more]");
    await act(async () => more()!.click());
    assert.equal(hidden().filter((value) => !value).length, 12);
    await act(async () => more()!.click());
    assert.equal(hidden().filter((value) => !value).length, 14);
    assert.equal(more(), null);
  });
  await mount(<BlogCardList step={6}>{[card(1), card(2)]}</BlogCardList>, (host) => {
    assert.equal(host.querySelector("button[data-load-more]"), null, "no button when every card already shows");
  });
});

test("Share uses the phone's share sheet when there is one, and otherwise copies the address", async () => {
  const url = "https://store.maplefurnishers.com/blogs/recent-stories/a-story";
  const shared: unknown[] = [];
  Object.defineProperty(dom.window.navigator, "share", { configurable: true, value: async (data: unknown) => { shared.push(data); } });
  await mount(<BlogShareButton title="A story" url={url} icon="/blog/share.svg" />, async (host) => {
    await act(async () => host.querySelector<HTMLButtonElement>("button[data-share-native]")!.click());
    assert.deepEqual(shared, [{ title: "A story", url }]);
  });
  Object.defineProperty(dom.window.navigator, "share", { configurable: true, value: undefined });
  const copied: string[] = [];
  Object.defineProperty(dom.window.navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { copied.push(text); } } });
  await mount(<BlogShareButton title="A story" url={url} icon="/blog/share.svg" />, async (host) => {
    const button = host.querySelector<HTMLButtonElement>("button[data-share-native]")!;
    await act(async () => button.click());
    assert.deepEqual(copied, [url]);
    assert.match(button.textContent ?? "", /Link copied/);
  });
});

test("Add to cart puts one of the piece's option in the cart and opens it", async () => {
  const empty = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", checkoutEnabled: false, mode: "preview", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 } };
  const writes: { url: string; quantity: number }[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (init?.method !== "PUT") return Response.json(empty);
    const body = JSON.parse(String(init.body));
    writes.push({ url: String(input), quantity: body.quantity });
    return Response.json({ ...empty, mutationContext: { ...empty.mutationContext, revision: 1 }, mutationResult: { id: body.mutation.id, status: "applied" } });
  };
  sessionStorage.clear();
  try {
    await mount(<ShopProvider><BlogAddToCart title="ARVEN" variant={{ id: "arven-default", pricePaise: 1_652_000, published: true, available: false }} /></ShopProvider>, async (host) => {
      const button = host.querySelector<HTMLButtonElement>("button[data-add-to-cart]")!;
      assert.equal(button.getAttribute("aria-label"), "Add ARVEN to cart");
      await act(async () => button.click());
      assert.deepEqual(writes, [{ url: "/api/cart/items/arven-default", quantity: 1 }]);
      assert.equal(host.querySelector("[role=alert]"), null, "no complaint when the piece went in");
    });
  } finally {
    globalThis.fetch = previous;
  }
});

test("Add to cart says so when the cart cannot take the piece, in the store's own words", async () => {
  const empty = { items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", checkoutEnabled: false, mode: "preview", mutationContext: { cartIdentity: "b".repeat(64), revision: 0 } };
  const previous = globalThis.fetch;
  globalThis.fetch = async (_input, init) => init?.method === "PUT"
    ? Response.json({ code: "PREVIEW_BLOCKED", message: "This preview writes nothing to the live store." }, { status: 403 })
    : Response.json(empty);
  sessionStorage.clear();
  try {
    await mount(<ShopProvider><BlogAddToCart title="Avelia" variant={{ id: "avelia-default", pricePaise: 2_950_000, published: true, available: false }} /></ShopProvider>, async (host) => {
      const button = host.querySelector<HTMLButtonElement>("button[data-add-to-cart]")!;
      await act(async () => button.click());
      // An add the store cannot confirm locks the cart until it is checked, so nothing is added twice; the alert says so.
      assert.match(host.querySelector("[role=alert]")?.textContent ?? "", /couldn.t confirm your cart update/i);
      assert.equal(host.querySelector<HTMLButtonElement>("button[data-add-to-cart]")?.disabled, true);
    });
  } finally {
    globalThis.fetch = previous;
  }
});
