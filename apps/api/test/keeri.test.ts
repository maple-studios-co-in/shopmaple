import assert from "node:assert/strict";
import { test } from "node:test";
import { adaptKeeriExport } from "../src/keeri.js";
import { keeriFixture } from "./fixtures/keeri.js";

test("Keeri MRP paise and stable source identities survive adaptation; stock remains unavailable", () => {
  const result = adaptKeeriExport(keeriFixture(), "maple");
  assert.equal(result.source, "keeri:maple");
  assert.equal(result.products[0]?.id, "keeri:maple:model1");
  assert.deepEqual(result.products[0]?.variants[0], {
    id: "keeri:maple:variant1",
    title: "Linen / Walnut",
    sku: "CH-ZYRO-LGDWBN",
    pricePaise: 1234567,
    compareAtPaise: null,
    available: false,
    stockPolicy: "stocked",
  });
  assert.deepEqual(result.products[0]?.images, [
    "https://media.example.com/zyro.webp",
  ]);
  assert.equal(result.products[0]?.sourceUpdatedAt, "2026-10-25T10:00:00Z");
});

test("draft, approved-only, deleted and unpublished source records never become public", () => {
  for (const change of [
    (x: ReturnType<typeof keeriFixture>) => {
      x.models[0]!.status = "approved";
    },
    (x: ReturnType<typeof keeriFixture>) => {
      x.models[0]!.variants[0]!.published = false;
    },
    (x: ReturnType<typeof keeriFixture>) => {
      x.models[0]!.variants[0]!.status = "draft";
    },
  ]) {
    const input = keeriFixture();
    change(input);
    assert.equal(adaptKeeriExport(input, "maple").products.length, 0);
  }
  const input = keeriFixture();
  assert.equal(
    adaptKeeriExport(
      {
        ...input,
        models: [{ ...input.models[0], deletedAt: input.capturedAt }],
      },
      "maple",
    ).products.length,
    0,
  );
});

test("only approved current stored media with an explicit public URL can be published", () => {
  for (const media of [
    { stage: "raw" },
    { supersededAt: "2026-10-24T00:00:00Z" },
    { storageKey: null },
  ]) {
    const input = keeriFixture();
    assert.equal(
      adaptKeeriExport(
        {
          ...input,
          models: [
            {
              ...input.models[0],
              media: [{ ...input.models[0]!.media[0], ...media }],
            },
          ],
        },
        "maple",
      ).products.length,
      0,
    );
  }
  assert.equal(
    adaptKeeriExport({ ...keeriFixture(), publicMedia: [] }, "maple").products
      .length,
    0,
  );
});

test("tenant mismatch, duplicate identities, incomplete snapshots and unsafe commercial data fail closed", () => {
  const input = keeriFixture();
  assert.throws(() => adaptKeeriExport(input, "another"));
  assert.throws(() => adaptKeeriExport({ ...input, complete: false }, "maple"));
  assert.throws(() =>
    adaptKeeriExport(
      { ...input, models: [...input.models, ...input.models] },
      "maple",
    ),
  );
  for (const patch of [
    { amount: 12.34 },
    { amount: -1 },
    { currency: "USD" },
  ]) {
    const fixture = keeriFixture();
    Object.assign(fixture.models[0]!.variants[0]!.prices[0]!, patch);
    assert.throws(() => adaptKeeriExport(fixture, "maple"));
  }
  const wrongTenant = keeriFixture();
  wrongTenant.models[0]!.variants[0]!.tenantId = "other";
  assert.throws(() => adaptKeeriExport(wrongTenant, "maple"));
});

test("missing MRP, absent publication mapping and empty full snapshots retire records instead of inventing data", () => {
  const input = keeriFixture();
  input.models[0]!.variants[0]!.prices = [];
  assert.equal(adaptKeeriExport(input, "maple").products.length, 0);
  assert.equal(
    adaptKeeriExport({ ...keeriFixture(), publication: [] }, "maple").products
      .length,
    0,
  );
  assert.deepEqual(
    adaptKeeriExport(
      { ...keeriFixture(), models: [], publication: [], publicMedia: [] },
      "maple",
    ).products,
    [],
  );
});

test("unpublished variant media cannot leak through the model media relation", () => {
  const input = keeriFixture();
  const hidden = structuredClone(input.models[0]!.variants[0]!);
  hidden.id = "hidden";
  hidden.sku = "HIDDEN";
  hidden.published = false;
  input.models[0]!.variants.push(hidden);
  const photo = { ...input.models[0]!.media[0]!, variantId: "hidden" };
  assert.equal(
    adaptKeeriExport(
      { ...input, models: [{ ...input.models[0], media: [photo] }] },
      "maple",
    ).products.length,
    0,
  );
});

test("Keeri CLI dry-run needs no database and apply rejects production or nonlocal targets", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const directory = await mkdtemp(join(tmpdir(), "shopmaple-keeri-"));
  try {
    const file = join(directory, "export.json");
    await writeFile(file, JSON.stringify(keeriFixture()));
    const args = [
      "--import",
      "tsx",
      fileURLToPath(
        new URL("../../../scripts/import-keeri.ts", import.meta.url),
      ),
      file,
      "maple",
    ];
    const result = await promisify(execFile)(process.execPath, args, {
      env: { ...process.env, DATABASE_URL: "not-a-database" },
    });
    assert.deepEqual(JSON.parse(result.stdout), {
      source: "keeri:maple",
      capturedAt: "2026-10-25T10:00:00Z",
      imported: 1,
      omitted: 0,
      checkoutEnabled: false,
      dryRun: true,
    });
    await assert.rejects(
      promisify(execFile)(process.execPath, [...args, "--apply"], {
        env: { ...process.env, NODE_ENV: "production" },
      }),
      /disabled in production/,
    );
    await assert.rejects(
      promisify(execFile)(process.execPath, [...args, "--apply"], {
        env: {
          ...process.env,
          NODE_ENV: "development",
          DATABASE_URL: "postgresql://test@example.com/shopmaple",
        },
      }),
      /dedicated local/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("tenant and source IDs containing hyphens cannot collide across sources", () => {
  const left = keeriFixture();
  left.tenantId = "maple-delhi";
  left.models[0]!.tenantId = "maple-delhi";
  left.models[0]!.variants[0]!.tenantId = "maple-delhi";
  left.models[0]!.media[0]!.tenantId = "maple-delhi";
  const right = keeriFixture();
  right.models[0]!.id = "delhi-model1";
  right.models[0]!.variants[0]!.modelId = "delhi-model1";
  right.models[0]!.variants[0]!.id = "delhi-variant1";
  right.models[0]!.media[0]!.modelId = "delhi-model1";
  right.publication[0]!.modelId = "delhi-model1";
  const a = adaptKeeriExport(left, "maple-delhi").products[0]!;
  const b = adaptKeeriExport(right, "maple").products[0]!;
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.variants[0]!.id, b.variants[0]!.id);
});
