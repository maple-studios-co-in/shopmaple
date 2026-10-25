import assert from "node:assert/strict";
import { test } from "node:test";
import { productSchema, cartSchema } from "@shopmaple/contracts";

const model = {id:"keeri:maple:model-only", handle:"keeri-model-only", title:"Source model", description:"", category:null, images:[], published:true, source:"keeri:maple", sourceUpdatedAt:"2026-10-26T00:00:00Z", variants:[]};

test("a model without category, images or variants remains representable as a public enquiry listing", () => {
  const result = productSchema.safeParse(model);
  assert.equal(result.success, true);
});

test("missing catalogue price is explicit null rather than a fabricated zero price", () => {
  const result=productSchema.safeParse({...model, variants:[{id:"keeri:maple:variant", title:"Source variant", sku:null, pricePaise:null, compareAtPaise:null, available:false, stockPolicy:"unverified"}]});
  assert.equal(result.success,true);
  if(result.success) assert.equal(result.data.variants[0]!.pricePaise,null);
});

test("a legacy cart with an unpriced item carries unknown line and subtotal amounts", () => {
  const result=cartSchema.safeParse({items:[{variantId:"unpriced",handle:"source-model",title:"Source model",variantTitle:"Option",image:"",pricePaise:null,quantity:1,lineTotalPaise:null,available:false,stockPolicy:"unverified"}],itemCount:1,subtotalPaise:null,currency:"INR",checkoutEnabled:false,mode:"preview"});
  assert.equal(result.success,true);
});
