import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import type { StorefrontContent } from "@shopmaple/contracts";
import Home from "../app/page";
import { CampaignBanner } from "../components/campaign-banner";
import { AuthoredArticleBody } from "../components/authored-article-body";
import { ShopProvider } from "../components/shop-provider";
import { StorefrontPage, resolveStorefrontPath } from "../components/storefront/storefront-page";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { isPrivatePreviewMedia, withPreviewMedia } from "../lib/preview-media";

const sha = "a".repeat(64), sha2 = "b".repeat(64);
const published = () => { const c = structuredClone(defaultStorefrontContent); c.homeCopy.socialHeading = "Published social heading"; c.campaigns[0]!.headline = ["Published headline"]; return c; };
function draft(): StorefrontContent & { campaignsAvailable: boolean } {
  const c = structuredClone(defaultStorefrontContent) as StorefrontContent & { campaignsAvailable: boolean };
  c.campaignsAvailable = true;
  c.homeCopy.socialHeading = "Draft social heading";
  c.campaigns[0]!.headline = ["Draft headline"];
  c.pages = [{ slug: "room-guide", title: "Draft room guide", description: "", body: "Draft guide body.", banner: null }];
  c.landingPages = [{ ...structuredClone((c.landingPages.find(p => p.slug === "sofas") ?? { slug: "sofas", title: "Sofas", introduction: "", sections: [] }) as StorefrontContent["landingPages"][number]), title: "Draft sofas title" }];
  c.storyPage = { title: "Draft story title", heroHeading: ["Draft story hero"], tagline: "Draft tagline", beliefEyebrow: "Belief", beliefHeading: ["Draft belief"], beliefBody: "Draft belief body.", filmHeading: ["Film"], journeyHeading: "Draft journey", sections: ["hero", "belief-film", "journey", "cities"].map(key => ({ key, enabled: true })) as NonNullable<StorefrontContent["storyPage"]>["sections"], timeline: Array.from({ length: 7 }, (_, i) => ({ key: `chapter-${i + 1}`, date: `${2010 + i}`, title: `Chapter ${i + 1}`, body: "Body." })) } as NonNullable<StorefrontContent["storyPage"]>;
  c.editorialContent = { policies: [{ slug: "privacy-policy", title: "Draft privacy title", content: [{ tag: "p", children: ["Draft privacy copy"] }] }], blogs: [{ handle: "news", title: "Draft news title" }], articles: [] };
  c.authoredArticles = [{ blog: "news", handle: "draft-article", title: "Draft article title", excerpt: "Draft excerpt", blocks: [{ id: "p1", type: "paragraph", text: "Draft article body." }] }];
  c.instagramPosts = [{ href: "https://www.instagram.com/p/draft-one/", src: `/media/uploads/${sha}.webp`, alt: "Private draft image" }];
  c.templateMedia = [{ key: "home-workshop-poster", image: `/media/uploads/${sha2}.webp`, alt: "Private poster" }, { key: "story-hero", image: "/media/public-story.webp", alt: "Public story" }];
  return c;
}
async function html(node: React.ReactNode) {
  const stream = await renderToReadableStream(<ShopProvider>{node}</ShopProvider>);
  return new Response(stream).text();
}
async function withPublished(run: () => Promise<void>) {
  const previous = globalThis.fetch, previousApi = process.env.API_URL;
  process.env.API_URL = "http://preview-render.test";
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/content/storefront") return Response.json({ version: 3, content: published() });
    if (url.pathname === "/api/catalogue/cards") return Response.json({ published: true, products: [] });
    return new Response(null, { status: 404 });
  };
  try { await run(); } finally { globalThis.fetch = previous; process.env.API_URL = previousApi; }
}

test("campaign banners render the copy of the content they are given instead of fetching published content", async () => {
  await withPublished(async () => {
    const markup = await html(<CampaignBanner campaign="landing-announcement" content={draft()} />);
    assert.ok(markup.includes("Draft headline"), "Draft campaign copy is shown");
    assert.ok(!markup.includes("Published headline"));
    const fallback = await html(<CampaignBanner campaign="landing-announcement" />);
    assert.ok(fallback.includes("Published headline"), "Public routes still read published content");
  });
});

test("the homepage renders from draft content while the public route keeps published content", async () => {
  await withPublished(async () => {
    const path = resolveStorefrontPath([], draft());
    assert.deepEqual(path, { kind: "home" });
    const preview = await html(await StorefrontPage({ path: path!, content: draft() }));
    assert.ok(preview.includes("Draft social heading"));
    assert.ok(preview.includes("Draft headline"), "Campaign banners inside the page use the draft too");
    assert.ok(!preview.includes("Published social heading"));
    const live = await html(<Home />);
    assert.ok(live.includes("Published social heading"));
    assert.ok(!live.includes("Draft social heading"));
  });
});

test("every previewable storefront path renders its draft copy and unknown paths resolve to nothing", async () => {
  await withPublished(async () => {
    const cases: [string[], string][] = [
      [["pages", "sofas"], "Draft sofas title"],
      [["pages", "room-guide"], "Draft guide body."],
      [["pages", "our-story"], "Draft story hero"],
      [["pages", "nimbus-collection"], "Nimbus"],
      [["pages", "contact"], "GET IN TOUCH"],
      [["pages", "bulk-enquiry"], "Place Your Bulk Orders"],
      [["pages", "returns"], "Return"],
      [["policies", "privacy-policy"], "Draft privacy copy"],
      [["blogs", "news"], "Draft news title"],
      [["blogs", "news", "draft-article"], "Draft article body."],
    ];
    for (const [segments, expected] of cases) {
      const path = resolveStorefrontPath(segments, draft(), { draft: true });
      assert.ok(path, `Resolves /${segments.join("/")}`);
      const markup = await html(await StorefrontPage({ path, content: draft(), draft: true }));
      assert.ok(markup.includes(expected), `/${segments.join("/")} shows ${expected}`);
    }
    assert.equal(resolveStorefrontPath(["blogs", "news", "draft-article"], draft()), null, "Unpublished authored articles stay invisible outside a draft preview");
    for (const segments of [["pages", "missing"], ["policies", "nope"], ["blogs", "nope"], ["blogs", "news", "nope"], ["admin"], ["collections", "chairs"], ["products", "x"]])
      assert.equal(resolveStorefrontPath(segments, draft(), { draft: true }), null, `/${segments.join("/")} is not previewable`);
  });
});

test("private uploads are routed through the staff media preview path without touching public media", () => {
  const original = draft();
  const before = JSON.stringify(original);
  const mapped = withPreviewMedia(original);
  assert.equal(mapped.instagramPosts[0]!.src, `/api/admin/media/${sha}/preview`);
  assert.equal(mapped.templateMedia![0]!.image, `/api/admin/media/${sha2}/preview`);
  assert.equal(mapped.templateMedia![1]!.image, "/media/public-story.webp");
  assert.equal(mapped.homeCopy.socialHeading, "Draft social heading");
  assert.equal(JSON.stringify(original), before, "The draft object is not mutated");
  assert.equal(isPrivatePreviewMedia(`/api/admin/media/${sha}/preview`), true);
  assert.equal(isPrivatePreviewMedia(`/media/uploads/${sha}.webp`), false);
  assert.equal(isPrivatePreviewMedia("https://cdn.shopify.com/s/files/x.webp"), false);
});

test("article bodies render private preview images from the staff media path", () => {
  const doc = new JSDOM(renderToStaticMarkup(<AuthoredArticleBody blocks={[{ id: "i", type: "image", src: `/api/admin/media/${sha}/preview`, alt: "Private" }]} />)).window.document;
  assert.equal(doc.querySelector("img")?.getAttribute("src"), `/api/admin/media/${sha}/preview`);
  const unsafe = new JSDOM(renderToStaticMarkup(<AuthoredArticleBody blocks={[{ id: "i", type: "image", src: "/api/admin/media/../../etc/preview", alt: "Bad" }]} />)).window.document;
  assert.equal(unsafe.querySelector("img"), null);
});
