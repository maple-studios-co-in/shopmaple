import assert from "node:assert/strict";
import { test } from "node:test";
import { createCatalogueCache } from "../lib/catalogue-cache";

test("simultaneous catalogue visitors share one read, with isolated results and bounded freshness", async () => {
  let clock = 0;
  let loads = 0;
  const read = createCatalogueCache({ now: () => clock, ttlMs: 30_000 });
  const load = async () => { loads++; return { products: [{ title: "Maple chair" }] }; };
  const [first, second] = await Promise.all([read("page-1", load), read("page-1", load)]);
  assert.equal(loads, 1, "Concurrent readers should reuse the same backend request");
  first.products[0]!.title = "Changed by caller";
  assert.equal(second.products[0]!.title, "Maple chair");
  clock = 29_999;
  assert.equal((await read("page-1", load)).products[0]!.title, "Maple chair");
  assert.equal(loads, 1);
  clock = 30_000;
  await read("page-1", load);
  assert.equal(loads, 2, "The next read must refresh after thirty seconds");
});

test("failed catalogue reads are retried and cache capacity evicts the least recently used entry", async () => {
  let attempts = 0;
  const read = createCatalogueCache({ maxEntries: 2 });
  const flaky = async () => { attempts++; if (attempts === 1) throw new Error("upstream unavailable"); return ["restored"]; };
  await assert.rejects(read("flaky", flaky), /upstream unavailable/);
  assert.deepEqual(await read("flaky", flaky), ["restored"]);
  let loads = 0;
  const load = async () => { loads++; return loads; };
  await read("one", load);
  await read("two", load);
  await read("one", load);
  assert.equal(loads, 2);
  await read("three", load);
  await read("two", load);
  assert.equal(loads, 4, "The bounded cache must evict old keys instead of growing indefinitely");
});
