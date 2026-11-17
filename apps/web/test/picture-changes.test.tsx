import assert from "node:assert/strict";
import { test } from "node:test";
import type { StorefrontContent } from "@shopmaple/contracts";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { pictureChanges } from "../lib/picture-changes";

// Owner, 17 Nov 2026: "the changes with updated photo happens there immediately in live preview as I select the image".
// The editor hands the page each picture an edit chose, so it shows before the draft is even saved.

const upload = (letter: string) => `/media/uploads/${letter.repeat(64)}.webp`;
const preview = (letter: string) => `/api/admin/media/${letter.repeat(64)}/preview`;
const fresh = (): StorefrontContent => structuredClone(defaultStorefrontContent);

test("nothing chosen, nothing to swap", () => {
  const content = fresh();
  assert.deepEqual(pictureChanges(content, content), []);
  assert.deepEqual(pictureChanges(null, content), []);
  assert.deepEqual(pictureChanges(content, { ...content, homeCopy: { ...content.homeCopy, ticker: "Words only" } }), []);
});

test("a footer icon or any placement chosen from the library is swapped by its placement, through the staff preview of the upload", () => {
  const content = fresh();
  const next = { ...content, templateMedia: [{ key: "home-newsletter" as const, image: upload("a"), alt: "Newsletter" }] };
  assert.deepEqual(pictureChanges(content, next), [{ slot: "home-newsletter", src: preview("a"), alt: "Newsletter" }]);
  // A responsive placement given a new desktop picture keeps its original phone crop, as the save will.
  const responsive = { ...content, templateMedia: [{ key: "nimbus-hero-poster" as const, image: upload("b"), mobileImage: "/media/nimbus-collection/hero-mobile.webp", alt: "Opening" }] };
  assert.deepEqual(pictureChanges(content, responsive), [{ slot: "nimbus-hero-poster", src: preview("b"), mobileSrc: "/media/nimbus-collection/hero-mobile.webp", alt: "Opening" }]);
});

test("a campaign banner's first chosen picture shows at both sizes; a replacement with no picture yet is not swapped", () => {
  const content = fresh();
  const withArt = (artwork: StorefrontContent["campaigns"][number]["artwork"]) =>
    ({ ...content, campaigns: content.campaigns.map((item) => item.key === "sofas-hero" ? { ...item, artwork } : item) });
  const replacing = withArt({ desktopImage: "", mobileImage: "", alt: "Settle in" });
  assert.deepEqual(pictureChanges(content, replacing), []);
  assert.deepEqual(pictureChanges(replacing, withArt({ desktopImage: upload("c"), mobileImage: "", alt: "Settle in" })),
    [{ target: "campaign:sofas-hero", src: preview("c"), alt: "Settle in" }]);
  const both = withArt({ desktopImage: upload("c"), mobileImage: upload("d"), alt: "Settle in" });
  assert.deepEqual(pictureChanges(withArt({ desktopImage: upload("c"), mobileImage: "", alt: "Settle in" }), both),
    [{ target: "campaign:sofas-hero", src: preview("c"), mobileSrc: preview("d"), alt: "Settle in" }]);
});

test("tiles, slides, posts and page banners are swapped by the target the page names them with", () => {
  const content = fresh();
  const posts = content.instagramPosts.map((post, index) => index === 1 ? { ...post, src: upload("e") } : post);
  assert.deepEqual(pictureChanges(content, { ...content, instagramPosts: posts }).map((item) => [item.target, item.src]), [["instagram:1", preview("e")]]);
  const page = { slug: "about", title: "About us", description: "", body: "", banner: { desktopImage: "/media/a.webp", mobileImage: "/media/a.webp", alt: "Workshop", href: "/collections/all", label: "Explore" } };
  const before = { ...content, pages: [page] };
  const after = { ...content, pages: [{ ...page, banner: { ...page.banner, desktopImage: upload("f") } }] };
  assert.deepEqual(pictureChanges(before, after), [{ target: "page-banner:about", src: preview("f"), mobileSrc: "/media/a.webp", alt: "Workshop" }]);
});

test("an address typed by hand, or a picture put back to its original, is left to the redraw after the save", () => {
  const content = fresh();
  const typed = { ...content, templateMedia: [{ key: "home-newsletter" as const, image: "/media/home/news", alt: "Newsletter" }] };
  assert.deepEqual(pictureChanges(content, typed), [], "half an address would flash a broken picture");
  const chosen = { ...content, templateMedia: [{ key: "home-newsletter" as const, image: upload("a"), alt: "Newsletter" }] };
  assert.deepEqual(pictureChanges(chosen, content), [], "Restore original waits for the redraw");
});
