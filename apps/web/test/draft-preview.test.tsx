import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { JSDOM } from "jsdom";
import Home from "../app/page";
import { ShopProvider } from "../components/shop-provider";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { renderStorefrontRoute, listPreviewPages } from "../lib/storefront-routes";
import { previewMediaContent, readDraftPreview } from "../lib/draft-preview";

const sha = "f".repeat(64);
function draftDocument() {
  const draft = structuredClone(defaultStorefrontContent);
  draft.homeCopy.categoryHeading = "Draft-only heading";
  draft.homeSections = [{ key: "categories", enabled: true }, { key: "instagram", enabled: true }];
  draft.instagramPosts[0]!.src = `/media/uploads/${sha}.webp`;
  draft.pages = [{ slug: "care-guide", title: "Care guide draft", description: "Unpublished", body: "Keep dry.", banner: { desktopImage: `/media/uploads/${sha}.webp`, mobileImage: `/media/uploads/${sha}.webp`, alt: "Banner", href: "/collections/all", label: "Explore" } }];
  return draft;
}
async function html(node: React.ReactNode) {
  return new Response(await renderToReadableStream(<ShopProvider>{node}</ShopProvider>)).text();
}

test("the shared renderer shows draft content while the public route keeps the published snapshot", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => String(input).endsWith("/api/content/storefront")
    ? Response.json({ version: 2, content: structuredClone(defaultStorefrontContent) })
    : new Response(null, { status: 404 });
  try {
    const draft = renderStorefrontRoute(["home"], { ...previewMediaContent(draftDocument()), campaignsAvailable: true });
    assert.ok(draft);
    assert.equal(draft.title, "Home");
    const preview = new JSDOM(await html(draft.node)).window.document;
    assert.deepEqual([...preview.querySelectorAll("[data-home-section]")].map(node => node.getAttribute("data-home-section")), ["categories", "instagram"]);
    assert.equal(preview.querySelector(".home-category-section h2")?.textContent, "Draft-only heading");
    const post = preview.querySelector<HTMLImageElement>(`img[src="/api/admin/media/${sha}/preview"]`);
    assert.ok(post, "Private library media renders through the staff preview route");
    assert.ok(post.hasAttribute("data-unoptimized"), "Staff-only media bypasses the shared image optimizer cache");
    const published = new JSDOM(await html(<Home />)).window.document;
    assert.equal(published.querySelector(".home-category-section h2")?.textContent, defaultStorefrontContent.homeCopy.categoryHeading);
    assert.equal(published.querySelectorAll("[data-home-section]").length, defaultStorefrontContent.homeSections.filter(section => section.enabled).length);
    assert.equal(published.querySelector(`img[src^="/api/admin/media/"]`), null);
  } finally { globalThis.fetch = previous; }
});

test("the renderer resolves every storefront page family from one document and rejects unknown addresses", async () => {
  const draft = { ...previewMediaContent(draftDocument()), campaignsAvailable: true };
  const page = renderStorefrontRoute(["pages", "care-guide"], draft);
  assert.equal(page?.title, "Care guide draft");
  const pageDoc = new JSDOM(await html(page!.node)).window.document;
  assert.equal(pageDoc.querySelector("h1")?.textContent, "Care guide draft");
  assert.equal(pageDoc.querySelector(".content-page-banner img")?.getAttribute("src"), `/api/admin/media/${sha}/preview`);
  assert.equal(renderStorefrontRoute(["pages", "our-story"], draft)?.path, "/pages/our-story");
  assert.equal(renderStorefrontRoute(["pages", "sofas"], draft)?.title, "Sofas");
  assert.equal(renderStorefrontRoute(["pages", "contact"], draft)?.path, "/pages/contact");
  assert.equal(renderStorefrontRoute(["pages", "returns"], draft)?.path, "/pages/returns");
  assert.equal(renderStorefrontRoute(["policies", "refund-policy"], draft)?.path, "/policies/refund-policy");
  const blog = listPreviewPages(draft).find(item => item.segments[0] === "blogs")!;
  assert.ok(blog, "Preview page list includes blogs");
  assert.equal(renderStorefrontRoute(blog.segments, draft)?.path, `/${blog.segments.join("/")}`);
  assert.equal(renderStorefrontRoute(["pages", "missing-page"], draft), null);
  assert.equal(renderStorefrontRoute(["policies", "not-a-policy"], draft), null);
  assert.equal(renderStorefrontRoute(["admin"], draft), null);
  assert.equal(renderStorefrontRoute(["home", "extra", "deep"], draft), null);
  assert.ok(listPreviewPages(draft).some(item => item.label === "Care guide draft" && item.segments.join("/") === "pages/care-guide"));
});

test("media rewriting targets only library uploads and leaves the input untouched", () => {
  const draft = draftDocument();
  const before = structuredClone(draft);
  const rewritten = previewMediaContent(draft);
  assert.deepEqual(draft, before, "Input document is not mutated");
  assert.equal(rewritten.instagramPosts[0]!.src, `/api/admin/media/${sha}/preview`);
  assert.equal(rewritten.pages[0]!.banner!.mobileImage, `/api/admin/media/${sha}/preview`);
  assert.equal(rewritten.instagramPosts[1]!.src, draft.instagramPosts[1]!.src, "Bundled and CDN images stay as they are");
  assert.equal(previewMediaContent({ ...draft, pages: [{ ...draft.pages[0]!, body: `/media/uploads/${sha}.webp` }] }).pages[0]!.body, `/media/uploads/${sha}.webp`, "Only image fields are rewritten, not prose");
});

test("reading a draft preview forwards only the staff cookie, never caches and reports token failures", async () => {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const transport: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    const token = new URL(String(input)).searchParams.get("token");
    if (token === "expired") return Response.json({ code: "PREVIEW_TOKEN_EXPIRED", message: "This preview link has expired." }, { status: 403 });
    if (token === "stale") return Response.json({ code: "PREVIEW_VERSION_STALE", message: "The draft has changed." }, { status: 409 });
    if (token === "broken") return Response.json({ version: "nope" });
    return Response.json({ version: 7, publishedVersion: 5, expiresAt: "2026-10-28T09:15:00Z", content: draftDocument() });
  };
  const ok = await readDraftPreview("good.token", "cart=abc; shop_admin=" + "a".repeat(64) + "; other=1", transport);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.version, 7);
    assert.equal(ok.publishedVersion, 5);
    assert.equal(ok.content.homeCopy.categoryHeading, "Draft-only heading");
    assert.equal(ok.content.campaignsAvailable, true);
  }
  assert.equal(requests[0]!.url, "http://127.0.0.1:4100/api/admin/content/preview?token=good.token");
  assert.equal(new Headers(requests[0]!.init?.headers).get("cookie"), "shop_admin=" + "a".repeat(64));
  assert.equal(requests[0]!.init?.cache, "no-store");
  const secure = await readDraftPreview("good.token", "__Host-shop_admin=" + "b".repeat(64), transport);
  assert.equal(new Headers(requests[1]!.init?.headers).get("cookie"), "__Host-shop_admin=" + "b".repeat(64));
  assert.equal(secure.ok, true);
  assert.deepEqual(await readDraftPreview("expired", "", transport), { ok: false, status: 403, code: "PREVIEW_TOKEN_EXPIRED", message: "This preview link has expired." });
  assert.deepEqual(await readDraftPreview("stale", "", transport), { ok: false, status: 409, code: "PREVIEW_VERSION_STALE", message: "The draft has changed." });
  const broken = await readDraftPreview("broken", "", transport);
  assert.deepEqual([broken.ok, (broken as { status: number }).status], [false, 502]);
  const failing = await readDraftPreview("good.token", "", async () => { throw new Error("offline"); });
  assert.deepEqual([failing.ok, (failing as { status: number }).status], [false, 503]);
});

test("pictures chosen in hero slides, extra Nimbus cards and the editorial block show in the staff preview too", () => {
  const upload = `/media/uploads/${sha}.webp`;
  const content = previewMediaContent({ homeDetails: { hero: { slides: [{ kind: "video", src: "https://shop.maplefurnishers.com/cdn/shop/videos/x.mp4", poster: upload }] }, nimbus: { slides: [{ image: upload, mobileImage: upload }] }, editorial: { leftImage: upload, rightImage: upload, text: `a path ${upload} in prose` } } });
  const preview = `/api/admin/media/${sha}/preview`;
  assert.equal(content.homeDetails.hero.slides[0]!.poster, preview);
  assert.equal(content.homeDetails.nimbus.slides[0]!.image, preview);
  assert.equal(content.homeDetails.nimbus.slides[0]!.mobileImage, preview);
  assert.equal(content.homeDetails.editorial.leftImage, preview);
  assert.equal(content.homeDetails.editorial.rightImage, preview);
  assert.equal(content.homeDetails.editorial.text, `a path ${upload} in prose`, "prose is left alone");
});
