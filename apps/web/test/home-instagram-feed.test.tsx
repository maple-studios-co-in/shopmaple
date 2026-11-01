import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { JSDOM } from "jsdom";
import Home from "../app/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";

// The classic homepage's Instagram rail shows the API's cached Meta feed when it has posts, and the
// staff-edited list otherwise. Only the posts change; the rail's markup is the classic one.
const staffPosts = [
  { href: "https://www.instagram.com/p/StaffOne/", src: "/media/instagram/De4Nz4VvwNZ.jpg", alt: "Staff post one" },
  { href: "https://www.instagram.com/reel/StaffTwo/", src: "/media/instagram/De1sBF7vIl5.jpg", alt: "Staff post two" },
];
const feedPosts = [
  { href: "https://www.instagram.com/p/FeedOne/", src: `/media/instagram-feed/${"a".repeat(64)}.webp`, alt: "Instagram post with the caption: A walnut table" },
  { href: "https://www.instagram.com/reel/FeedTwo/", src: `/media/instagram-feed/${"b".repeat(64)}.webp`, alt: "Maple on Instagram" },
];

async function renderHome(feed: (signal?: AbortSignal) => Promise<Response>, contentDelay = 0) {
  const content = structuredClone(defaultStorefrontContent);
  content.homeSections = [{ key: "instagram", enabled: true }] as typeof content.homeSections;
  content.motion = { autoplaySocial: false, autoplayCities: false, autoplayTicker: false, revealSections: false };
  content.instagramPosts = staffPosts;
  const previous = globalThis.fetch;
  const started: Record<string, number> = {};
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    started[new URL(url).pathname] = Date.now();
    if (url.endsWith("/api/content/storefront")) {
      await new Promise((resolve) => setTimeout(resolve, contentDelay));
      return Response.json({ version: 3, content });
    }
    if (url.endsWith("/api/instagram/feed")) return feed(init?.signal ?? undefined);
    return new Response(null, { status: 404 });
  };
  try {
    const stream = await renderToReadableStream(<ShopProvider><Home /></ShopProvider>);
    const doc = new JSDOM(await new Response(stream).text()).window.document;
    const section = doc.querySelector('section[aria-label="Maple on Instagram"]');
    assert.ok(section, "The classic Instagram section renders");
    const links = [...section.querySelectorAll<HTMLAnchorElement>('a[href*="/p/"], a[href*="/reel/"]')];
    return {
      started,
      hrefs: links.map((link) => link.getAttribute("href")),
      images: links.map((link) => decodeURIComponent(link.querySelector("img")?.getAttribute("src") ?? "")),
    };
  } finally { globalThis.fetch = previous; }
}

test("the classic homepage shows the fetched Instagram posts, from our own image copies", async () => {
  const page = await renderHome(async () => Response.json({ posts: feedPosts }));
  assert.deepEqual(page.hrefs, feedPosts.map((post) => post.href));
  for (const [index, image] of page.images.entries()) assert.ok(image.includes(feedPosts[index]!.src), `${image} is our copy`);
});

test("the feed is requested alongside the content, not after it", async () => {
  const page = await renderHome(async () => Response.json({ posts: feedPosts }), 300);
  assert.ok(page.started["/api/instagram/feed"]! - page.started["/api/content/storefront"]! < 150, "Both requests start together");
});

test("with no fetched posts the classic homepage keeps the staff-edited list", async () => {
  const cases: [string, (signal?: AbortSignal) => Promise<Response>][] = [
    ["feed off or not fetched yet", async () => Response.json({ posts: [] })],
    ["API error", async () => new Response("down", { status: 500 })],
    ["API unreachable", async () => { throw new TypeError("fetch failed"); }],
    ["an Instagram CDN address instead of our copy", async () => Response.json({ posts: [{ ...feedPosts[0], src: "https://scontent.cdninstagram.com/x.jpg" }] })],
    ["a request that hangs", (signal) => new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason)))],
  ];
  for (const [name, feed] of cases) assert.deepEqual((await renderHome(feed)).hrefs, staffPosts.map((post) => post.href), name);
});
