import assert from "node:assert/strict";
import { test } from "node:test";
import { searchProducts } from "../lib/search-products";
const product = (handle:string) => ({id:handle,handle,title:handle,description:"",images:[],category:"chairs",published:true,source:"fixture",sourceUpdatedAt:"2026-10-26T00:00:00Z",variants:[]});
const list = (handles:string[],total=handles.length) => ({products:handles.map(product),total,page:1,limit:4,mode:"preview",checkoutEnabled:false});
test("already-cancelled search rejects before even an abort-ignoring transport starts", async () => {
  const old=globalThis.fetch; let calls=0;
  globalThis.fetch=async()=>{calls++;return new Promise(()=>{});};
  try {
    const controller=new AbortController();controller.abort();
    const result=searchProducts("oak",controller);void result.catch(()=>{});
    assert.equal(calls,0,"cancelled work must not start transport");await assert.rejects(result);
  } finally {globalThis.fetch=old;}
});
for (const [name,payload] of [
  ["negative count",list([], -1)],
  ["fractional count",list([], 1.5)],
  ["less total than displayed",list(["alpha","bravo"],1)],
  ["duplicate handles",list(["alpha","alpha"])],
  ["different page",{...list(["alpha"]),page:2}],
  ["different requested limit",{...list(["alpha"]),limit:50}],
] as const) test(`search rejects ${name} instead of showing contradictory results`,async()=>{
  const old=globalThis.fetch;globalThis.fetch=async()=>Response.json(payload);
  try {await assert.rejects(searchProducts("oak",new AbortController()));}finally{globalThis.fetch=old;}
});
