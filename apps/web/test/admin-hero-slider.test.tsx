import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act, useState } from "react";
import { JSDOM } from "jsdom";
import { homeDetailsSchema, type HeroSlide, type HomeDetails } from "@shopmaple/contracts";
import { defaultHomeDetails } from "../lib/home-details-defaults";
import { heroHeadline, heroIntro } from "../lib/hero-film";

// Owner, 19 Nov 2026: "in the home page hero section on the left side there is a slider: in the live preview there should be
// an option to select how many slides there should be, and in each slide an option to upload an image or a video, as well
// as what and how to put the caption text".

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
// No drawing in this test browser: a film's cover cannot be made here, as in a browser that cannot decode the film.
dom.window.HTMLCanvasElement.prototype.getContext = (() => null) as typeof dom.window.HTMLCanvasElement.prototype.getContext;
const { createRoot } = await import("react-dom/client");
const { HomeDetailFields } = await import("../components/admin/home-details-fields");
const { PreviewSlideContext } = await import("../components/admin/preview-slide");
const container = document.getElementById("root")!;
const upload = "/media/uploads/" + "a".repeat(64) + ".webp";
const cover = "/media/uploads/" + "c".repeat(64) + ".webp";
const film = "/media/uploads/" + "f".repeat(64) + ".mp4";
const cta = defaultHomeDetails.hero.cta;
const session = { user: { id: "editor", email: "editor@example.test", role: "editor" as const }, csrfToken: "c".repeat(64) };

let latest: HomeDetails | undefined;
let shown: [string, number | null][] = [];
function Host({ initial }: { initial?: HomeDetails }) {
  const [value, setValue] = useState<HomeDetails | undefined>(initial);
  latest = value;
  return <PreviewSlideContext.Provider value={(slider, index) => { shown.push([slider, index]); }}>
    <HomeDetailFields section="hero" value={value} session={session} onExpired={() => assert.fail("Unexpected expiry")}
      onChange={next => { latest = next; setValue(next); }} />
  </PreviewSlideContext.Provider>;
}
async function mount(slides?: HeroSlide[]) {
  latest = undefined;
  shown = [];
  const root = createRoot(container);
  const initial = slides ? { ...structuredClone(defaultHomeDetails), hero: { ...structuredClone(defaultHomeDetails.hero), slides } } : undefined;
  await act(async () => root.render(<Host initial={initial} />));
  return async () => { await act(async () => root.unmount()); };
}
const text = () => container.textContent ?? "";
const slides = () => latest?.hero.slides;
const field = <T extends HTMLElement = HTMLInputElement>(label: string) => container.querySelector<T>(`[aria-label="${label}"]`);
const cards = () => [...container.querySelectorAll<HTMLDetailsElement>("[data-hero-slide-card]")];
function button(name: string, root: ParentNode = container) {
  const found = [...root.querySelectorAll<HTMLButtonElement>("button")].find(b => b.getAttribute("aria-label") === name || b.textContent?.trim() === name);
  assert.ok(found, `Missing ${name} button`);
  return found;
}
const click = (name: string, root?: ParentNode) => act(async () => button(name, root).click());
async function fill(label: string, value: string) {
  const input = field<HTMLInputElement | HTMLTextAreaElement>(label);
  assert.ok(input, `Missing ${label} field`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(input.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
/** Opens or closes a slide's card as a click on its summary does. */
async function toggle(n: number, open = true) {
  const card = cards()[n - 1];
  assert.ok(card, `Missing slide ${n} card`);
  await act(async () => { card.open = open; card.dispatchEvent(new dom.window.Event("toggle")); });
}
const settle = () => act(async () => new Promise(resolve => setTimeout(resolve, 30)));
const asset = (id: string, kind: "image" | "video", url: string, label: string) => ({
  id, sha256: url.slice(15, 79), kind, label, width: 1600, height: 1000, bytes: 4000, mimeType: kind === "video" ? "video/mp4" : "image/webp",
  durationMs: kind === "video" ? 8000 : null, faststart: kind === "video" ? true : null, createdAt: "2026-11-19T00:00:00Z", publicAt: null, url,
  previewUrl: `/api/admin/media/${url.slice(15, 79)}/preview`,
});
async function chooseFile(label: string, file: File) {
  const input = container.querySelector<HTMLInputElement>(`input[type="file"][aria-label="${label}"]`);
  assert.ok(input, `Missing ${label} file input`);
  await act(async () => {
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}

test("the slider starts from Maple's default slides: a number makes that many slides from them, the first open and shown in the preview", async () => {
  const close = await mount();
  try {
    assert.match(text(), /Now showing Maple's 6 default slides/);
    const counts = [...container.querySelectorAll<HTMLButtonElement>("[data-slide-count]")];
    assert.deepEqual(counts.map(item => item.textContent), ["1", "2", "3", "4", "5", "6", "7", "8"], "one to eight slides");
    assert.equal(counts.some(item => item.getAttribute("aria-pressed") === "true"), false, "no number is chosen while the defaults show");
    assert.ok(field("Hero headline"), "the default slides' words are edited here meanwhile");
    await click("3 slides");
    assert.deepEqual(slides(), [
      { kind: "image", still: "home-workshop-poster", headline: heroHeadline, intro: heroIntro, button: { label: cta, href: "/nimbus-collection" } },
      { kind: "image", still: "nimbus-slide-living", eyebrow: "The Nimbus Collection", headline: heroHeadline, intro: heroIntro, button: { label: cta, href: "/nimbus-collection" } },
      { kind: "image", still: "terra-hero", eyebrow: "The Terra Collection", headline: heroHeadline, intro: heroIntro, button: { label: cta, href: "/terra-collection" } },
    ], "each slide starts as the default slide in its place: the same photo, label, words and button");
    assert.equal(homeDetailsSchema.safeParse(latest).success, true, "the slides can be saved as they are");
    assert.equal(button("3 slides").getAttribute("aria-pressed"), "true");
    assert.equal(cards().length, 3);
    assert.equal(cards()[0]!.open, true, "the first slide opens");
    assert.deepEqual(shown.at(-1), ["hero", 0], "and the live preview shows it");
    assert.equal(field("Hero headline"), null, "each slide has its own words now");
    assert.match(text(), /Each slide above has its own words/);
  } finally { await close(); }
});

test("more slides are made from the defaults with the last slide's look; fewer asks first when a slide that goes is staff's own", async () => {
  const close = await mount();
  try {
    await click("2 slides");
    await fill("Slide 2 headline", "Our own words");
    await toggle(2);
    await click("Slide 2: words bottom centre");
    await click("4 slides");
    assert.equal(slides()!.length, 4);
    assert.equal(slides()![2]!.still, "terra-hero", "slide 3 starts from the third default slide");
    assert.equal(slides()![3]!.still, "nimbus-slide-bedroom");
    assert.deepEqual(slides()![3]!.caption, { position: "bottom", tone: "light", shade: "strong", size: "medium" }, "and looks like the last slide");
    assert.equal(cards()[2]!.open, true, "the first added slide opens");
    await click("1 slide");
    assert.match(text(), /Slides 2 to 4 come off the slider/, "slide 2 has staff's own words, so it asks");
    await click("Cancel");
    assert.equal(slides()!.length, 4, "nothing changed");
    await click("1 slide");
    await click("Keep 1 slide");
    assert.equal(slides()!.length, 1);
    await click("3 slides");
    await click("2 slides");
    assert.equal(slides()!.length, 2, "a slide still as it was made goes without asking");
    assert.doesNotMatch(text(), /come off the slider/);
    assert.equal(homeDetailsSchema.safeParse(latest).success, true);
  } finally { await close(); }
});

test("a slide's words: a small label, the headline, a line and a button to a store page, each optional and each named for click-to-edit", async () => {
  const close = await mount();
  try {
    await click("1 slide");
    await fill("Slide 1 small label", "New season");
    await fill("Slide 1 headline", "");
    await fill("Slide 1 line under the headline", "Hand-finished in Jodhpur");
    assert.equal(slides()![0]!.eyebrow, "New season");
    assert.equal("headline" in slides()![0]!, false, "emptied words are no words");
    assert.equal(slides()![0]!.intro, "Hand-finished in Jodhpur");
    assert.equal(field("Slide 1 headline")!.name, "hero-slide:0:headline", "the page names this field when its words are clicked");
    assert.equal(field("Slide 1 small label")!.name, "hero-slide:0:eyebrow");
    assert.equal(field<HTMLTextAreaElement>("Slide 1 line under the headline")!.name, "hero-slide:0:intro");
    assert.equal(field("Slide 1 button words")!.name, "hero-slide:0:button");
    const check = () => [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(box => box.closest("label")?.textContent?.includes("Show a button"))!;
    await act(async () => check().click());
    assert.equal(slides()![0]!.button, null, "no button at all");
    assert.equal(field("Slide 1 button words"), null);
    await act(async () => check().click());
    assert.deepEqual(slides()![0]!.button, { label: cta, href: "/nimbus-collection" });
    await fill("Slide 1 button words", "Shop the sale");
    await fill("Slide 1 button link", "sale");
    assert.match(text(), /Use a store address that starts with \//, "a link that is not a store address says so");
    await fill("Slide 1 button link", "/collections/all");
    assert.doesNotMatch(text(), /Use a store address that starts with/);
    assert.deepEqual(slides()![0]!.button, { label: "Shop the sale", href: "/collections/all" });
    assert.equal(homeDetailsSchema.safeParse(latest).success, true);
  } finally { await close(); }
});

test("how the words look: where they sit, light or dark, the shade behind them and the headline's size", async () => {
  const close = await mount();
  try {
    await click("1 slide");
    assert.equal(container.querySelectorAll("[data-caption-choice]").length, 9, "nine places");
    assert.equal(button("Slide 1: words middle left").getAttribute("aria-pressed"), "true", "the theme's own place to start");
    await click("Slide 1: words top right");
    assert.deepEqual(slides()![0]!.caption, { position: "top-right", tone: "light", shade: "strong", size: "medium" });
    await click("Dark");
    await click("Soft");
    await click("Large");
    assert.deepEqual(slides()![0]!.caption, { position: "top-right", tone: "dark", shade: "soft", size: "large" });
    assert.equal(button("Dark").getAttribute("aria-pressed"), "true");
    assert.equal(homeDetailsSchema.safeParse(latest).success, true);
  } finally { await close(); }
});

test("a slide becomes a video and back, keeping its words and look, and what it showed comes back", async () => {
  const close = await mount([{ kind: "image", src: upload, alt: "A walnut sofa", headline: "Sofas that last", caption: { position: "center", tone: "light", shade: "soft", size: "large" } }]);
  try {
    await toggle(1);
    assert.match(text(), /Your picture\./);
    await click("A video");
    assert.deepEqual(slides()![0], { kind: "video", headline: "Sofas that last", caption: { position: "center", tone: "light", shade: "soft", size: "large" } });
    assert.match(text(), /No video yet/);
    assert.ok(container.querySelector("[data-hero-slide-cover]"), "a video slide has its cover picture");
    assert.ok(button("Upload video"), "and takes a video");
    await click("A picture");
    assert.deepEqual(slides()![0], { kind: "image", src: upload, alt: "A walnut sofa", still: "home-workshop-poster", headline: "Sofas that last", caption: { position: "center", tone: "light", shade: "soft", size: "large" } },
      "its picture and description are back");
    await click("Use Maple's photo");
    assert.equal("src" in slides()![0]!, false, "Maple's photo for its place shows again");
    assert.match(text(), /Maple's own photo for now \(Workshop\)/);
    const which = field<HTMLSelectElement>("Slide 1: which of Maple's photos")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, "value")!.set!.call(which, "terra-room-1");
      which.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    assert.equal(slides()![0]!.still, "terra-room-1", "any of Maple's photos can be chosen");
  } finally { await close(); }
});

test("a picture uploaded from the computer goes into the library and onto the slide at once", async () => {
  const requests: { url: string; method: string; headers: Record<string, string> }[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    // The upload rules (Settings, Banner sizes) are read before a picture is sent; none are set here.
    if (String(input).startsWith("/api/admin/settings/")) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
    requests.push({ url: String(input), method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string> });
    return Response.json({ asset: asset("img1", "image", upload, "sofa.png") }, { status: 201 });
  };
  const close = await mount();
  try {
    await click("1 slide");
    await chooseFile("Upload image", new dom.window.File(["png"], "sofa.png", { type: "image/png" }) as unknown as File);
    await settle();
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.url, "/api/admin/media");
    assert.equal(requests[0]!.method, "POST");
    assert.equal(requests[0]!.headers["Content-Type"], "image/png");
    assert.equal(requests[0]!.headers["X-CSRF-Token"], session.csrfToken);
    assert.equal(slides()![0]!.src, upload, "the slide shows the upload");
    assert.ok(container.querySelector(`img[src="/api/admin/media/${"a".repeat(64)}/preview"]`), "previewed privately");
    await chooseFile("Upload image", new dom.window.File(["gif"], "spin.gif", { type: "image/gif" }) as unknown as File);
    assert.match(text(), /Choose a JPEG, PNG or WebP image up to 8 MB/, "a file of another kind is refused before sending");
    assert.equal(requests.length, 1);
  } finally { globalThis.fetch = previous; await close(); }
});

test("a video uploaded from the computer plays on the slide; where no cover can be made, staff are asked for one", async () => {
  const sent: { url: string; headers: Record<string, string> }[] = [];
  class FakeRequest {
    upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
    status = 0; responseText = ""; timeout = 0; url = ""; headers: Record<string, string> = {};
    onload: (() => void) | null = null; onerror: (() => void) | null = null; ontimeout: (() => void) | null = null; onabort: (() => void) | null = null;
    open(_method: string, url: string) { this.url = url; }
    setRequestHeader(name: string, value: string) { this.headers[name] = value; }
    send() {
      sent.push({ url: this.url, headers: this.headers });
      setTimeout(() => {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
        this.status = 201;
        this.responseText = JSON.stringify({ asset: asset("film1", "video", film, "showroom.mp4") });
        this.onload?.();
      }, 5);
    }
    abort() { this.onabort?.(); }
  }
  const previousRequest = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
  (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = FakeRequest;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ asset: asset("img2", "image", cover, "cover.jpg") }, { status: 201 });
  const close = await mount([{ kind: "video", headline: "In the workshop" } as HeroSlide]);
  try {
    await toggle(1);
    await chooseFile("Upload video", new dom.window.File(["mp4"], "showroom.mp4", { type: "video/mp4" }) as unknown as File);
    await settle();
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.url, "/api/admin/media/films");
    assert.equal(sent[0]!.headers["X-Media-Label"], "showroom.mp4");
    assert.equal(slides()![0]!.src, film, "the film is on the slide");
    assert.match(text(), /A cover picture could not be made from this film here/, "this browser could not make a cover, and says so");
    assert.ok(button("Make from the video"), "one can be made again once the film plays");
    await chooseFile("Upload cover", new dom.window.File(["jpg"], "cover.jpg", { type: "image/jpeg" }) as unknown as File);
    await settle();
    assert.deepEqual(slides()![0], { kind: "video", src: film, poster: cover, headline: "In the workshop" });
    assert.equal(homeDetailsSchema.safeParse(latest).success, true);
  } finally {
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = previousRequest;
    globalThis.fetch = previousFetch;
    await close();
  }
});

test("pictures and videos also come from the library, each list showing only its kind", async () => {
  const requested: string[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async input => {
    // The upload rules (Settings, Banner sizes) are read before a picture is sent; none are set here.
    if (String(input).startsWith("/api/admin/settings/")) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
    requested.push(String(input));
    return String(input).endsWith("kind=video")
      ? Response.json({ assets: [asset("film1", "video", film, "Workshop film")], nextCursor: null })
      : Response.json({ assets: [asset("img1", "image", upload, "Living room")], nextCursor: null });
  };
  const close = await mount();
  try {
    await click("2 slides");
    await click("Choose image");
    await settle();
    assert.deepEqual(requested, ["/api/admin/media?kind=image"]);
    await click("Use image: Living room");
    assert.equal(slides()![0]!.src, upload);
    await toggle(2);
    const second = cards()[1]!;
    await click("A video", second);
    await click("Choose film", second);
    await settle();
    assert.equal(requested.at(-1), "/api/admin/media?kind=video", "a video slide's list shows films only");
    await click("Use film: Workshop film", second);
    await settle();
    assert.equal(slides()![1]!.src, film);
    assert.equal(slides()![1]!.kind, "video");
    assert.ok(second.querySelector(`video[src="/api/admin/media/${"f".repeat(64)}/preview"]`), "the film previews privately");
  } finally { globalThis.fetch = previous; await close(); }
});

test("slides move, are duplicated and removed (asking first for one with its own picture); the open one shows in the preview", async () => {
  const close = await mount([{ kind: "image", headline: "First" }, { kind: "image", src: upload, headline: "Second" }]);
  try {
    await toggle(2);
    assert.deepEqual(shown.at(-1), ["hero", 1], "the open slide shows in the live preview");
    await click("Move slide 2 up");
    assert.deepEqual(slides()!.map(slide => slide.headline), ["Second", "First"]);
    assert.equal(cards()[0]!.open, true, "the moved slide stays open");
    assert.deepEqual(shown.at(-1), ["hero", 0], "and the preview follows it");
    await click("Duplicate slide 1");
    assert.deepEqual(slides()!.map(slide => slide.headline), ["Second", "Second", "First"]);
    await click("Remove slide 1");
    assert.match(text(), /Its picture stays in the media library/, "a slide with its own picture asks first");
    await click("Remove the slide");
    assert.deepEqual(slides()!.map(slide => slide.headline), ["Second", "First"]);
    await toggle(2);
    await click("Remove slide 2");
    assert.deepEqual(slides()!.map(slide => slide.headline), ["Second"], "a slide of Maple's photo goes at once");
    await toggle(1);
    assert.equal(button("Remove slide 1").disabled, true, "the last slide stays");
    await toggle(1, false);
    assert.deepEqual(shown.at(-1), ["hero", null], "a closed card lets the slider run again");
  } finally { await close(); }
  assert.deepEqual(shown.at(-1), ["hero", null], "and so does leaving the hero");
});

test("going back to Maple's default slides asks first, then drops the slides key as older documents have it", async () => {
  const close = await mount([{ kind: "image", src: upload, headline: "Mine" }]);
  try {
    await click("Go back to Maple's default slides");
    assert.match(text(), /your slides come off it/);
    await click("Use Maple's default slides");
    assert.equal("slides" in latest!.hero, false);
    assert.match(text(), /Now showing Maple's 6 default slides/);
  } finally { await close(); }
});

test("a slide from before buttons were its own shows the hero's button words, and editing them gives it its own", async () => {
  const close = await mount([{ kind: "image", src: upload, headline: "Old slide" }]);
  try {
    await toggle(1);
    assert.equal(field("Slide 1 button words")!.value, cta);
    assert.equal(field("Slide 1 button link")!.value, "/nimbus-collection");
    await fill("Slide 1 button words", "See the range");
    assert.deepEqual(slides()![0]!.button, { label: "See the range", href: "/nimbus-collection" });
  } finally { await close(); }
});
