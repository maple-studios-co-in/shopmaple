import test from "node:test";
import assert from "node:assert/strict";
import { collectionMembers } from "@shopmaple/contracts/catalogue-registry";
import type { CollectionProduct } from "@shopmaple/contracts";

type Taxonomy = { productType: string; category: string | null; subCategory: string | null };
const product = (handle: string, sourceTaxonomy?: Taxonomy | null, category = "chairs") => ({
  handle, title: "Dining lounge accent coffee sofa chair", description: "King wooden fabric recliner",
  category, variants: [], sourceTaxonomy,
} satisfies CollectionProduct & { sourceTaxonomy?: Taxonomy | null });
const handles = (products: ReturnType<typeof product>[], collection: string) =>
  collectionMembers(products, collection).map((item) => item.handle);

test("preserves Shopify membership order rather than catalogue input order", () => {
  assert.deepEqual(handles([product("arven"), product("unlisted"), product("naro-dining-chair")], "dining-chair"),
    ["naro-dining-chair", "arven"]);
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
test("dining chair aliases append explicit Keeri chairs after Shopify order and deduplicate handles", () => {
  const products = [
    product("keeri-chair", { productType: " Chair ", category: " DINING ", subCategory: null }),
    product("arven", { productType: "chair", category: "Dining", subCategory: null }),
    product("keeri-table", { productType: "table", category: "Dining", subCategory: null }, "tables"),
    product("naro-dining-chair"),
    product("keeri-chair", { productType: "chair", category: "Dining", subCategory: null }),
  ];
  for (const collection of ["dining-chair", "dining-chairs-1"])
    assert.deepEqual(handles(products, collection), ["naro-dining-chair", "arven", "keeri-chair"], collection);
});

test('functional collection aliases follow explicit source taxonomy without crossing furniture types',()=>{
 const examples:[string,string,string|null,string[]][]=[
 ['chair','Arm',null,['arm-chair']],['chair','Rocking','NOR',['rocking-chair','rocking-chairs']],
 ['chair','Accent','WIN',['accent-chair','lounge-wing-chair','wing-chair']],
 ['chair','Accent','LOU',['accent-chair','lounge-wing-chair']],['chair','Lounge',null,['lounge-wing-chair']],
 ['table','Dining','8 Seater',['dining','dinings']],['table','Sofa/Coffee Table',null,['center-tables','center-tables-1','sofa-table']],
 ['table','Side',null,['side-table']],['table','Console',null,['console-tables','consoles']],
 ['table','TV & Media Units',null,['tv-media-units']],['bed','Bedroom','Fabric Beds',['fabric-beds']],
 ['bed','Bedroom','Solid Wood Beds',['solid-wood-beds']],['sofa','3 Seater',null,['3-seater-sofa']],
 ['sofa','5 Seater',null,['5-seater-sofa']],['sofa','7+ Seater',null,['7-seater-sofa']],
 ];
 for(const [productType,category,subCategory,routes] of examples){
  const item=product('keeri-only',{productType,category,subCategory});
  for(const route of routes)assert.deepEqual(handles([item],route),['keeri-only'],`${productType}/${category}/${route}`);
 }
});
