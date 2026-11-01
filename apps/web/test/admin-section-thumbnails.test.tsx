import assert from "node:assert/strict";
import { test } from "node:test";
import { homeSectionKeys, type StorefrontContent } from "@shopmaple/contracts";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { sectionSignature, thumbnailContent } from "../lib/section-thumbnails";

const base = (): StorefrontContent => structuredClone(defaultStorefrontContent);
/** The sections whose thumbnail must reload after this edit. */
function changed(edit: (content: StorefrontContent) => void) {
  const before = base();
  const after = base();
  edit(after);
  return homeSectionKeys.filter((key) => sectionSignature(before, key) !== sectionSignature(after, key));
}

test("a thumbnail renders only its own section, even a hidden one, with motion and reveal effects off", () => {
  const content = base();
  content.homeSections = content.homeSections.map((section) => section.key === "nimbus" ? { ...section, enabled: false } : section);
  content.motion = { autoplaySocial: true, autoplayCities: true, autoplayTicker: true, revealSections: true };
  const thumb = thumbnailContent(content, "nimbus");
  assert.deepEqual(thumb.homeSections, [{ key: "nimbus", enabled: true }]);
  assert.deepEqual(thumb.motion, { autoplaySocial: false, autoplayCities: false, autoplayTicker: false, revealSections: false });
  assert.equal(thumb.homeCopy, content.homeCopy, "everything else is the draft as it is");
  assert.equal(content.homeSections.length, 20, "the draft itself is untouched");
  assert.equal(content.motion.revealSections, true);
});

test("an edit reloads only the thumbnails of the sections it changes", () => {
  assert.deepEqual(changed((c) => { c.homeCopy.categoryHeading = "Shop by room"; }), ["categories"]);
  assert.deepEqual(changed((c) => { c.homeCopy.ticker = "Made in Jodhpur"; }), ["ticker"]);
  assert.deepEqual(changed((c) => { c.homeCopy.testimonialHeading = "Kind words"; }), ["testimonial"]);
  assert.deepEqual(changed((c) => { c.homeCopy.socialHeading = "On Instagram"; }), ["instagram"]);
  assert.deepEqual(changed((c) => { c.instagramPosts = c.instagramPosts.slice(1); }), ["instagram"]);
  assert.deepEqual(changed((c) => { c.homeCitiesLayout = []; }), ["cities"]);
  assert.deepEqual(changed((c) => { c.homeDetails!.project = { ...c.homeDetails!.project, heading: "Our projects" }; }), ["project"]);
  assert.deepEqual(changed((c) => { c.homeMerchandising = { ...c.homeMerchandising!, chairs: [] }; }), ["chairs"]);
});

test("the editorial and compare thumbnails reload only for their own content", () => {
  assert.deepEqual(changed((c) => { c.homeDetails!.editorial = { ...c.homeDetails!.editorial!, title: "Pull up two chairs" }; }), ["editorial"]);
  assert.deepEqual(changed((c) => { c.homeDetails!.editorial = { ...c.homeDetails!.editorial!, rightImage: "/media/home/editorial-left.webp" }; }), ["editorial"]);
  assert.deepEqual(changed((c) => { c.homeDetails!.compare = { ...c.homeDetails!.compare!, heading: "Two ways to rest" }; }), ["compare"]);
  assert.deepEqual(changed((c) => { c.homeDetails!.compare = { ...c.homeDetails!.compare!, right: { handle: "aera-swivel-lounge-chair", label: "Aera" } }; }), ["compare"]);
  assert.deepEqual(changed((c) => { c.homeDetails!.cities.heading = "30+ Cities"; }), ["cities"], "neighbouring copy does not touch them");
});

test("product highlights reload the thumbnails of the sections that show product cards", () => {
  const highlights = { swatches: [{ name: "Deep Atlantic", hex: "#1f4e5f" }], products: [{ handle: "caro", isNew: true, rating: { value: 4.6, count: 12 } }] };
  assert.deepEqual(changed((c) => { c.productHighlights = highlights; }), ["bestsellers", "chairs"]);
  const edited = (c: StorefrontContent) => { c.productHighlights = highlights; };
  const before = base(); edited(before);
  const after = base(); after.productHighlights = { ...highlights, products: [{ ...highlights.products[0]!, isNew: false }] };
  assert.deepEqual(homeSectionKeys.filter((key) => sectionSignature(before, key) !== sectionSignature(after, key)), ["bestsellers", "chairs"]);
});

test("a campaign edit reloads the banners that show that campaign", () => {
  const announcement = (c: StorefrontContent) => { c.campaigns = [...c.campaigns.filter((item) => item.key !== "landing-announcement"), { ...c.campaigns.find((item) => item.key === "landing-dining")!, key: "landing-announcement" }]; };
  assert.deepEqual(changed(announcement), ["announcement"]);
  const storage = (c: StorefrontContent) => { c.campaigns = c.campaigns.filter((item) => item.key !== "landing-storage"); };
  assert.deepEqual(changed(storage), ["promos"]);
});

test("reordering, hiding and navigation edits reload no thumbnail", () => {
  assert.deepEqual(changed((c) => { c.homeSections = [...c.homeSections].reverse(); }), []);
  assert.deepEqual(changed((c) => { c.homeSections = c.homeSections.map((section) => ({ ...section, enabled: false })); }), []);
  assert.deepEqual(changed((c) => { c.motion.revealSections = !c.motion.revealSections; }), []);
  assert.deepEqual(changed((c) => { c.motion.autoplayCities = false; c.motion.autoplaySocial = false; }), [], "thumbnails never move, so autoplay never changes them");
  assert.deepEqual(changed((c) => { c.pages = []; }), []);
});
