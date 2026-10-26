import assert from "node:assert/strict";
import { test } from "node:test";
import { getCollectionPage, getProductCards } from "../lib/catalog";
import { cardFixture, pageFixture, queryFixture } from "./support/catalogue-fixtures";

let sequence = 0;
async function isolated(run: () => Promise<void>) {
  const previous = globalThis.fetch, api = process.env.API_URL;
  process.env.API_URL = `http://compact-cache-${++sequence}.invalid`;
  try { await run(); } finally { globalThis.fetch = previous; if (api === undefined) delete process.env.API_URL; else process.env.API_URL = api; }
}
const page = () => ({ ...pageFixture(["oak"]), limit: 24 });

test("compact collection readers coalesce, isolate returned values and retry invalid responses", async () => {
  await isolated(async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json(page()); };
    const results = await Promise.all(Array.from({ length: 20 }, () => getCollectionPage("all", queryFixture())));
    assert.equal(calls, 1); results[0]!.products[0]!.title = "Changed by one reader";
    assert.equal(results[1]!.products[0]!.title, "oak Chair");
    globalThis.fetch = async () => { calls++; return Response.json({ ...page(), handle: "chairs" }); };
    await assert.rejects(getCollectionPage("all", queryFixture("retry")));
    globalThis.fetch = async () => { calls++; return Response.json({ ...page(), query: queryFixture("retry") }); };
    assert.equal((await getCollectionPage("all", queryFixture("retry"))).products[0]!.title, "oak Chair");
    assert.equal(calls, 3, "wrong-identity responses cannot poison cache recovery");
  });
});

test("curated card reads batch at fifty, preserve caller order and allow missing products", async () => {
  await isolated(async () => {
    const requests: string[][] = [];
    globalThis.fetch = async input => {
      const url = new URL(String(input)); assert.equal(url.pathname, "/api/catalogue/cards");
      const handles = url.searchParams.get("handles")!.split(","); requests.push(handles);
      return Response.json({ products: handles.filter(handle => handle !== "item-51").map(handle => cardFixture(handle)), published: true });
    };
    const handles = Array.from({ length: 103 }, (_, index) => `item-${index}`);
    const result = await getProductCards([...handles, "item-0"]);
    assert.deepEqual(requests.map(batch => batch.length), [50, 50, 3]);
    assert.deepEqual(result.map(product => product.handle), handles.filter(handle => handle !== "item-51"));
    assert.equal((await getProductCards([])).length, 0); assert.equal(requests.length, 3);
    await assert.rejects(getProductCards(["../private"])); assert.equal(requests.length, 3);
  });
});

for (const [name, products] of [
  ["unrequested identity", [cardFixture("wrong")]],
  ["duplicate identity", [cardFixture("alpha"), cardFixture("alpha")]],
  ["wrong caller order", [cardFixture("bravo"), cardFixture("alpha")]],
] as const) test(`curated card reads reject ${name} without full-record fallback`, async () => {
  await isolated(async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json({ products, published: true }); };
    await assert.rejects(getProductCards(["alpha", "bravo"])); assert.equal(calls, 1);
  });
});

for (const phase of ["headers", "body"] as const) test(`compact collection ${phase} timeout includes the complete six-second deadline and permits recovery`, async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await isolated(async () => {
      let signal: AbortSignal | null | undefined;
      let finish!: (value: never) => void;
      globalThis.fetch = async (_input, init) => {
        signal = init?.signal;
        if (phase === "headers") return new Promise<Response>(resolve => { finish = resolve; });
        const response = Response.json(page());
        response.json = () => new Promise(resolve => { finish = resolve; });
        return response;
      };
      let settled = false;
      const pending = getCollectionPage("all", queryFixture());
      void pending.then(() => { settled = true; }, () => { settled = true; });
      await Promise.resolve(); await Promise.resolve();
      t.mock.timers.tick(5999); await Promise.resolve();
      assert.equal(settled, false);
      t.mock.timers.tick(1);
      await assert.rejects(pending, /temporarily unavailable/); assert.equal(signal?.aborted, true);
      globalThis.fetch = async () => Response.json(page());
      assert.equal((await getCollectionPage("all", queryFixture())).products[0]!.handle, "oak");
      finish((phase === "headers" ? Response.json({ ...page(), products: [cardFixture("stale")] }) : { ...page(), products: [cardFixture("stale")] }) as never);
      await Promise.resolve();
      assert.equal((await getCollectionPage("all", queryFixture())).products[0]!.handle, "oak", "late body cannot replace recovered cache entry");
    });
  } finally { t.mock.timers.reset(); }
});
