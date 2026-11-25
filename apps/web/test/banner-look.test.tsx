import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import {
  bannerFonts, bannerLookOf, campaignContentSchema, contentPageSchema, heroCaptionSchema, storefrontContentSchema, templateMediaItemSchema,
  type BannerLook, type StorefrontContent,
} from "@shopmaple/contracts";
import { CampaignBanner, type CampaignKey } from "../components/campaign-banner";
import { CollectionBanner } from "../components/store/collection-banner";
import { ContentPage } from "../components/content-page";
import { collectionIntro, heroTitle } from "../lib/collection-intro";
import { defaultStorefrontContent } from "../lib/content-defaults";

// Owner, 25 Nov 2026: "in admin in all banners ... the red gradient and the text and cta are coming as compulsory so if
// anybody tries to upload the banner with already a color and text then the cta does not remove completely it leaves as a
// line and the gradient is also not removing therefore what I want is gradient, texts, cta all should be completely
// editable ... also add an option to change the font style of the text".

const fresh = () => structuredClone(defaultStorefrontContent) as StorefrontContent;
const look = (patch: Partial<BannerLook>): BannerLook => ({ ...bannerLookOf(), ...patch });
async function drawCampaign(campaign: CampaignKey, edit: (value: StorefrontContent["campaigns"][number]) => void) {
  const content = fresh();
  edit(content.campaigns.find((item) => item.key === campaign)!);
  const stream = await renderToReadableStream(await CampaignBanner({ campaign, content: { ...content, version: 3, campaignsAvailable: true } as never }));
  return new JSDOM(await new Response(stream).text()).window.document;
}

test("a banner's look is part of the content: words and button on or off, shade, words' colour, size and type style", () => {
  const campaign = fresh().campaigns.find((item) => item.key === "landing-dining-table")!;
  assert.ok(campaignContentSchema.safeParse({ ...campaign, look: look({ words: false, button: false, shade: "none", font: "serif-italic" }) }).success);
  assert.ok(campaignContentSchema.safeParse(campaign).success, "a campaign saved before looks stays valid");
  for (const wrong of [{ font: "comic" }, { shade: "red" }, { words: "no" }, { extra: true }])
    assert.equal(campaignContentSchema.safeParse({ ...campaign, look: { ...look({}), ...wrong } }).success, false, JSON.stringify(wrong));
  assert.deepEqual(bannerLookOf(), { words: true, button: true, shade: "strong", tone: "light", size: "medium", font: "modern" }, "the theme's own look");
  assert.equal(bannerFonts.length, 7);
  // The hero's slides take the same type styles; captions saved before stay valid.
  assert.ok(heroCaptionSchema.safeParse({ position: "left", tone: "light", shade: "strong", size: "medium", font: "capitals" }).success);
  assert.ok(heroCaptionSchema.safeParse({ position: "left", tone: "light", shade: "strong", size: "medium" }).success);
  // A collection page's banner takes a look for its words over a photo; no other placement does.
  const item = { key: "collection-hero-sofas", image: "/media/uploads/" + "a".repeat(64) + ".webp", alt: "", display: "photo", look: { shade: "soft", tone: "dark", size: "large", font: "serif" } };
  assert.ok(templateMediaItemSchema.safeParse(item).success);
  assert.equal(templateMediaItemSchema.safeParse({ ...item, key: "home-nimbus", alt: "Nimbus" }).success, false);
  // A page banner's button words may be empty: no button.
  const page = { slug: "care-guide", title: "Care guide", description: "", body: "", banner: { desktopImage: "/media/a.webp", mobileImage: "/media/b.webp", alt: "Care", href: "/contact", label: "" } };
  assert.ok(contentPageSchema.safeParse(page).success);
  assert.ok(storefrontContentSchema.safeParse({ ...fresh(), pages: [page] }).success);
});

test("an untouched campaign banner draws exactly as before: words, button and the strong shade, in the modern style", async () => {
  const doc = await drawCampaign("landing-dining-table", () => {});
  const banner = doc.querySelector(".campaign-banner")!;
  assert.deepEqual(["shade", "tone", "size", "font"].map((name) => banner.getAttribute(`data-banner-${name}`)), ["strong", "light", "medium", "modern"]);
  assert.ok(doc.querySelector(".campaign-shade"));
  assert.ok(doc.querySelector(".campaign-copy h2"));
  assert.ok(doc.querySelector("a.campaign-cta"));
  assert.ok(doc.querySelector("div.campaign-scene"), "with a button, the scene is not itself a link");
});

test("a cleared or switched-off button leaves nothing behind, and the whole banner becomes the link", async () => {
  for (const edit of [(value: StorefrontContent["campaigns"][number]) => { value.cta = "  "; }, (value: StorefrontContent["campaigns"][number]) => { value.look = look({ button: false }); }]) {
    const doc = await drawCampaign("landing-dining-table", edit);
    assert.equal(doc.querySelector(".campaign-cta"), null, "no outline of a button");
    const scene = doc.querySelector("a.campaign-scene")!;
    assert.equal(scene.getAttribute("href"), "/collections/dining", "the banner opens the campaign's destination");
    assert.equal(doc.querySelector(".campaign-banner")!.getAttribute("data-banner-button"), "none");
    assert.ok(scene.querySelector("h2"), "its words still show, inside the link");
  }
});

test("a picture with its own words and button: no words, no shade, no button, one link named by the campaign", async () => {
  const doc = await drawCampaign("beds-hero", (value) => {
    value.artwork = { desktopImage: "/media/uploads/" + "c".repeat(64) + ".webp", mobileImage: "/media/uploads/" + "d".repeat(64) + ".webp", alt: "Beds sale: up to 30% off", display: undefined };
    value.look = look({ words: false, button: false });
  });
  assert.equal(doc.querySelector(".campaign-copy"), null);
  assert.equal(doc.querySelector(".campaign-shade"), null, "no gradient over a finished banner");
  assert.equal(doc.querySelector(".campaign-banner")!.getAttribute("data-banner-shade"), "none");
  const link = doc.querySelector("a.campaign-scene")!;
  assert.ok(link.getAttribute("aria-label"), "the link has a name");
  assert.equal(doc.querySelectorAll("a").length, 1, "one link, not two");
});

test("the shade can be soft or none while the words stay; blank headline lines draw no empty heading", async () => {
  const none = await drawCampaign("landing-dining-table", (value) => { value.look = look({ shade: "none", tone: "dark", size: "large", font: "serif" }); });
  assert.equal(none.querySelector(".campaign-shade"), null);
  assert.ok(none.querySelector(".campaign-copy h2"));
  const banner = none.querySelector(".campaign-banner")!;
  assert.deepEqual(["tone", "size", "font"].map((name) => banner.getAttribute(`data-banner-${name}`)), ["dark", "large", "serif"]);
  const soft = await drawCampaign("landing-dining-table", (value) => { value.look = look({ shade: "soft" }); value.headline = ["", "  "]; });
  assert.equal(soft.querySelector(".campaign-banner")!.getAttribute("data-banner-shade"), "soft");
  assert.equal(soft.querySelector(".campaign-copy h2"), null, "no empty heading for blank lines");
});

test("the type styles and looks are real styles: each style sets the headline's face, and banners scale with their size", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../styles/banner-look.css", import.meta.url), "utf8");
  for (const font of bannerFonts.filter((font) => font !== "modern")) assert.match(css, new RegExp(`\\[data-banner-font="${font}"\\]`), font);
  assert.match(css, /\.campaign-banner\[data-banner-shade="soft"\]/);
  assert.match(css, /\.campaign-banner\[data-banner-tone="dark"\]/);
  const campaigns = readFileSync(new URL("../styles/campaign-banners.css", import.meta.url), "utf8");
  assert.equal((campaigns.match(/var\(--banner-scale,1\)/g) ?? []).length, 6, "the band, phone and card headlines scale");
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.ok(layout.indexOf("banner-look.css") > layout.indexOf("button-fill.css"), "loaded after the banners' own styles, so it wins");
});

test("a type style reaches only its banner's words: every rule that changes how text looks names a banner", async () => {
  // Owner, 25 Nov 2026: "make sure the font style change when changed only reflects on the banner area text not anywhere else".
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const css = readFileSync(new URL("../styles/banner-look.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  // A selector list split at its own commas, not those inside :is(...) or :not(...).
  const selectorsOf = (text: string) => {
    const out: string[] = [];
    let depth = 0, start = 0;
    for (let at = 0; at < text.length; at++) {
      if (text[at] === "(") depth++;
      else if (text[at] === ")") depth--;
      else if (text[at] === "," && depth === 0) { out.push(text.slice(start, at)); start = at + 1; }
    }
    return [...out, text.slice(start)].map((selector) => selector.trim()).filter(Boolean);
  };
  const banner = /\.campaign-banner|\.campaign-scene-link|\.hero-slide|\.collection-banner|\.banner-font-sample/;
  const ownElement = /^\[data-banner-(font|size)(="[a-z-]+")?\]$/;
  let rules = 0;
  for (const [, selectors, body] of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const visible = body!.split(";").map((declaration) => declaration.trim()).filter((declaration) => declaration && !declaration.startsWith("--"));
    for (const selector of selectorsOf(selectors!)) {
      rules++;
      if (visible.length) assert.match(selector, banner, `"${selector}" sets ${visible[0]} outside a banner`);
      else assert.ok(banner.test(selector) || ownElement.test(selector), `"${selector}": a style's values belong on a banner's own element`);
    }
  }
  assert.ok(rules > 30, "every rule was read");
  // Only banners carry a style, and the admin's own samples and copy preview: every element that sets data-banner-font.
  const files: string[] = [];
  const walk = (dir: URL) => {
    for (const name of readdirSync(dir)) {
      const url = new URL(name, dir);
      if (statSync(url).isDirectory()) walk(new URL(`${name}/`, dir));
      else if (name.endsWith(".tsx") && readFileSync(url, "utf8").includes("data-banner-font=")) files.push(decodeURIComponent(url.pathname).split("/components/")[1]!);
    }
  };
  walk(new URL("../components/", import.meta.url));
  assert.deepEqual(files.sort(), ["admin/banner-look-fields.tsx", "admin/forms.tsx", "campaign-banner.tsx", "hero.tsx", "store/collection-banner.tsx"]);
});

test("a collection page's banner over a photo takes its look; over the collection's own photo it keeps the theme's", () => {
  const draw = (picture?: React.ComponentProps<typeof CollectionBanner>["picture"]) => new JSDOM(renderToStaticMarkup(
    <CollectionBanner title={heroTitle("sofas", "Sofas")} crumb="Sofas" intro={collectionIntro("sofas")} cover={null} slot="collection-hero-sofas" picture={picture} />,
  )).window.document;
  const photo = { image: "/media/uploads/" + "e".repeat(64) + ".webp", alt: "", display: "photo" as const };
  const styled = draw({ ...photo, look: { shade: "none", tone: "dark", size: "small", font: "capitals" } }).querySelector("section")!;
  assert.deepEqual(["shade", "tone", "size", "font"].map((name) => styled.getAttribute(`data-banner-${name}`)), ["none", "dark", "small", "capitals"]);
  assert.equal(styled.querySelector(".collection-banner-shade"), null);
  assert.ok(styled.querySelector("h1"), "the page's heading stays");
  const plain = draw(photo).querySelector("section")!;
  assert.equal(plain.getAttribute("data-banner-shade"), "strong");
  assert.ok(plain.querySelector(".collection-banner-shade"));
  assert.equal(draw().querySelector("section")!.hasAttribute("data-banner-font"), false, "no picture of staff's: the theme's look");
});

test("a page banner without button words shows no button and is still one link, named by its picture", () => {
  const page = { slug: "care-guide", title: "Care guide", description: "", body: "Text.", banner: { desktopImage: "/media/a.webp", mobileImage: "/media/b.webp", alt: "Care for wood", href: "/contact", label: "" } };
  const doc = new JSDOM(renderToStaticMarkup(<ContentPage page={page} />)).window.document;
  const link = doc.querySelector("a.content-page-banner")!;
  assert.equal(link.querySelector("span"), null);
  assert.equal(link.getAttribute("data-banner-button"), "none");
  assert.equal(link.querySelector("img")?.getAttribute("alt"), "Care for wood");
});

test("staff turn a campaign's words and button off, remove its shade and choose a type style on the Campaigns screen", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
  const previousGlobals = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import("react-dom/client");
  const { ContentEditor } = await import("../components/admin/editor");
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  const previousFetch = globalThis.fetch;
  let saved: { content: StorefrontContent } | undefined;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "PUT") { saved = JSON.parse(String(init.body)); return Response.json({ version: 5, draft: saved!.content, publishedVersion: 2, updatedAt: null }); }
    return Response.json({ version: 4, draft: fresh(), publishedVersion: 2, updatedAt: null });
  };
  const button = (name: string, scope: ParentNode = container) => {
    const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === name);
    assert.ok(found, `Missing ${name}`);
    return found;
  };
  const group = (label: string) => [...container.querySelectorAll<HTMLElement>('[role="group"]')].find((item) => item.querySelector("span")?.textContent === label)!;
  const check = (label: string) => [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((input) => input.closest("label")?.textContent?.includes(label))!;
  try {
    await act(async () => root.render(<ContentEditor initialContent={fresh()} session={{ user: { id: "staff", email: "publisher@example.invalid", role: "publisher" }, csrfToken: "a".repeat(64) }} onExpired={() => {}} />));
    await act(async () => button("Campaigns").click());
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Campaign"]')!;
    const index = [...select.options].find((option) => option.textContent === "landing dining table")!.value;
    await act(async () => { select.value = index; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    assert.ok(container.querySelector("[data-banner-look]"), "the screen has the banner's look");
    await act(async () => check("Show the button").click());
    assert.match(container.textContent ?? "", /No button: the whole banner opens/, "the preview says so");
    await act(async () => button("None", group("Shade behind the words")).click());
    await act(async () => button("Dark", group("Words")).click());
    await act(async () => button("Classic serif").click());
    assert.equal(container.querySelector("[data-font-choice]")?.getAttribute("data-font-choice"), "serif");
    await act(async () => check("Show the words").click());
    assert.equal(group("Shade behind the words").querySelector("button")!.disabled, true, "no shade to choose without words");
    await act(async () => button("Save draft").click());
    assert.ok(saved, "the draft was saved");
    const campaign = saved!.content.campaigns.find((item) => item.key === "landing-dining-table")!;
    assert.deepEqual(campaign.look, { words: false, button: false, shade: "none", tone: "dark", size: "medium", font: "serif" });
    assert.ok(storefrontContentSchema.safeParse(saved!.content).success);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previousFetch;
    Object.assign(globalThis, previousGlobals);
  }
});
