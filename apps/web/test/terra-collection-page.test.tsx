import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToReadableStream } from "react-dom/server";
import { JSDOM } from "jsdom";
import {
  collectionLandingContentSchema, contentLinkSchema, contentPageSchema, storefrontContentSchema, type CollectionLandingContent,
} from "@shopmaple/contracts";
import navigation from "../data/navigation.json";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { defaultHomeDetails } from "../lib/home-details-defaults";
import { seoSettings, sitemapEntries } from "../lib/seo";
import { listPreviewPages, renderStorefrontRoute } from "../lib/storefront-routes";
import { defaultSiteChrome } from "../lib/site-chrome-defaults";
import { templateMediaSlots } from "../lib/template-media-defaults";
import { defaultTerraPage, resolveTerraLanding, terraEnquiryHref } from "../lib/terra-content-defaults";

// The Terra Collection (Figma 311:921 "Maple / Terra Collection / Desktop"; owner, 10 Nov 2026), drawn by the shared
// collection template between the store's own header and footer, at /terra-collection.
const web = fileURLToPath(new URL("..", import.meta.url));
const flat = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
const published = (terraPage?: CollectionLandingContent, extra: Record<string, unknown> = {}) =>
  ({ version: 3, content: { ...structuredClone(defaultStorefrontContent), ...(terraPage ? { terraPage } : {}), ...extra } });

async function withResponse(body: unknown, run: () => Promise<void>) {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    // Terra's edit is made of concepts to discuss, so the page reads no catalogue: only the published content.
    assert.ok(String(input).endsWith("/api/content/storefront"), `Unexpected request to ${String(input)}`);
    return body === null ? Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 }) : Response.json(body);
  };
  try { await run(); } finally { globalThis.fetch = previous; }
}
const route = () => import("../app/terra-collection/page");
async function renderPage() {
  return new JSDOM(await new Response(await renderToReadableStream(await (await route()).default())).text()).window.document;
}
const links = (doc: Document, words: string) => [...doc.querySelectorAll("a")].filter(link => flat(link.textContent).includes(words));
const productOf = (href: string | null) => new URL(href ?? "", "https://maple.invalid").searchParams.get("product");

/** A WebP's pixel size from its header (lossy, lossless or extended). */
function webpSize(path: string) {
  const bytes = readFileSync(path);
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF", path);
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP", path);
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8 ") return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  assert.equal(chunk, "VP8X", path);
  return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
}

test("the contract keeps Terra's copy optional, validates the frame's words and reserves its address", () => {
  const legacy = structuredClone(defaultStorefrontContent);
  assert.equal("terraPage" in legacy, false, "documents saved before Terra stay valid without it");
  assert.equal(storefrontContentSchema.safeParse(legacy).success, true);
  assert.equal(collectionLandingContentSchema.safeParse(defaultTerraPage).success, true);
  assert.equal(storefrontContentSchema.safeParse({ ...legacy, terraPage: defaultTerraPage }).success, true);
  const broken = (patch: (page: any) => void) => {
    const page = structuredClone(defaultTerraPage) as any;
    patch(page);
    return storefrontContentSchema.safeParse({ ...legacy, terraPage: page }).success;
  };
  assert.equal(broken(page => { page.hero.heading = "   "; }), false, "no blank heading");
  assert.equal(broken(page => { page.roomNav.pop(); }), false, "three room links");
  assert.equal(broken(page => { page.rooms.items[0].tags = "a\u0007b"; }), false, "no control characters");
  assert.equal(broken(page => { page.material.href = "/collections/beds"; }), false, "links stay with the page, not the copy");
  assert.equal(broken(page => { page.sections.push({ key: "hero", enabled: false }); }), false, "each section once");
  const page = { slug: "terra-collection", title: "Terra", description: "", body: "", banner: null };
  assert.equal(contentPageSchema.safeParse(page).success, false, "a staff page cannot take Terra's address");
});

test("the frame's words, sections and links resolve for the template", () => {
  const terra = resolveTerraLanding(defaultStorefrontContent);
  assert.equal(terra.key, "terra");
  assert.equal(terra.title, "The Terra Collection");
  assert.deepEqual(terra.sections, ["hero", "room-nav", "philosophy", "origin", "rooms", "feeling", "material", "browse", "pieces", "consultation", "promise"]);
  assert.equal(terra.hero.heading, "Grounded in earth.\nMade for belonging.");
  assert.equal(terra.hero.cta.label, "Explore Terra");
  assert.equal(terra.hero.film, undefined, "Terra has no collection film");
  // The room navigation jumps to the three settings below it.
  assert.deepEqual(terra.roomNav.map(link => [link.label, link.href]), [["The lobby", "#terra-lobby"], ["The bedroom", "#terra-bedroom"], ["The terrace", "#terra-terrace"]]);
  assert.deepEqual(terra.rooms!.items.map(room => room.id), ["terra-lobby", "terra-bedroom", "terra-terrace"]);
  assert.ok(terra.roomNav.every(link => terra.rooms!.items.some(room => `#${room.id}` === link.href)));
  assert.equal(terra.hero.cta.href, "#terra-rooms", "the hero's button glides to the settings");
  assert.deepEqual(terra.rooms!.items.map(room => room.tags), [
    ["Curved seating", "Walnut", "Travertine"], ["Leather bed", "Linen", "Sculpted timber"], ["Woven frames", "Olive tones", "Open air"],
  ]);
  // Each setting and concept is enquired about on the contact form, with a bounded subject the form shows.
  assert.deepEqual(terra.rooms!.items.map(room => [room.cta.label, room.cta.href]), [
    ["Enquire about this setting", "/contact?product=The+Terra+Collection%3A+The+lobby#contact-enquiry"],
    ["Enquire about this setting", "/contact?product=The+Terra+Collection%3A+The+bedroom#contact-enquiry"],
    ["Enquire about this setting", "/contact?product=The+Terra+Collection%3A+The+terrace#contact-enquiry"],
  ]);
  assert.equal(terra.pieces.mode, "concepts");
  assert.equal(terra.pieces.lead, "Terra-inspired furniture concepts. Made to your brief.");
  assert.equal(terra.pieces.linkLabel, "Discuss this piece");
  assert.deepEqual(terra.pieces.items.map(piece => [piece.title, piece.line, productOf(piece.href)]), [
    ["Curved lounge sofa", "Lobby / Upholstered seating", "The Terra Collection: Curved lounge sofa"],
    ["Timber-ring lounge chair", "Lobby / Accent seating", "The Terra Collection: Timber-ring lounge chair"],
    ["Low leather bed", "Bedroom / Bed concept", "The Terra Collection: Low leather bed"],
    ["Woven terrace chair", "Outdoor / Lounge seating", "The Terra Collection: Woven terrace chair"],
  ]);
  assert.equal(terraEnquiryHref("x".repeat(900)).length < 260, true, "a subject stays bounded");
  // Collection cards open the store's own pages from its menu, never a guessed handle.
  const menu = new Set(navigation.flatMap(item => [item.href, ...item.columns.flatMap(column => column.links.map(link => link.href))]));
  assert.deepEqual(terra.browse.items.map(item => [item.title, item.href]), [
    ["Lounge seating", "/sofas"], ["Bedroom", "/collections/beds"], ["Tables", "/tables"], ["Outdoor", "/collections/outdoor-furnitures"],
  ]);
  for (const item of terra.browse.items) {
    assert.ok(menu.has(item.href), `${item.href} is in the store's menu`);
    assert.equal(contentLinkSchema.safeParse(item.href).success, true, item.href);
  }
  assert.deepEqual(terra.browse.items.map(item => item.icon), ["armchair", "bed-double", "table-2", "tree-pine"]);
  assert.deepEqual(terra.feeling.items.map(item => [item.icon, item.title]), [["mountain", "Grounded"], ["hand", "Tactile"], ["leaf", "Connected"]]);
  assert.deepEqual(terra.material.notes.map(note => [note.icon, note.label]), [["tree-pine", "Natural timber"], ["layers", "Tactile weave"], ["mountain", "Warm stone"]]);
  assert.deepEqual([terra.material.cta.label, terra.material.cta.href], ["Explore customization", "/contact?product=Terra+customization#contact-enquiry"]);
  assert.deepEqual([terra.consultation.cta.label, terra.consultation.cta.href], ["Start a conversation", "/contact?product=The+Terra+Collection#contact-enquiry"]);
  assert.ok(terra.pieces.items.every(piece => piece.href.startsWith("/contact?product=") && piece.href.endsWith("#contact-enquiry")));
  assert.deepEqual(terra.promise.map(item => [item.icon, item.label]), [["ruler", "Made around you"], ["hammer", "Crafted in Delhi"], ["truck", "Delivery across India"]]);
});

test("contact details come from the footer settings and photos from Terra's artwork slots", () => {
  const terra = resolveTerraLanding(defaultStorefrontContent);
  assert.equal(terra.consultation.email, defaultSiteChrome.footer.customerEmail);
  const chrome = structuredClone(defaultSiteChrome);
  chrome.footer.customerEmail = "studio@example.com";
  assert.equal(resolveTerraLanding({ ...defaultStorefrontContent, siteChrome: chrome }).consultation.email, "studio@example.com");
  assert.equal(terra.hero.media.src, "/media/terra-collection/hero.webp");
  assert.equal(terra.hero.media.mobileSrc, "/media/terra-collection/hero-mobile.webp", "a portrait crop for phones");
  assert.match(terra.hero.media.alt, /olive sofa/);
  assert.deepEqual(terra.rooms!.items.map(room => room.media.src), ["/media/terra-collection/room-lobby.webp", "/media/terra-collection/room-bedroom.webp", "/media/terra-collection/room-terrace.webp"]);
  const upload = `/media/uploads/${"c".repeat(64)}.webp`;
  const swapped = resolveTerraLanding({ ...defaultStorefrontContent, templateMedia: [{ key: "terra-browse-2", image: upload, alt: "A walnut bed" }] });
  assert.deepEqual(swapped.browse.items[1]!.media, { src: upload, alt: "A walnut bed" });
  assert.equal(swapped.browse.items[0]!.media.src, "/media/terra-collection/browse-lounge.webp");
});

test("staff words replace the frame's, and hidden regions leave the page", () => {
  const page = structuredClone(defaultTerraPage);
  page.title = "Terra";
  page.rooms!.items[1]!.label = "The suite";
  page.rooms!.items[1]!.tags = " Oak /  Linen/ ";
  page.pieces.items[0]!.title = "Arc sofa";
  page.sections = page.sections.map(section => section.key === "promise" ? { ...section, enabled: false } : section);
  page.sections.unshift(page.sections.splice(page.sections.findIndex(section => section.key === "pieces"), 1)[0]!);
  const terra = resolveTerraLanding({ ...defaultStorefrontContent, terraPage: page });
  assert.equal(terra.title, "Terra");
  assert.equal(terra.sections[0], "pieces");
  assert.ok(!terra.sections.includes("promise"));
  assert.deepEqual(terra.rooms!.items[1]!.tags, ["Oak", "Linen"]);
  assert.equal(productOf(terra.rooms!.items[1]!.cta.href), "Terra: The suite");
  assert.equal(productOf(terra.pieces.items[0]!.href), "Terra: Arc sofa");
  assert.equal(resolveTerraLanding({ ...defaultStorefrontContent, terraPage: page }).roomNav[1]!.href, "#terra-bedroom", "anchors stay with the page");
});

test("Terra's fourteen photos are WebP files in the project, large enough to stay sharp at 1920 and 125% zoom", () => {
  const slots = templateMediaSlots.filter(slot => slot.key.startsWith("terra-"));
  assert.deepEqual(slots.map(slot => slot.key), [
    "terra-hero", "terra-origin", "terra-room-1", "terra-room-2", "terra-room-3", "terra-detail",
    "terra-browse-1", "terra-browse-2", "terra-browse-3", "terra-browse-4", "terra-piece-1", "terra-piece-2", "terra-piece-3", "terra-piece-4",
  ]);
  assert.ok(slots.every(slot => slot.group === "Terra" && slot.alt.trim().length > 0 && slot.image.startsWith("/media/terra-collection/")));
  // About 1.5x the largest frame each is drawn in at 1920 wide (a 760-wide frame at 1440 is ~1013 CSS px there).
  const least: Record<string, [number, number]> = {
    // The origin and detail frames are about 800px wide at 1920.
    "terra-hero": [2560, 1440], "terra-origin": [1500, 1500], "terra-detail": [1500, 1500],
    "terra-room-1": [1600, 900], "terra-room-2": [1600, 900], "terra-room-3": [1600, 900],
    // The narrow cards are about 651px at 1920: 1024 is already 1.57 times that.
    "terra-browse-1": [2048, 1152], "terra-browse-4": [2048, 1152], "terra-browse-2": [1000, 1000], "terra-browse-3": [1000, 1000],
    "terra-piece-1": [1024, 1024], "terra-piece-2": [1024, 1024], "terra-piece-3": [1024, 1024], "terra-piece-4": [1024, 1024],
  };
  for (const slot of slots) {
    const file = `${web}public${slot.image}`;
    assert.ok(existsSync(file), slot.image);
    const { width, height } = webpSize(file);
    const [minWidth, minHeight] = least[slot.key]!;
    assert.ok(width >= minWidth && height >= minHeight, `${slot.image} is ${width}x${height}, wants ${minWidth}x${minHeight}`);
  }
  // The opening's phone crop: portrait (the phone's opening is about 9:16), about 2.5 file pixels per point on a 390pt phone.
  const phone = slots.find(slot => slot.key === "terra-hero")!.mobileImage!;
  const { width, height } = webpSize(`${web}public${phone}`);
  assert.ok(width >= 960 && height > width * 1.6, `${phone} is ${width}x${height}`);
  assert.match(readFileSync(`${web}public/media/PROVENANCE.md`, "utf8"), /## Terra Collection[\s\S]*terra-collection\/hero\.webp/);
});

test("/terra-collection renders the frame through the collection template, with its links and the footer's email", async () => {
  assert.ok(existsSync(`${web}app/terra-collection/page.tsx`), "served at its short address");
  await withResponse(null, async () => {
    const doc = await renderPage();
    const root = doc.querySelector('[data-collection="terra"]');
    assert.ok(root, "the shared template, keyed to Terra");
    const regions = [...root.querySelectorAll("[data-collection-section]")].map(node => node.getAttribute("data-collection-section"));
    assert.deepEqual(regions, ["hero", "room-nav", "philosophy", "origin", "rooms", "feeling", "material", "browse", "pieces", "consultation", "promise"]);
    const region = (key: string) => root.querySelector<HTMLElement>(`[data-collection-section="${key}"]`)!;
    assert.equal(doc.querySelectorAll("h1").length, 1);
    assert.equal(region("hero").querySelector("h1")?.textContent, "Grounded in earth.\nMade for belonging.");
    for (const words of ["A world shaped by earth.", "From the earth, into everyday life.", "Three spaces. One grounded spirit.", "An arrival worth remembering.",
      "Rest, close to the earth.", "Made for long afternoons.", "Grounded. Warm. Connected.", "Honest texture. Lasting character.", "Explore by collection.",
      "Bring the room together.", "Bring the feeling of Terra to your space.", "Delivery across India"])
      assert.ok(flat(root.textContent).includes(words), words);
    // "Explore Terra" glides to the settings, and the room navigation's anchors land on each of them.
    assert.equal(region("hero").querySelector("a[data-collection-cta]")?.getAttribute("href"), "#terra-rooms");
    assert.equal(doc.getElementById("terra-rooms"), region("rooms"));
    assert.deepEqual([...region("room-nav").querySelectorAll("a")].map(link => link.getAttribute("href")), ["#terra-lobby", "#terra-bedroom", "#terra-terrace"]);
    for (const id of ["terra-lobby", "terra-bedroom", "terra-terrace"]) assert.ok(region("rooms").querySelector(`[id="${id}"]`), `#${id} is a setting`);
    assert.deepEqual(links(doc, "Enquire about this setting").map(link => productOf(link.getAttribute("href"))),
      ["The Terra Collection: The lobby", "The Terra Collection: The bedroom", "The Terra Collection: The terrace"]);
    assert.equal(region("pieces").getAttribute("data-mode"), "concepts");
    const concepts = [...region("pieces").querySelectorAll("[data-collection-piece]")];
    assert.deepEqual(concepts.map(card => flat(card.querySelector("[data-collection-link]")?.textContent)), Array(4).fill("Discuss this piece →"));
    assert.deepEqual(concepts.map(card => productOf(card.querySelector("h3 a")?.getAttribute("href") ?? null)), [
      "The Terra Collection: Curved lounge sofa", "The Terra Collection: Timber-ring lounge chair",
      "The Terra Collection: Low leather bed", "The Terra Collection: Woven terrace chair",
    ]);
    // On a phone the opening switches to its portrait crop.
    assert.match(region("hero").querySelector('picture source[media="(max-width: 749px)"]')?.getAttribute("srcset") ?? "", /terra-collection\/hero-mobile\.webp/);
    assert.deepEqual([...region("browse").querySelectorAll("h3 a")].map(link => link.getAttribute("href")),
      ["/sofas", "/collections/beds", "/tables", "/collections/outdoor-furnitures"]);
    assert.equal(region("consultation").querySelector('a[href^="mailto:"]')?.getAttribute("href"), "mailto:contact@maplefurnishers.com");
    // The frame's own footer numbers are stale; the page shows none of its own.
    assert.doesNotMatch(root.textContent ?? "", /9211819727|8796130252|aayushi@/);
    assert.equal(doc.querySelector('a[href^="/pages/"], a[href*="/products/"]'), null, "short addresses, and no product pages for concepts");
    const photos = [...root.querySelectorAll("img")].filter(img => img.getAttribute("src")?.startsWith("/media/terra-collection/"));
    assert.equal(new Set(photos.map(img => img.getAttribute("src"))).size, 14, "all fourteen photos");
    assert.ok(photos.every(img => (img.getAttribute("alt") ?? "").length > 0), "every photo is described");
  });
});

// On a phone the collection cards' frames are 4:3 while their photos are 16:9, so a photo covers its frame at about 1.33×
// the card's width. The browser must be told so, or a 3× phone loads a file a third too small (soft).
test("on a phone the collection cards ask for photos wide enough for their 4:3 crop", async () => {
  await withResponse(null, async () => {
    const doc = await renderPage();
    const cards = [...doc.querySelectorAll('[data-collection-section="browse"] [data-collection-card] img')];
    assert.equal(cards.length, 4);
    for (const image of cards) assert.equal(image.getAttribute("sizes"), "(max-width: 699px) calc((100vw - 40px) * 1.34), 53vw");
  });
});

test("the page title, description and canonical address come from Terra's own copy", async () => {
  await withResponse(published({ ...structuredClone(defaultTerraPage), title: "Terra by Maple" }), async () => {
    const meta = await (await route()).generateMetadata();
    assert.equal(meta.title, "Terra by Maple");
    assert.equal(meta.description, "Warm materials. Sculptural forms. Spaces that bring you closer to nature.");
    assert.deepEqual(meta.alternates, { canonical: "/terra-collection" });
    assert.equal(flat((await renderPage()).querySelector("h1")?.textContent), "Grounded in earth. Made for belonging.");
  });
});

test("staff preview the Terra page from a draft, the sitemap lists it and the home page's Terra slide opens it", () => {
  const draft = { ...structuredClone(defaultStorefrontContent), terraPage: { ...structuredClone(defaultTerraPage), title: "Terra draft" } };
  const route = renderStorefrontRoute(["pages", "terra-collection"], draft);
  assert.equal(route?.title, "Terra draft");
  assert.equal(route?.path, "/terra-collection");
  assert.ok(listPreviewPages(draft).some(item => item.label === "Terra Collection" && item.segments.join("/") === "pages/terra-collection"));
  const site = seoSettings({ SITE_URL: "https://shop.example.com" });
  const urls = sitemapEntries(site, { products: [], pages: [], policies: [], articles: [] }).map(entry => entry.url);
  assert.ok(urls.includes("https://shop.example.com/terra-collection"));
  const slide = defaultHomeDetails.nimbus.slides!.find(item => item.heading === "The Terra Collection")!;
  assert.equal(slide.href, "/terra-collection");
});
