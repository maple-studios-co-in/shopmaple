import test from "node:test";
import assert from "node:assert/strict";
import { collectionCategories, collectionMembers } from "@shopmaple/contracts/catalogue-registry";
import type { CollectionProduct } from "@shopmaple/contracts";

type Taxonomy = { productType: string; category: string | null; subCategory: string | null };
const product = (handle: string, sourceTaxonomy?: Taxonomy | null, category = "chairs") => ({
  handle, title: "Dining lounge accent coffee sofa chair", description: "King wooden fabric recliner",
  category, variants: [], sourceTaxonomy,
} satisfies CollectionProduct & { sourceTaxonomy?: Taxonomy | null });
const handles = (products: ReturnType<typeof product>[], collection: string) =>
  collectionMembers(products, collection).map((item) => item.handle);

// The curated lists name Keeri products: a retired Shopify-only piece became its Keeri replacement in place
// (naro-dining-chair → naro, 11 Nov 2026), so the curated order holds.
test("preserves curated membership order rather than catalogue input order", () => {
  assert.deepEqual(handles([product("arven"), product("unlisted"), product("naro"), product("naro-dining-chair")], "dining-chair"),
    ["naro", "arven"]);
});

test("marketing, bestseller and named campaign collections retain curated membership", () => {
  const products = [product("unlisted", { productType: "Chair", category: "Accent", subCategory: null })];
  for (const collection of ["bestseller-chairs", "clearance-sale", "minimum-60-off", "best-buy-under-rs-50-000", "furniture-store-under-rs-25-000", "nimbus", "bedroom-nimbus", "frontpage", "luxe-velvet-hotel-lounge"])
    assert.deepEqual(handles(products, collection), [], collection);
});

test("missing and unknown taxonomy never guesses functional membership from title, description or broad category", () => {
  const products = [product("missing"), product("null", null), product("unknown", { productType: "Unknown", category: "Dining", subCategory: "Accent" })];
  for (const collection of ["dining-chair", "accent-chair", "dining", "fabric-beds", "king-size-beds", "recliners"])
    assert.deepEqual(handles(products, collection), [], collection);
});

// Removing the source taxonomy union loses Keeri-only dining chairs; ignoring type admits dining tables.
test("dining chair aliases append explicit Keeri chairs after the curated order and deduplicate handles", () => {
  const products = [
    product("keeri-chair", { productType: " Chair ", category: " DINING ", subCategory: null }),
    product("arven", { productType: "chair", category: "Dining", subCategory: null }),
    product("keeri-table", { productType: "table", category: "Dining", subCategory: null }, "tables"),
    product("naro"),
    product("keeri-chair", { productType: "chair", category: "Dining", subCategory: null }),
  ];
  for (const collection of ["dining-chair", "dining-chairs-1"])
    assert.deepEqual(handles(products, collection), ["naro", "arven", "keeri-chair"], collection);
});

test('functional collection aliases follow explicit source taxonomy without crossing furniture types',()=>{
 const examples:[string,string,string|null,string[]][]=[
 ['chair','Arm',null,['arm-chair']],['chair','Rocking','NOR',['rocking-chair','rocking-chairs']],
 ['chair','Accent','WIN',['accent-chair','lounge-wing-chair','wing-chair']],
 ['chair','Accent','LOU',['accent-chair','lounge-wing-chair']],['chair','Lounge',null,['lounge-wing-chair']],
 ['table','Dining','8 Seater',['dining','dinings']],['table','Sofa/Coffee Table',null,['center-tables','center-tables-1','sofa-table']],
 ['table','Side',null,['side-table']],['table','Console',null,['console-tables','consoles']],
 ['table','TV & Media Units',null,['tv-media-units']],['bed','Bedroom','Fabric Beds',['fabric-beds']],
 ['bed','Bedroom','Solid Wood Beds',['solid-wood-beds']],
 ['Beds','Bedroom','Kids Beds',['kids-beds']],['crib','Bedroom',null,['kids-beds']],['Outdoors','Outdoor Sets',null,['outdoor-furnitures']],['sofa','3 Seater',null,['3-seater-sofa']],
 ['sofa','5 Seater',null,['5-seater-sofa']],['sofa','7+ Seater',null,['7-seater-sofa']],
 ];
 for(const [productType,category,subCategory,routes] of examples){
  const item=product('keeri-only',{productType,category,subCategory});
  for(const route of routes)assert.deepEqual(handles([item],route),['keeri-only'],`${productType}/${category}/${route}`);
 }
});

// Kids Beds (owner, 12 Nov 2026) holds Keeri's kids' beds and cribs and nothing else from the bedroom.
test("kids beds take only Keeri's kids' beds and cribs", () => {
  const products = [
    product("cot", { productType: "Beds", category: "Bedroom", subCategory: "Kids Beds" }, "beds"),
    product("crib", { productType: "crib", category: null, subCategory: null }, "beds"),
    product("fabric", { productType: "Beds", category: "Bedroom", subCategory: "Fabric Beds" }, "beds"),
    product("chair", { productType: "chair", category: "Bedroom sofa chair", subCategory: "Kids Beds" }),
  ];
  assert.deepEqual(handles(products, "kids-beds"), ["cot", "crib"]);
});

// Office Chairs (owner, 12 Nov 2026): Keeri files them as Chair › Office Chairs (code OFC). They join the chairs
// family's Category filter and stay out of the dining chairs.
test("office chairs take only Keeri chairs filed under Office Chairs", () => {
  const products = [
    product("ergo", { productType: "Chair", category: "Office Chairs", subCategory: null }),
    product("task", { productType: " chairs ", category: " OFFICE CHAIRS ", subCategory: "OFC" }),
    product("dining", { productType: "Chair", category: "Dining", subCategory: null }),
    product("desk", { productType: "Table", category: "Office Chairs", subCategory: null }, "tables"),
    product("untagged"),
  ];
  assert.deepEqual(handles(products, "office-chairs"), ["ergo", "task"]);
  assert.deepEqual(handles(products, "dining-chair"), ["dining"]);
  const filter = collectionCategories(products.filter((item) => item.category === "chairs"), "office-chairs");
  assert.deepEqual(filter.find((item) => item.handle === "office-chairs"), { handle: "office-chairs", title: "Office Chairs", count: 2, current: true, kind: "collection" });
});
