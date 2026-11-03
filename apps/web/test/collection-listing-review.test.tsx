import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { collectionFacetsSchema, facetCounts, filterCollection, productColours, productMaterials, productSize, type CollectionFacets, type CollectionProduct } from "@shopmaple/contracts";
import { collectionCategories } from "@shopmaple/contracts/catalogue-registry";
import { CollectionListing } from "../components/collection-listing";
import { CollectionHero } from "../components/store/collection-hero";
import { ShopProvider } from "../components/shop-provider";
import { collectionQuery } from "../lib/collections";
import { collectionIntro, heroTitle } from "../lib/collection-intro";
import { toProductCard } from "../lib/product-card-model";

// The owner's review file (Figma GJsFInfhys0crdNpQsbUUU, frame 1:1094 "Maple / Product Listing"): the collection
// introduction (1:1127), the filters (1:1139) and the results (1:1155), each filled from the catalogue's own data.
const piece = (handle: string, extra: Partial<CollectionProduct> = {}): CollectionProduct & { id: string } => ({
  id: handle, handle, title: handle, description: "", category: "chairs", sourceDetails: null,
  variants: [{ pricePaise: 2_360_000, available: false, stockPolicy: "made_to_order", title: "Default Title" }], ...extra,
});
// Handles of their own, so the store's curated collection lists never count them.
const nola = piece("test-nola", { title: "Nola", description: "A soft barrel-back accent chair in textured ivory bouclé",
  sourceDetails: { materials: "Frame: Sturdy wooden frame finished in rich walnut.\nSeat & Back: Upholstered in bouclé.", dimensions: "Width: 28\" (≈ 71 cm)\nDepth: 30\" (≈ 76 cm)" },
  variants: [{ pricePaise: 2_950_000, available: false, stockPolicy: "made_to_order", title: "Ivory Walnut" }] });
const aero = piece("test-aero", { title: "Aero Dining Chair", sourceDetails: { materials: "Solid sheesham wood with velvet upholstery", dimensions: "Width (in) - 22\nDepth (in) - 24" },
  variants: [{ pricePaise: 2_360_000, available: false, stockPolicy: "made_to_order", title: "Deep Atlantic" }, { pricePaise: 2_360_000, available: false, stockPolicy: "made_to_order", title: "Desert Taupe" }] });
const table = piece("test-kora", { title: "Kora Side Table", category: "tables", sourceDetails: { materials: "Marble top on a brass base", dimensions: "Width 45 cm\nDepth 45 cm" },
  variants: [{ pricePaise: 1_500_000, available: true, stockPolicy: "stocked", title: "White Marble" }] });

test("sizes read the catalogue's three ways of writing them, in centimetres", () => {
  assert.deepEqual(productSize(nola.sourceDetails!.dimensions), { width: 71, depth: 76 }, "the centimetres it gives");
  assert.deepEqual(productSize(aero.sourceDetails!.dimensions), { width: 56, depth: 61 }, "inches converted");
  assert.deepEqual(productSize("• Width: 22\" (≈ 56 cm) |  • Depth: 24\" (≈ 61 cm) | Height: 34\""), { width: 56, depth: 61 });
  assert.deepEqual(productSize(table.sourceDetails!.dimensions), { width: 45, depth: 45 });
  assert.deepEqual(productSize("80 x 60 cm"), {}, "an unlabelled size is not guessed");
  assert.deepEqual(productSize(null), {});
});

test("materials and colours come from the words the catalogue uses", () => {
  assert.deepEqual(productMaterials(nola), ["wood", "fabric"]);
  assert.deepEqual(productMaterials(table), ["metal", "stone"]);
  assert.deepEqual(productColours(nola), ["cream", "brown"], "Ivory Walnut");
  assert.deepEqual(productColours(aero), ["brown", "blue"], "Deep Atlantic and Desert Taupe");
  assert.deepEqual(productColours(piece("plain", { description: "In a soft sage weave." })), ["green"], "the description only when no option names a colour");
  assert.deepEqual(productColours(piece("offwhite", { title: "Off-white Lounge" })), ["cream"], "off-white is cream, not white");
});

test("the filters arrive as ticked boxes and keep only known values, sorted", () => {
  const query = collectionQuery({ material: ["wood", "fabric", "plastic"], colour: "blue,cream,blue", wmin: "50", wmax: "1000", dmin: "0", dmax: "80", availability: ["in", "out"] });
  assert.equal(query.material, "fabric,wood");
  assert.equal(query.colour, "blue,cream");
  assert.deepEqual([query.wmin, query.wmax, query.dmin, query.dmax], ["50", "", "", "80"], "whole centimetres from 1 to 999");
  assert.equal(query.availability, "", "both availability boxes ticked means every piece");
});

test("filtering by material, colour and size keeps a piece that matches any ticked value", () => {
  const all = [nola, aero, table];
  const ids = (raw: Record<string, string>) => filterCollection(all, collectionQuery(raw)).map((product) => product.id);
  // Results keep the default A–Z order: Aero Dining Chair, Kora Side Table, Nola.
  assert.deepEqual(ids({ material: "stone" }), ["test-kora"]);
  assert.deepEqual(ids({ material: "fabric,stone" }), ["test-aero", "test-kora", "test-nola"]);
  assert.deepEqual(ids({ colour: "blue" }), ["test-aero"]);
  assert.deepEqual(ids({ colour: "cream,white" }), ["test-kora", "test-nola"]);
  assert.deepEqual(ids({ wmax: "60" }), ["test-aero", "test-kora"]);
  assert.deepEqual(ids({ wmin: "60", dmax: "80" }), ["test-nola"]);
  assert.deepEqual(ids({ wmax: "60", material: "wood" }), ["test-aero"], "filters combine");
  assert.deepEqual(filterCollection([piece("unmeasured")], collectionQuery({ wmax: "90" })), [], "an unmeasured piece is not assumed to fit");
});

test("a collection's facets count its pieces, most common first, and its category lists its own collections", () => {
  const facets = facetCounts([nola, aero, table]);
  assert.deepEqual(facets.materials.map((facet) => [facet.label, facet.count]), [["Wood", 2], ["Fabric", 2], ["Metal", 1], ["Marble & stone", 1]]);
  assert.deepEqual(facets.colours[0], { key: "brown", label: "Brown", count: 2 });
  const accent = { ...nola, sourceTaxonomy: { productType: "chair", category: "Accent", subCategory: null } };
  const dining = { ...aero, sourceTaxonomy: { productType: "chair", category: "Dining", subCategory: null } };
  const chairs = collectionCategories([accent, dining, table], "accent-chair");
  assert.deepEqual(chairs.map((family) => [family.title, family.count, family.current, family.kind]), [["Dining Chairs", 1, false, "collection"], ["Accent Chairs", 1, true, "collection"]]);
  assert.deepEqual(collectionCategories([accent, dining, table], "all").map((category) => [category.title, category.count, category.kind]), [["Chairs", 2, "filter"], ["Tables", 1, "filter"]]);
});

// ---- The page --------------------------------------------------------------------------------
const facets: CollectionFacets = {
  materials: [{ key: "wood", label: "Wood", count: 9 }, { key: "fabric", label: "Fabric", count: 7 }],
  colours: [{ key: "cream", label: "Cream", count: 5 }, { key: "blue", label: "Blue", count: 2 }],
  categories: [{ handle: "dining-chair", title: "Dining Chairs", count: 4, current: false, kind: "collection" }, { handle: "accent-chair", title: "Accent Chairs", count: 12, current: true, kind: "collection" }],
  cover: { image: "https://cdn.example.com/aero.jpg", title: "Aero Dining Chair", handle: "aero-dining-chair", pricePaise: 2_360_000, priceFrom: false },
};
const card = (handle: string, title: string) => toProductCard({ id: handle, handle, title, images: [`https://cdn.example.com/${handle}.jpg`], category: "chairs",
  variants: [{ pricePaise: 2_360_000, compareAtPaise: 2_714_000, title: "Default Title" }] });
async function mount(node: React.ReactNode, check: (doc: Document) => void | Promise<void>) {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost:3000/collections/accent-chair" });
  Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ items: [], itemCount: 0, subtotalPaise: 0, currency: "INR", mutationContext: { cartIdentity: "a".repeat(64), revision: 0 }, checkoutEnabled: false, mode: "preview" });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<ShopProvider>{node}</ShopProvider>));
    await check(document);
  } finally { await act(async () => root.unmount()); globalThis.fetch = previous; dom.window.close(); }
}
const listing = (raw: Record<string, string> = {}) => (
  <CollectionListing handle="accent-chair" title="Accent Chairs" headingLevel="h2" query={collectionQuery(raw)} products={[card("ario", "Ario"), card("arno", "Arno")]}
    total={2} collectionTotal={12} limit={24} inStock={0} outOfStock={12} highestPrice={6_500_000} facets={facets} />
);
const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim();

test("the filters card: availability, price range, the category's collections, material, colour, size and Apply", async () => {
  await mount(listing(), (doc) => {
    const form = doc.querySelector<HTMLFormElement>("[data-filters] form.collection-filter-form")!;
    assert.equal(form.getAttribute("action"), "/collections/accent-chair");
    assert.deepEqual([...form.querySelectorAll("h3")].map(text), ["Availability", "Price range", "Category", "Material", "Colour", "Size"]);
    assert.deepEqual([...form.querySelectorAll<HTMLInputElement>("input[name=availability]")].map((box) => [box.type, box.value, text(box.closest("label"))]), [["checkbox", "in", "In stock"], ["checkbox", "out", "Made to order"]]);
    assert.equal(form.querySelector<HTMLInputElement>("input[name=max]")!.placeholder, "65,000", "the collection's highest price");
    const families = [...form.querySelectorAll<HTMLAnchorElement>("[data-filter-categories] a")];
    assert.deepEqual(families.map((link) => [text(link), link.getAttribute("href"), link.getAttribute("aria-current")]), [["Dining Chairs +", "/collections/dining-chair", null], ["Accent Chairs +", "/collections/accent-chair", "page"]]);
    assert.deepEqual([...form.querySelectorAll<HTMLInputElement>("input[name=material]")].map((box) => [box.value, text(box.closest("label"))]), [["wood", "Wood"], ["fabric", "Fabric"]]);
    assert.deepEqual([...form.querySelectorAll<HTMLInputElement>("input[name=colour]")].map((box) => box.value), ["cream", "blue"]);
    assert.deepEqual([...form.querySelectorAll("[data-filter-size] summary")].map(text), ["Width +", "Depth +"]);
    assert.deepEqual([...form.querySelectorAll<HTMLInputElement>("[data-filter-size] input")].map((input) => input.name), ["wmin", "wmax", "dmin", "dmax"]);
    assert.equal(text(form.querySelector("button[type=submit]")), "Apply filters →");
    assert.equal(doc.querySelector<HTMLAnchorElement>("[data-filters] a[data-clear-filters]")?.getAttribute("href"), "/collections/accent-chair");
  });
});

test("ticked filters stay ticked, and each can be removed on its own", async () => {
  await mount(listing({ material: "wood", colour: "blue", availability: "out", wmax: "80" }), (doc) => {
    const form = doc.querySelector("form.collection-filter-form")!;
    assert.equal(form.querySelector<HTMLInputElement>("input[name=material][value=wood]")!.defaultChecked, true);
    assert.equal(form.querySelector<HTMLInputElement>("input[name=colour][value=blue]")!.defaultChecked, true);
    assert.equal(form.querySelector<HTMLInputElement>("input[name=availability][value=out]")!.defaultChecked, true);
    assert.equal(form.querySelector<HTMLInputElement>("input[name=wmax]")!.defaultValue, "80");
    assert.equal(form.querySelector<HTMLDetailsElement>("[data-filter-size] details")!.open, true, "a set size stays open");
    const chips = [...doc.querySelectorAll<HTMLAnchorElement>(".collection-filter-chip")];
    assert.deepEqual(chips.map(text), ["Made to order", "Wood", "Blue", "Width up to 80 cm"]);
    const wood = new URL(chips[1]!.href);
    assert.equal(wood.searchParams.get("material"), null);
    assert.equal(wood.searchParams.get("colour"), "blue", "the others stay");
  });
});

test("the results: heading, count, sort, four-across cards and the custom order invitation", async () => {
  await mount(listing(), (doc) => {
    const results = doc.querySelector("[data-results]")!;
    assert.equal(text(results.querySelector("h2")), "All accent chairs");
    assert.equal(text(results.querySelector("[data-results-count]")), "2 products");
    assert.equal(results.querySelector<HTMLSelectElement>("select#collection-sort")!.value, "title");
    assert.equal(results.querySelectorAll(".collection-products [data-product-card]").length, 2);
    const custom = results.querySelector("[data-custom-order]")!;
    assert.equal(text(custom.querySelector("h2")), "Can’t find what you’re looking for?");
    assert.equal(custom.querySelector("a")?.getAttribute("href"), "/pages/contact");
    assert.equal(text(custom.querySelector("a")), "Request custom order →");
  });
});

test("the immersive hero: the trail, the collection's name and line, and its first piece featured with price and link", () => {
  const html = new JSDOM(renderToStaticMarkup(<CollectionHero title={heroTitle("chairs", "Chairs")} crumb="Chairs" intro={collectionIntro("chairs")} cover={facets.cover} />)).window.document;
  assert.deepEqual([...html.querySelectorAll("nav[aria-label=Breadcrumb] li")].map(text), ["Home", "/", "Collections", "/", "Chairs"]);
  assert.deepEqual([...html.querySelectorAll("nav[aria-label=Breadcrumb] a")].map((link) => link.getAttribute("href")), ["/", "/collections/all"]);
  assert.equal(text(html.querySelector("h1")), "Dining & Accent Chairs", "the frame's own title for chairs");
  assert.equal(text(html.querySelector("[data-hero-line]")), "Made for long conversations.");
  const featured = html.querySelector("[data-featured-product]")!;
  assert.deepEqual([...featured.querySelectorAll("p")].map(text), ["Featured product", "Aero Dining Chair", "Rs. 23,600.00"]);
  assert.equal(featured.querySelector("a")?.getAttribute("href"), "/products/aero-dining-chair");
  assert.equal(text(featured.querySelector("a")), "Discover the chair →");
  assert.equal(heroTitle("accent-chair", "Accent Chairs"), "Accent Chairs");
  const plain = new JSDOM(renderToStaticMarkup(<CollectionHero title="All Furniture" crumb="All Furniture" intro={collectionIntro(null)} cover={null} />)).window.document;
  assert.equal(text(plain.querySelector("[data-hero-line]")), "Made to be lived with.");
  assert.equal(plain.querySelector("[data-featured-product]"), null, "no piece, no featured card");
});

test("the API's facets keep to their shape, and a page from before them still reads", () => {
  assert.equal(collectionFacetsSchema.safeParse(facets).success, true);
  assert.equal(collectionFacetsSchema.safeParse({ ...facets, cover: { image: "http://insecure.example/a.jpg", title: "A" } }).success, false);
});
