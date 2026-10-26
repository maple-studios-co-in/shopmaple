import assert from "node:assert/strict";
import { test } from "node:test";
import { siteChromeSchema } from "@shopmaple/contracts";
import {
  defaultSiteChrome,
  resolveSiteChrome,
  chromeHref,
} from "../lib/site-chrome-defaults";
import { readPublishedContent } from "../lib/content";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { customChrome } from "./support/site-chrome-fixture";
test("original chrome is a publishable strict document and independent editor copies cannot change public defaults", () => {
  const parsed = siteChromeSchema.safeParse(defaultSiteChrome);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
  const value = resolveSiteChrome();
  value.navigation[0]!.columns[0]!.links[0]!.label = "Draft sofa label";
  value.footer.addressLines[0] = "Draft address";
  const next = resolveSiteChrome();
  assert.equal(next.navigation[0]!.columns[0]!.links[0]!.label, "Sofas");
  assert.equal(next.footer.addressLines[0], "A-2/56 - 57, W.H.S, Kirti Nagar,");
  const published = customChrome();
  resolveSiteChrome(published).footer.shopLinks[0]!.label = "Another draft";
  assert.equal(published.footer.shopLinks[0]!.label, "Meet Maple");
  const kids = next.navigation[1]!.columns[0]!.links[4]!;
  assert.equal(
    new URL(chromeHref(kids), "https://maple.invalid").searchParams.get(
      "product",
    ),
    "Kids Beds",
  );
});
test("only validated published chrome reaches consumers; old, draft, malformed and failed reads preserve defaults", async () => {
  const published = await readPublishedContent(async () =>
    Response.json({
      version: 2,
      content: { ...defaultStorefrontContent, siteChrome: customChrome() },
    }),
  );
  assert.equal(
    resolveSiteChrome(published.siteChrome).announcement.text,
    "Visit our new showroom",
  );
  for (const body of [
    { version: 1, content: defaultStorefrontContent },
    {
      version: 3,
      draft: { ...defaultStorefrontContent, siteChrome: customChrome() },
    },
    {
      version: 3,
      content: {
        ...defaultStorefrontContent,
        siteChrome: {
          ...customChrome(),
          whatsapp: { enabled: true, phone: "javascript:bad", label: "Bad" },
        },
      },
    },
  ]) {
    const result = await readPublishedContent(async () => Response.json(body));
    assert.equal(
      resolveSiteChrome(result.siteChrome).announcement.text,
      "LUXURY FURNITURE. FACTORY PRICES.",
    );
  }
  for (const transport of [
    async () => new Response(null, { status: 503 }),
    async () =>
      Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 }),
    async () => {
      throw Error("offline");
    },
  ]) {
    const result = await readPublishedContent(transport);
    assert.equal(
      resolveSiteChrome(result.siteChrome).whatsapp.phone,
      "+918796130252",
    );
  }
});
