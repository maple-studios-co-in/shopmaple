import React from "react";
import { JSDOM } from "jsdom";
import { renderToReadableStream } from "react-dom/server";
import type { Product } from "@shopmaple/contracts";
import { ShopProvider } from "../../components/shop-provider";
import { cardFixture } from "./catalogue-fixtures";

/** The four real pieces the blog designs name (Figma 268:4185, 268:4825), as the catalogue titles them. */
export const blogTitles: Record<string, string> = {
  "seren-mpl-ch-acc-seren-bgcgsg": "Seren - Burgundy Suede",
  arven: "ARVEN",
  avelia: "Avelia",
  vellora: "Vellora",
};
const photo = (handle: string) => `https://cdn.shopify.com/s/files/1/0691/8651/9229/files/${handle}.jpg`;

/** A synthetic catalogue product with one made-to-order option. */
export const blogProduct = (handle: string, pricePaise: number | null): Product => ({
  id: handle, handle, title: blogTitles[handle] ?? `${handle} Chair`, description: "", category: "chairs",
  images: [photo(handle)], published: true, source: "keeri", sourceUpdatedAt: "2026-11-01T00:00:00Z",
  variants: [{ id: `${handle}-default`, title: "Default Title", sku: null, pricePaise, compareAtPaise: null, available: false, stockPolicy: "made_to_order" }],
});

/**
 * A storefront API for the blog: no published content (so the defaults apply), compact cards for any handles asked,
 * and the given products by handle. Anything else is not found, as an outage would be.
 */
export function blogFetch({ products = {}, cards = true }: { products?: Record<string, Product | null>; cards?: boolean } = {}): typeof fetch {
  return async (input) => {
    const url = new URL(String(input), "http://api.invalid");
    if (url.pathname === "/api/content/storefront") return Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 });
    if (cards && url.pathname === "/api/catalogue/cards") {
      const handles = (url.searchParams.get("handles") ?? "").split(",").filter(Boolean);
      return Response.json({ products: handles.map((handle) => ({ ...cardFixture(handle, blogTitles[handle]), image: photo(handle) })), published: true });
    }
    const product = /^\/api\/products\/([^/]+)$/.exec(url.pathname);
    const value = product ? products[decodeURIComponent(product[1]!)] : undefined;
    return value ? Response.json(value) : Response.json({ code: "NOT_FOUND" }, { status: 404 });
  };
}

/**
 * Renders a page on the server with the given API, under its own API address so the catalogue's 30-second memory of
 * one test never answers another, and reads the finished page in one piece, as a crawler gets it.
 */
export async function renderBlogPage(element: React.ReactNode, fetcher: typeof fetch, api: string) {
  const previous = { fetch: globalThis.fetch, api: process.env.API_URL };
  globalThis.fetch = fetcher;
  process.env.API_URL = api;
  try {
    const stream = await renderToReadableStream(<ShopProvider>{element}</ShopProvider>, { progressiveChunkSize: Number.POSITIVE_INFINITY });
    await stream.allReady;
    return new JSDOM(await new Response(stream).text()).window.document;
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.api === undefined) delete process.env.API_URL; else process.env.API_URL = previous.api;
  }
}

/** The finished page in one piece, waiting for every async part (bestsellers, related products, tiles) to settle. */
export async function renderSettled(element: React.ReactNode) {
  const stream = await renderToReadableStream(<ShopProvider>{element}</ShopProvider>, { progressiveChunkSize: Number.POSITIVE_INFINITY });
  await stream.allReady;
  return new JSDOM(await new Response(stream).text()).window.document;
}
/** Catalogue reads the blog pages make for their product bands: public, never content drafts. */
export const isCatalogueRead = (url: string) => /\/api\/(catalogue|products)\//.test(url);
/** The distinct stories a listing links to, newest first (the slider's three, then the cards). */
export const storyLinks = (document: Document) =>
  [...new Set([...document.querySelectorAll("[data-blog-featured] article h2 a, article[data-blog-card] h2 a")].map((link) => link.getAttribute("href")))];

export const normalize = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
