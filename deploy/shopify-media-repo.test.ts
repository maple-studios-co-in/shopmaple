import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { planRewrite, sourcesFile, sourcesText } from "../scripts/rewrite-shopify-media.js";

const root = fileURLToPath(new URL("..", import.meta.url));
async function files(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await files(path));
    else if (/\.(?:json|tsx?)$/.test(entry.name) && path !== sourcesFile) found.push(path);
  }
  return found;
}

test("the store's own data and code name no Shopify-hosted media, and the recorded list is current", async () => {
  const { changed, sources } = planRewrite(root);
  assert.deepEqual([...changed.keys()], [], "run: npx tsx scripts/rewrite-shopify-media.ts");
  assert.equal(sourcesText(root, sources), await readFile(join(root, sourcesFile), "utf8"), "run: npx tsx scripts/rewrite-shopify-media.ts");
});

test("every /media/shopify copy the data and code name is in the recorded list the server downloads from", async () => {
  const recorded = JSON.parse(await readFile(join(root, sourcesFile), "utf8")) as { files: Record<string, string> };
  const named = new Set<string>();
  for (const directory of ["apps/web/data", "apps/api/data", "apps/web/lib", "apps/web/components", "apps/web/app", "packages/contracts/data"])
    for (const file of await files(directory))
      for (const match of (await readFile(join(root, file), "utf8")).matchAll(/\/media\/shopify\/([a-f0-9]{32}\.[a-z0-9]+)/g)) named.add(match[1]!);
  assert.ok(named.size > 500);
  assert.deepEqual([...named].filter(name => !Object.hasOwn(recorded.files, name)), []);
});
