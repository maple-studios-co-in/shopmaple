import assert from "node:assert/strict";
import { test } from "node:test";
import { searchProducts } from "../lib/search-products";
import { pageFixture } from "./support/catalogue-fixtures";
const list = (handles: string[], total = handles.length) => pageFixture(handles, total, "oak");
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
  ["different page",{...list(["alpha"]),query:{...list([]).query,page:2}}],
  ["different requested limit",{...list(["alpha"]),limit:50}],
] as const) test(`search rejects ${name} instead of showing contradictory results`,async()=>{
  const old=globalThis.fetch;globalThis.fetch=async()=>Response.json(payload);
  try {await assert.rejects(searchProducts("oak",new AbortController()));}finally{globalThis.fetch=old;}
});
