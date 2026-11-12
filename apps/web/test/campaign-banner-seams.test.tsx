import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";
import { JSDOM } from "jsdom";
import { CampaignBanner, type CampaignKey } from "../components/campaign-banner";
import campaigns from "../data/diwali-campaigns.json";

// The Diwali artwork is drawn as Figma's slices side by side (owner, 12 Nov 2026: a hairline showed between them on the
// chairs page). At percentage sizes slice edges fall between pixels, so each slice reaches 1px past its edge and the
// next one covers the join; the scene clips the outer edges.
test("every Diwali banner slice overlaps its neighbour by a pixel, on desktop and on phones", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 });
  try {
    const sliced: string[] = [];
    for (const key of Object.keys(campaigns) as CampaignKey[]) {
      const stream = await renderToReadableStream(<CampaignBanner campaign={key} />);
      const doc = new JSDOM(await new Response(stream).text()).window.document;
      for (const artwork of ["desktop", "mobile"]) {
        const tiles = [...doc.querySelectorAll<HTMLElement>(`[data-artwork="${artwork}"] [data-figma-node]`)];
        // A banner drawn from one picture (an upload, or a default photo) has no slices and no joins.
        if (tiles.length) sliced.push(`${key} ${artwork}`);
        for (const tile of tiles) {
          const style = tile.getAttribute("style") ?? "";
          assert.match(style, /width:calc\([\d.]+% \+ 1px\)/, `${key} ${artwork} ${tile.dataset.figmaNode}: ${style}`);
          assert.match(style, /height:calc\([\d.]+% \+ 1px\)/, `${key} ${artwork} ${tile.dataset.figmaNode}: ${style}`);
        }
      }
    }
    for (const page of ["chairs-hero desktop", "chairs-hero mobile", "chairs-sale desktop", "chairs-sale mobile"]) assert.ok(sliced.includes(page), `${page} is drawn from slices`);
  } finally {
    globalThis.fetch = previous;
  }
});
