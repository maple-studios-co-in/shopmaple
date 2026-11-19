import assert from "node:assert/strict";
import { test } from "node:test";
import { storefrontContentSchema, templateMediaDecorativeKeys, type StorefrontContent, type TemplateMediaItem } from "@shopmaple/contracts";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { describeContentIssue, previewReadyContent } from "../lib/draft-pictures";
import { campaignPreviewPath } from "../lib/live-preview";

// Owner, 17 Nov 2026: a new banner (desktop, phone and a description) never showed in the live preview. The preview's
// quiet save has to pass the draft's whole check, and one picture half-chosen anywhere failed it, so the preview saved
// nothing at all: a banner clicked in the preview got an empty replacement at once, a replacement needed both sizes and
// a description first, and a new post, slide or page held every other change back until all its fields were filled.
// The preview's save now completes a half-chosen picture with stand-ins and leaves out what cannot show yet, in its own
// copy; the form and an explicit save keep every rule.

const upload = (letter: string) => `/media/uploads/${letter.repeat(64)}.webp`;
const fresh = (): StorefrontContent => structuredClone(defaultStorefrontContent);
const valid = (content: StorefrontContent) => storefrontContentSchema.safeParse(content).success;
const campaign = (content: StorefrontContent, key: string) => content.campaigns.find((item) => item.key === key)!;
const withArtwork = (content: StorefrontContent, key: string, artwork: StorefrontContent["campaigns"][number]["artwork"]) =>
  ({ ...content, campaigns: content.campaigns.map((item) => item.key === key ? { ...item, artwork } : item) });

test("a draft with nothing unfinished goes to the preview exactly as it is", () => {
  const content = fresh();
  assert.ok(valid(content));
  const ready = previewReadyContent(content);
  assert.equal(ready.content, content, "the same document: nothing copied, nothing changed");
  assert.deepEqual([ready.leftOut, ready.standIns], [[], []]);
});

test("a banner clicked in the preview holds nothing back, and its first chosen picture shows at once at both sizes", () => {
  // What "Replace campaign artwork" adds, also when the banner is clicked in the preview: no pictures yet.
  const replacing = withArtwork(fresh(), "sofas-hero", { desktopImage: "", mobileImage: "", alt: "Settle in for the celebrations." });
  assert.equal(valid(replacing), false, "as it stands the draft fails its check: before, the preview saved nothing at all");
  const elsewhere = { ...replacing, homeCopy: { ...replacing.homeCopy, ticker: "Edited elsewhere" } };
  const waiting = previewReadyContent(elsewhere);
  assert.ok(valid(waiting.content), "the preview's save goes through");
  assert.equal(campaign(waiting.content, "sofas-hero").artwork, null, "the original banner shows until a picture is chosen");
  assert.equal(waiting.content.homeCopy.ticker, "Edited elsewhere", "and the other change shows");
  assert.deepEqual(waiting.leftOut, ["Campaign “Sofas hero” banner"]);

  const desktop = withArtwork(replacing, "sofas-hero", { desktopImage: upload("a"), mobileImage: "", alt: "" });
  const shown = previewReadyContent(desktop);
  assert.deepEqual(campaign(shown.content, "sofas-hero").artwork, { desktopImage: upload("a"), mobileImage: upload("a"), alt: "Settle in for the celebrations." },
    "the chosen picture shows at both sizes, described by the banner's own words");
  assert.ok(valid(shown.content));
  assert.deepEqual(shown.standIns, ["Campaign “Sofas hero” banner: phone picture", "Campaign “Sofas hero” banner: description"]);
  assert.deepEqual(campaign(desktop, "sofas-hero").artwork, { desktopImage: upload("a"), mobileImage: "", alt: "" }, "the form itself is left as staff set it");
  assert.equal(valid(desktop), false, "so an explicit save still asks for the phone picture and a description");

  const finished = withArtwork(replacing, "sofas-hero", { desktopImage: upload("a"), mobileImage: upload("b"), alt: "A cream sofa by the window" });
  const done = previewReadyContent(finished);
  assert.equal(done.content, finished, "a finished banner goes as it is");
  assert.deepEqual([done.leftOut, done.standIns], [[], []]);
});

test("an address that is not a library picture never shows: the original stays, and the preview says so", () => {
  const content = withArtwork(fresh(), "beds-hero", { desktopImage: "https://tracker.example/track.png", mobileImage: upload("c"), alt: "Bed" });
  const ready = previewReadyContent(content);
  assert.equal(campaign(ready.content, "beds-hero").artwork, null);
  assert.deepEqual(ready.leftOut, ["Campaign “Beds hero” banner"]);
  assert.ok(valid(ready.content));
});

test("artwork placements and icons: one size stands in for the other, an emptied placement shows its original, a decorative icon needs no words", () => {
  const icon = templateMediaDecorativeKeys.find((key) => key.startsWith("icon")) ?? templateMediaDecorativeKeys.at(-1)!;
  const content: StorefrontContent = {
    ...fresh(),
    templateMedia: [
      { key: "nimbus-hero-poster", image: upload("e"), alt: "" } as TemplateMediaItem,
      { key: "home-newsletter", image: "", alt: "" },
      { key: icon, image: upload("f"), alt: "" },
    ],
  };
  assert.equal(valid(content), false);
  const ready = previewReadyContent(content);
  const media = ready.content.templateMedia!;
  assert.deepEqual(media.map((item) => item.key), ["nimbus-hero-poster", icon]);
  assert.equal(media[0]!.mobileImage, upload("e"));
  assert.match(media[0]!.alt, /cream sofa/, "the placement's own description stands in");
  assert.equal(media[1]!.alt, "", "a decorative icon may stay without words");
  assert.ok(valid(ready.content));
  assert.deepEqual(ready.leftOut, ["Artwork “Newsletter image”"]);
  assert.deepEqual(ready.standIns, ["Artwork “Opening photo”: phone picture", "Artwork “Opening photo”: description"]);
});

test("an unfinished post, slide, tile or page is left out of the preview and named; the rest of the draft shows", () => {
  const base = fresh();
  const tile = (key: string, image: string) => ({ key, title: "Chairs", collectionHandle: "chairs", image, alt: "", enabled: true });
  const content: StorefrontContent = {
    ...base,
    instagramPosts: [...base.instagramPosts, { href: "", src: "", alt: "" }],
    pages: [{ slug: "", title: "", description: "", body: "", banner: null }],
    homeMerchandising: { bestsellers: [], chairs: [], categories: [tile("chairs", upload("g")), tile("new-tile", "")], offers: [] },
    homeDetails: { ...base.homeDetails!, hero: { ...base.homeDetails!.hero, slides: [{ kind: "image", src: "", alt: "", headline: "", intro: "", button: { label: "", href: "/sofas" } }] } },
  };
  const ready = previewReadyContent(content);
  assert.ok(valid(ready.content), "the rest of the draft is saved for the preview");
  assert.deepEqual(ready.leftOut, ["Page “1”", `Instagram post ${content.instagramPosts.length}`, "Merchandising, category tile 2", "Homepage hero slide 1 button"]);
  assert.deepEqual(ready.standIns, ["Merchandising, category tile 1: description"]);
  assert.equal(ready.content.instagramPosts.length, base.instagramPosts.length);
  assert.equal(ready.content.homeMerchandising!.categories[0]!.alt, "Chairs", "a finished tile is described by its title meanwhile");
  assert.deepEqual(ready.content.homeDetails!.hero.slides, [{ kind: "image", button: null }],
    "a slide still being written shows Maple's photo for its place, without its unfinished button (owner, 19 Nov 2026)");
  const issue = storefrontContentSchema.safeParse(content).error?.issues[0];
  assert.match(describeContentIssue(issue, content), /^Check (Page “1”|Instagram post \d|Merchandising, category tile \d|Homepage hero)/, "an explicit save says what to finish");
});

// Owner, 19 Nov 2026: the slider keeps the number of slides chosen while each one is being finished.
test("a hero slide being finished keeps its place: a video waiting for its film shows Maple's photo, an unfinished button is hidden", () => {
  const base = fresh();
  const film = "/media/uploads/" + "f".repeat(64) + ".mp4";
  const slides = [
    { kind: "video", headline: "Coming soon", poster: upload("c") },
    { kind: "image", src: upload("b"), headline: "Sale", button: { label: "", href: "/sofas" } },
    { kind: "image", src: "https://example.com/a.jpg", mobileImage: upload("d"), headline: "", alt: "" },
    { kind: "video", src: film, poster: upload("c"), headline: "Ready", button: { label: "Watch", href: "/our-story" } },
  ] as NonNullable<NonNullable<StorefrontContent["homeDetails"]>["hero"]["slides"]>;
  const content: StorefrontContent = { ...base, homeDetails: { ...base.homeDetails!, hero: { ...base.homeDetails!.hero, slides } } };
  const ready = previewReadyContent(content);
  assert.ok(valid(ready.content));
  assert.deepEqual(ready.content.homeDetails!.hero.slides, [
    { kind: "image", headline: "Coming soon" },
    { kind: "image", src: upload("b"), headline: "Sale", button: null },
    { kind: "image" },
    slides[3],
  ]);
  assert.deepEqual(ready.standIns, ["Homepage hero slide 1: film", "Homepage hero slide 3: picture"]);
  assert.deepEqual(ready.leftOut, ["Homepage hero slide 2 button"]);
  assert.equal(content.homeDetails!.hero.slides![0]!.kind, "video", "the form keeps what staff entered");
});

test("a page banner whose link is still being typed is left out before its page is", () => {
  const content: StorefrontContent = { ...fresh(), pages: [{ slug: "about", title: "About us", description: "", body: "", banner: { desktopImage: upload("h"), mobileImage: upload("h"), alt: "Our workshop", href: "https://", label: "Explore" } }] };
  const ready = previewReadyContent(content);
  assert.equal(ready.content.pages[0]!.title, "About us");
  assert.equal(ready.content.pages[0]!.banner, null);
  assert.deepEqual(ready.leftOut, ["Page “About us” banner"]);
});

test("a failed check names the screen, the item and the field in words staff know", () => {
  const content = fresh();
  const undescribed = withArtwork(content, "sofas-hero", { desktopImage: upload("a"), mobileImage: upload("a"), alt: "" });
  assert.equal(describeContentIssue(storefrontContentSchema.safeParse(undescribed).error?.issues[0], undescribed),
    "Check Campaign “Sofas hero”, artwork picture description: it is empty.");
  const untitled = { ...content, pages: [{ slug: "about", title: "", description: "", body: "", banner: null }] };
  assert.equal(describeContentIssue(storefrontContentSchema.safeParse(untitled).error?.issues[0], untitled), "Check Page “about”, title: it is empty.");
  const outside = { ...content, instagramPosts: [{ ...content.instagramPosts[0]!, src: "https://example.com/a.jpg" }, ...content.instagramPosts.slice(1)] };
  assert.equal(describeContentIssue(storefrontContentSchema.safeParse(outside).error?.issues[0], outside),
    "Check Instagram post 1, picture: use an approved image from the media library.");
});

test("Campaigns previews the page each campaign is on", () => {
  assert.equal(campaignPreviewPath("sofas-hero"), "pages/sofas");
  assert.equal(campaignPreviewPath("chairs-sale"), "pages/chairs");
  assert.equal(campaignPreviewPath("beds-sale"), "collections/beds");
  assert.equal(campaignPreviewPath("tv-units-hero"), "collections/tv-media-units");
  assert.equal(campaignPreviewPath("outdoors-hero"), "collections/outdoor-furnitures");
  assert.equal(campaignPreviewPath("landing-dining"), "home");
  assert.equal(campaignPreviewPath(null), "home");
});
