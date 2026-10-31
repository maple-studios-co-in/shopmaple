import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { storefrontContentSchema } from "@shopmaple/contracts";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { readPublishedContent } from "../lib/content";
import { ContentPage } from "../components/content-page";

test("bundled content preserves original source text and passes the strict publication contract", () => {
  assert.equal(
    storefrontContentSchema.safeParse(defaultStorefrontContent).success,
    true,
    JSON.stringify(
      storefrontContentSchema.safeParse(defaultStorefrontContent).error?.issues,
    ),
  );
  assert.equal(
    defaultStorefrontContent.homeCopy.socialHeading,
    "Our Social Proof",
  );
  assert.equal(defaultStorefrontContent.homeSections[0]?.key, "hero");
});
test("published reader requests only public fresh content and accepts valid published revisions", async () => {
  let requested = "";
  let cache: RequestCache | undefined;
  const changed = {
    ...defaultStorefrontContent,
    homeCopy: {
      ...defaultStorefrontContent.homeCopy,
      socialHeading: "Approved heading",
    },
  };
  const result = await readPublishedContent(async (input, init) => {
    requested = String(input);
    cache = init?.cache;
    return Response.json({ version: 2, content: changed });
  });
  assert.equal(result.homeCopy.socialHeading, "Approved heading");
  assert.ok(requested.endsWith("/api/content/storefront"));
  assert.equal(cache, "no-store");
});
test("absent, failed, malformed and draft responses never leak drafts or erase original content", async () => {
  for (const body of [
    null,
    { version: 2, draft: { homeCopy: { socialHeading: "Secret draft" } } },
    { version: 2, content: { script: "injected" } },
  ]) {
    const r = await readPublishedContent(async () =>
      body === null ? new Response(null, { status: 404 }) : Response.json(body),
    );
    assert.equal(r.homeCopy.socialHeading, "Our Social Proof");
  }
  assert.equal(
    (
      await readPublishedContent(async () => {
        throw Error("offline");
      })
    ).homeCopy.socialHeading,
    "Our Social Proof",
  );
});
test("custom content renders text as text, with accessible approved image banner and local link", () => {
  const html = renderToStaticMarkup(
    <ContentPage
      page={{
        slug: "design-guide",
        title: "<img src=x onerror=alert(1)>",
        description: "Room guide",
        body: "First paragraph\n\n<script>alert(1)</script>",
        banner: {
          desktopImage: "/media/example.webp",
          mobileImage: "/media/example.webp",
          alt: "Maple room",
          href: "/collections/all",
          label: "Explore",
        },
      }}
    />,
  );
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelector("script"), null);
  assert.equal(
    doc.querySelector("h1")?.textContent,
    "<img src=x onerror=alert(1)>",
  );
  assert.equal(doc.querySelectorAll("[data-content-copy] p").length, 2);
  assert.equal(
    doc.querySelector("a")?.getAttribute("href"),
    "/collections/all",
  );
  assert.equal(doc.querySelector("img")?.getAttribute("alt"), "Maple room");
});
