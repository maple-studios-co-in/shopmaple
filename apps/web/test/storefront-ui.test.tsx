import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Product } from "@shopmaple/contracts";
import { CollectionListing } from "../components/collection-listing";
import { ProductCard } from "../components/product-card";
import { Hero } from "../components/hero";
import { ProductDetail } from "../components/product-detail";
import { ShopProvider } from "../components/shop-provider";
import { collectionQuery } from "../lib/collections";
import { Footer } from "../components/footer";
import ContactPage from "../app/pages/[slug]/page";

const dom = new JSDOM("<!doctype html><div id='root'></div>", {
  url: "http://localhost:3000",
});
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const product: Product = {
  id: "chair",
  handle: "chair",
  title: "Aero Dining Chair",
  description: "A dining chair.",
  category: "chairs",
  images: ["https://example.com/blue.jpg", "https://example.com/red.jpg"],
  published: true,
  source: "shopify-preview",
  sourceUpdatedAt: "2026-10-26T00:00:00Z",
  variants: [
    {
      id: "blue",
      title: "Blue",
      sku: "BLUE",
      pricePaise: 1000000,
      compareAtPaise: null,
      available: false,
      stockPolicy: "unverified",
    },
    {
      id: "red",
      title: "Red",
      sku: "RED",
      pricePaise: 1200000,
      compareAtPaise: null,
      available: false,
      stockPolicy: "unverified",
    },
  ],
};
async function mount(
  children: React.ReactNode,
  check: () => Promise<void> | void,
) {
  const root = createRoot(document.getElementById("root")!);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      items: [],
      itemCount: 0,
      subtotalPaise: 0,
      currency: "INR",
      checkoutEnabled: false,
      mode: "preview",
    });
  try {
    await act(async () => root.render(<ShopProvider>{children}</ShopProvider>));
    await check();
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previousFetch;
  }
}
test("footer exposes callable customer-care and bulk-order contacts", async () => {
  await mount(<Footer />, () => {
    const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href^="tel:"]')];
    assert.equal(links.length, 3);
    for (const link of links) assert.match(link.getAttribute("href")!, /^tel:\+91[0-9]{10}$/);
    assert.ok(document.querySelector('a[href="mailto:contact@maplefurnishers.com"]'));
  });
});
test("footer routes customer care and bulk collaboration to their respective business contacts", async () => {
  await mount(<Footer />, () => {
    const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href^="tel:"]')];
    assert.equal(links.length, 3);
    assert.deepEqual(links.map((link) => [link.getAttribute("href"), link.textContent?.trim()]), [
      ["tel:+918796130252", "+91 87961 30252"],
      ["tel:+919262968727", "+91 92629 68727"],
      ["tel:+918796130252", "+91 87961 30252"],
    ]);
    const bulk = [...document.querySelectorAll(".maple-footer-contact > div")]
      .find((section) => section.querySelector("h3")?.textContent === "For Bulk Order/Collaboration:");
    const email = bulk?.querySelector<HTMLAnchorElement>('a[href^="mailto:"]');
    assert.equal(email?.getAttribute("href"), "mailto:aditya@maplefurnishers.com");
    assert.equal(email?.textContent?.trim(), "aditya@maplefurnishers.com");
  });
});
test("contact page phone action dials the current business number", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 });
  let page;
  try {
    page = await ContactPage({params: Promise.resolve({slug: "contact"}), searchParams: Promise.resolve({})});
  } finally {
    globalThis.fetch = previousFetch;
  }
  await mount(page, () => {
    const link = document.querySelector<HTMLAnchorElement>('.cp-contact-links a[href^="tel:"]');
    assert.equal(link?.getAttribute("href"), "tel:+918796130252");
    assert.equal(link?.textContent?.trim(), "+91 87961 30252");
  });
});
test("collection identifies its category and each applied filter can be removed without clearing the others", async () => {
  await mount(
    <CollectionListing
      handle="all"
      title="All Furniture"
      query={collectionQuery({
        q: "chair",
        min: "100",
        category: "chairs",
        availability: "out",
        sort: "price-desc",
        page: "2",
      })}
      products={[product]}
      total={1}
      collectionTotal={20}
      limit={24}
      inStock={0}
      outOfStock={20}
      highestPrice={1200000}
    />,
    () => {
      assert.equal(
        document.querySelector("h1")?.classList.contains("sr-only"),
        false,
        "collection name must be visible",
      );
      const remove = document.querySelector<HTMLAnchorElement>(
        'a[aria-label="Remove category filter"]',
      );
      assert.ok(remove, "an individual category filter can be removed");
      const url = new URL(remove.href);
      assert.equal(url.searchParams.get("category"), null);
      assert.equal(url.searchParams.get("q"), "chair");
      assert.equal(url.searchParams.get("min"), "100");
      assert.equal(url.searchParams.get("availability"), "out");
      assert.equal(url.searchParams.get("sort"), "price-desc");
      assert.equal(url.searchParams.get("page"), null);
    },
  );
});
test("product card exposes variant choice and persists its saved state", async () => {
  localStorage.clear();
  await mount(<ProductCard product={product} />, async () => {
    assert.ok(
      document.querySelector(
        'a[aria-label="View 2 options for Aero Dining Chair"]',
      ),
      "variant choices should be discoverable from the card",
    );
    const save = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Save Aero Dining Chair"]',
    )!;
    await act(async () => save.click());
    assert.equal(save.getAttribute("aria-pressed"), "true");
    assert.deepEqual(JSON.parse(localStorage.getItem("maple-favourites")!), [
      "chair",
    ]);
  });
});
test("product variants update price, gallery and enquiry while delivery stays an enquiry", async () => {
  const replacements: string[] = [];
  const router = {
    bfcacheId: "test",
    back() {},
    forward() {},
    refresh() {},
    hmrRefresh() {},
    push() {},
    replace(href: string) {
      replacements.push(href);
    },
    prefetch() {},
  };
  await mount(
    <AppRouterContext.Provider value={router}>
      <ProductDetail
        product={product}
        presentation={{
          variantImages: { blue: product.images[0]!, red: product.images[1]! },
          reviewLabel: "No reviews",
        }}
      />
    </AppRouterContext.Provider>,
    async () => {
      const phone = document.querySelector<HTMLAnchorElement>(".pdp-phone");
      assert.equal(phone?.getAttribute("href"), "tel:+918796130252");
      assert.match(phone?.textContent ?? "", /\+91 87961 30252/);
      assert.match(
        document.querySelector(".pdp-serviceability label")!.textContent!,
        /Delivery enquiry/,
        "a postcode field must not promise an availability lookup",
      );
      assert.doesNotMatch(
        document.querySelector(".pdp-info")!.textContent!,
        /Taxes included|36 Month|Delivery Across India/,
      );
      const option =
        document.querySelector<HTMLInputElement>('input[value="red"]')!;
      await act(async () => option.click());
      assert.match(
        document.querySelector(".pdp-price-block strong")!.textContent!,
        /12,000/,
      );
      assert.equal(
        document.querySelector(".product-main-image img")?.getAttribute("src"),
        product.images[1],
      );
      assert.equal(replacements.at(-1), "?variant=red");
      const enquiry =
        document.querySelector<HTMLAnchorElement>(".pdp-purchase a")!;
      assert.equal(new URL(enquiry.href).searchParams.get("variant"), "Red");
      assert.equal(new URL(enquiry.href).searchParams.get("sku"), "RED");
      assert.ok(
        document.querySelector('a[href="#product-specifications"]'),
        "dimensions should be easy to find before enquiring",
      );
    },
  );
});

test("hero keeps product discovery clear and only downloads its film when requested", async () => {
  Object.assign(dom.window, { matchMedia: () => ({ matches: false }) });
  dom.window.HTMLMediaElement.prototype.play = async function () {};
  dom.window.HTMLMediaElement.prototype.pause = function () {};
  await mount(<Hero />, async () => {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 1700)));
    const video = document.querySelector("video")!;
    assert.equal(
      video.getAttribute("src"),
      null,
      "the film should not consume bandwidth before a shopper requests it",
    );
    assert.match(
      document.querySelector(".hero-film")!.textContent!,
      /Explore Collection/,
    );
    assert.match(
      document.querySelector(".hero-categories")!.textContent!,
      /Starting from ₹25,000/,
    );
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Play workshop video"]',
        )!
        .click(),
    );
    assert.equal(video.getAttribute("src"), "/media/workshop.mp4");
    assert.ok(
      document.querySelector('button[aria-label="Pause workshop video"]'),
    );
  });
});
