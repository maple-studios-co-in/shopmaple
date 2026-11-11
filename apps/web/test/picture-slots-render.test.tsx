import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { TemplateMedia } from "@shopmaple/contracts";
import { CategoryLanding } from "../components/category-landing";
import { HomeEditorial } from "../components/home-editorial";
import { ProductBanner } from "../components/store/product-banner";
import { ReturnsPageContent } from "../components/service-pages";
import { AuthShell } from "../components/account/auth/auth-shell";
import { ShopProvider } from "../components/shop-provider";
import ArticlePage from "../app/blogs/[blog]/[article]/page";
import BlogPage from "../app/blogs/[blog]/page";
import PolicyPage from "../app/policies/[slug]/page";
import ProductPage from "../app/products/[handle]/page";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { resolveHomeDetails } from "../lib/home-details-defaults";
import { resolveServicePages } from "../lib/service-page-defaults";
import { resolveSiteChrome } from "../lib/site-chrome-defaults";
import { shown } from "./support/rendered-src";
import { cardFixture } from "./support/catalogue-fixtures";

// The owner, 12 Nov 2026: the pictures fixed in code are template artwork. Each page shows staff's published upload in
// place of its original, with the description staff gave, and the original wherever staff have uploaded nothing.
const upload = (letter: string) => `/media/uploads/${letter.repeat(64)}.webp`;
const keeri = (handle: string) => `https://store.maplefurnishers.com/media/keeri/${handle}.webp`;
const src = (node: Element | null | undefined) => shown(decodeURIComponent(node?.getAttribute("src") ?? ""));
const parse = (html: string) => new JSDOM(html).window.document;
let api = 0;

/** A storefront API that publishes `templateMedia` (and `extra`), lists every catalogue card asked for, and records reads. */
async function withStore<T>(templateMedia: TemplateMedia | undefined, run: (requests: URL[]) => Promise<T>, extra: object = {}): Promise<T> {
  const previous = { fetch: globalThis.fetch, api: process.env.API_URL };
  const requests: URL[] = [];
  process.env.API_URL = `http://picture-slots-${++api}.invalid`;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.pathname === "/api/content/storefront") return Response.json({ version: 3, content: { ...defaultStorefrontContent, ...(templateMedia ? { templateMedia } : {}), ...extra } });
    if (url.pathname === "/api/catalogue/cards")
      return Response.json({ published: true, products: (url.searchParams.get("handles") ?? "").split(",").filter(Boolean).map((handle) => ({ ...cardFixture(handle), image: keeri(handle) })) });
    if (url.pathname === "/api/products/model")
      return Response.json({ id: "model", handle: "model", title: "Model Chair", description: "", category: null, images: [], published: true, source: "keeri", sourceUpdatedAt: "2026-10-26T00:00:00Z", variants: [] });
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  };
  try { return await run(requests); } finally {
    globalThis.fetch = previous.fetch;
    if (previous.api === undefined) delete process.env.API_URL; else process.env.API_URL = previous.api;
  }
}
async function stream(element: React.ReactNode) {
  const body = await renderToReadableStream(<ShopProvider>{element}</ShopProvider>, { progressiveChunkSize: Number.POSITIVE_INFINITY });
  await body.allReady;
  return parse(await new Response(body).text());
}

test("a category page's banners, circles and value icons show staff's uploads, else their Keeri photos, else nothing", async () => {
  const media: TemplateMedia = [
    { key: "sofas-outdoor-banner", image: upload("a"), mobileImage: upload("b"), alt: "A sofa on a shaded terrace" },
    { key: "sofas-tile-wooden-sofas", image: upload("c"), alt: "A teak sofa" },
    { key: "sofas-value-grain", image: upload("d"), alt: "" },
  ];
  await withStore(media, async (requests) => {
    const doc = await stream(<CategoryLanding slug="sofas" content={{ ...defaultStorefrontContent, templateMedia: media }} />);
    const banners = [...doc.querySelectorAll(".landing-banner")];
    assert.equal(banners.length, 3, "the uploaded banner and the two whose Keeri products are listed");
    assert.equal(src(banners[0]!.querySelector("img")), upload("a"));
    assert.equal(banners[0]!.querySelector("img")?.getAttribute("alt"), "A sofa on a shaded terrace");
    assert.ok(decodeURIComponent(banners[0]!.querySelector("source")?.getAttribute("srcset") ?? "").includes(upload("b")), "phones get the square mobile image");
    assert.ok(decodeURIComponent(banners[1]!.querySelector("img")?.getAttribute("src") ?? "").includes(keeri("arboris-sofa")), "an untouched banner keeps its Keeri photo");
    assert.equal(banners[1]!.querySelector("img")?.getAttribute("alt"), "Sofas — find furniture for your space");
    const wooden = doc.querySelector('.landing-categories a[href="/collections/wooden-sofas"] img');
    assert.equal(src(wooden), upload("c"));
    assert.equal(wooden?.getAttribute("alt"), "A teak sofa");
    assert.ok(decodeURIComponent(doc.querySelector('.landing-categories a[href="/collections/recliners"] img')?.getAttribute("src") ?? "").includes(keeri("verdant")));
    const icons = [...doc.querySelectorAll(".landing-values img")];
    assert.equal(icons.length, 1, "only the value given an icon draws one");
    assert.equal(src(icons[0]), upload("d"));
    assert.equal(icons[0]!.closest("div")?.querySelector("h3")?.textContent, "Grain");
    const asked = requests.filter((url) => url.pathname === "/api/catalogue/cards").flatMap((url) => (url.searchParams.get("handles") ?? "").split(","));
    assert.ok(!asked.includes("casaba") && !asked.includes("atrio-sofa"), "an uploaded picture needs no product photo");
  });
});

test("the blog shows a cover staff chose for an imported article everywhere its picture appears, and the sidebar photos", async () => {
  const media: TemplateMedia = [
    { key: "blog-cover-measure-furniture", image: upload("e"), alt: "A tape measure on a sofa arm" },
    { key: "blog-bestsellers-promo", image: upload("f"), alt: "" },
    { key: "blog-collections-photo", image: upload("1"), alt: "" },
  ];
  await withStore(media, async () => {
    const article = await stream(await ArticlePage({ params: Promise.resolve({ blog: "recent-stories", article: "how-to-measure-furniture-before-ordering-online" }) }));
    const hero = article.querySelector("img[data-article-hero]");
    assert.equal(src(hero), upload("e"));
    assert.equal(hero?.getAttribute("alt"), "A tape measure on a sofa arm");
    assert.equal(src(article.querySelector("[data-collections-photo]")), upload("1"));
    const other = await stream(await ArticlePage({ params: Promise.resolve({ blog: "recent-stories", article: "how-to-identify-quality-furniture-before-you-buy" }) }));
    assert.equal(src(other.querySelector("img[data-article-hero]")), "/media/home/editorial-left.webp", "another article keeps its own picture");
    const listing = await stream(await BlogPage({ params: Promise.resolve({ blog: "recent-stories" }) }));
    assert.ok([...listing.querySelectorAll(".blog-stories img")].some((img) => src(img) === upload("e")), "the listing shows the cover too");
    assert.equal(src(listing.querySelector("[data-bestsellers-promo] img")), upload("f"));
  });
  await withStore(undefined, async () => {
    const article = await stream(await ArticlePage({ params: Promise.resolve({ blog: "recent-stories", article: "how-to-measure-furniture-before-ordering-online" }) }));
    assert.equal(src(article.querySelector("img[data-article-hero]")), "/blog/art/how-to-measure-furniture-before-ordering-online.webp");
    assert.equal(src(article.querySelector("[data-collections-photo]")), "/media/home/editorial-right.webp");
  });
});

test("pictures placed in a policy's or imported article's text are shown on the page", async () => {
  const picture = { tag: "img", src: upload("2"), alt: "Our Delhi workshop", children: [] };
  const editorialContent = {
    policies: [{ slug: "privacy-policy", title: "Privacy policy", content: [{ tag: "p", children: ["Our promise."] }, picture] }],
    blogs: [],
    articles: [{ blog: "recent-stories", handle: "how-to-measure-furniture-before-ordering-online", title: "Measuring", excerpt: "How to measure.", content: [{ tag: "p", children: ["Measure twice."] }, picture] }],
  };
  await withStore(undefined, async () => {
    const policy = parse(renderToStaticMarkup(await PolicyPage({ params: Promise.resolve({ slug: "privacy-policy" }) })));
    assert.ok([...policy.querySelectorAll("img")].some((img) => src(img) === upload("2") && img.getAttribute("alt") === "Our Delhi workshop"));
    const article = await stream(await ArticlePage({ params: Promise.resolve({ blog: "recent-stories", article: "how-to-measure-furniture-before-ordering-online" }) }));
    assert.ok([...article.querySelectorAll("article[data-blog-body] img")].some((img) => src(img) === upload("2")));
  }, { editorialContent });
});

test("the Help pages' photos are template artwork", async () => {
  await withStore([{ key: "policy-shipping-policy", image: upload("3"), alt: "A delivery van at dawn" }], async () => {
    const shipping = parse(renderToStaticMarkup(await PolicyPage({ params: Promise.resolve({ slug: "shipping-policy" }) })));
    assert.equal(src(shipping.querySelector("[data-help-photo] img")), upload("3"));
    assert.equal(shipping.querySelector("[data-help-photo] img")?.getAttribute("alt"), "A delivery van at dawn");
    const privacy = parse(renderToStaticMarkup(await PolicyPage({ params: Promise.resolve({ slug: "privacy-policy" }) })));
    assert.equal(src(privacy.querySelector("[data-help-photo] img")), "/media/policies/privacy-policy.jpg");
    assert.equal(privacy.querySelector("[data-help-photo] img")?.getAttribute("alt"), "", "the original only sets the scene");
  });
  const returns = (media?: TemplateMedia) => parse(renderToStaticMarkup(
    <ReturnsPageContent content={resolveServicePages(undefined).returns} footer={resolveSiteChrome(undefined).footer} media={media} />));
  assert.equal(src(returns().querySelector("[data-help-photo] img")), "/media/policies/return-exchange.jpg");
  assert.equal(src(returns([{ key: "policy-return-exchange", image: upload("4"), alt: "" }]).querySelector("[data-help-photo] img")), upload("4"));
});

test("the homepage editorial flips through staff's photos after its own", () => {
  const content = resolveHomeDetails().editorial;
  const frames = (media?: TemplateMedia) => [...parse(renderToStaticMarkup(<HomeEditorial content={content} media={media} />)).querySelectorAll("[data-flip-frame] img")].map((img) => src(img));
  assert.deepEqual(frames(), [content.leftImage, "/media/home/editorial-flip-runo.webp", "/media/home/editorial-flip-aero.webp", "/media/home/editorial-flip-varyn.webp", "/media/home/editorial-flip-seno.webp"]);
  assert.deepEqual(frames([{ key: "home-editorial-flip-2", image: upload("5"), alt: "" }, { key: "home-editorial-flip-3", image: upload("5"), alt: "" }]),
    [content.leftImage, "/media/home/editorial-flip-runo.webp", upload("5"), "/media/home/editorial-flip-seno.webp"], "a picture used twice flips once");
});

test("the product page banner and the sign-in photos are template artwork", async () => {
  const banner = (picture?: { image: string; alt: string }) => parse(renderToStaticMarkup(<ProductBanner picture={picture} />)).querySelector("[data-banner] img");
  assert.equal(banner()?.getAttribute("src"), "/product-page/banner.jpg");
  assert.equal(banner({ image: upload("6"), alt: "A chair by a window" })?.getAttribute("src"), upload("6"));
  assert.equal(banner({ image: upload("6"), alt: "A chair by a window" })?.getAttribute("alt"), "A chair by a window");
  await withStore([{ key: "product-banner", image: upload("7"), alt: "" }], async () => {
    const page = await ProductPage({ params: Promise.resolve({ handle: "model" }), searchParams: Promise.resolve({}) });
    const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
    const doc = await stream(<AppRouterContext.Provider value={router}>{page}</AppRouterContext.Provider>);
    assert.equal(doc.querySelector("[data-banner] img")?.getAttribute("src"), upload("7"), "the page hands the published banner to the product view");
  });
  const photo = (editorial: "login" | "sign-up", media?: TemplateMedia) =>
    src(parse(renderToStaticMarkup(<AuthShell editorial={editorial} aside={null} media={media}>form</AuthShell>)).querySelector(".auth-editorial-photo"));
  assert.equal(photo("login"), "/media/account/login-editorial.webp");
  assert.equal(photo("sign-up"), "/media/account/sign-up-editorial.webp");
  assert.equal(photo("sign-up", [{ key: "auth-sign-up", image: upload("8"), alt: "" }]), upload("8"));
  assert.equal(photo("login", [{ key: "auth-sign-up", image: upload("8"), alt: "" }]), "/media/account/login-editorial.webp");
});
