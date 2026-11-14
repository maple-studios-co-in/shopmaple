import assert from "node:assert/strict";
import { test } from "node:test";
import type { HomeDetails } from "@shopmaple/contracts";
import { defaultHomeDetails, resolveHomeDetails } from "../lib/home-details-defaults";

/** A homepage saved between 2 and 11 Nov 2026: the Terra slide still carries the stand-in link to Sofas. */
function savedWith(slides: NonNullable<HomeDetails["nimbus"]["slides"]>): HomeDetails {
  return { ...defaultHomeDetails, nimbus: { ...defaultHomeDetails.nimbus, slides } };
}
const terra = defaultHomeDetails.nimbus.slides![0]!;

test("the Terra slide's old stand-in link to Sofas opens the Terra page (owner, 14 Nov 2026)", () => {
  const resolved = resolveHomeDetails(savedWith([{ ...terra, href: "/collections/sofas" }]));
  assert.equal(resolved.nimbus.slides?.[0]?.href, "/terra-collection");
});

test("a Terra slide with its own photo is still recognised by its heading", () => {
  const resolved = resolveHomeDetails(savedWith([{ ...terra, image: "/media/uploads/" + "a".repeat(64) + ".webp", href: "/collections/sofas" }]));
  assert.equal(resolved.nimbus.slides?.[0]?.href, "/terra-collection");
});

test("links staff chose are left alone: another slide to Sofas, and Terra pointed anywhere else", () => {
  const other = { ...terra, heading: "The Aero Edit", image: "/media/home/nimbus-clouds.webp", href: "/collections/sofas" };
  const elsewhere = { ...terra, href: "/collections/chairs" };
  const resolved = resolveHomeDetails(savedWith([other, elsewhere]));
  assert.deepEqual(resolved.nimbus.slides?.map((slide) => slide.href), ["/collections/sofas", "/collections/chairs"]);
});

test("the theme's own default already opens the Terra page", () => {
  assert.equal(resolveHomeDetails().nimbus.slides?.[0]?.href, "/terra-collection");
});

test("on the homepage, the Terra slide's Explore button opens the Terra page, Nimbus's stays on Nimbus", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { HomeNimbus } = await import("../components/home-nimbus");
  const details = resolveHomeDetails(savedWith([{ ...terra, href: "/collections/sofas" }]));
  const html = renderToStaticMarkup(<HomeNimbus content={details.nimbus} />);
  const ctas = [...html.matchAll(/<a[^>]*class="nimbus-stage-cta"[^>]*href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ctas, ["/nimbus-collection", "/terra-collection"]);
  assert.equal(html.includes('href="/collections/sofas"'), false);
});
