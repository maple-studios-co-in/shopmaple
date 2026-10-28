import assert from "node:assert/strict";
import { test } from "node:test";
import { adaptKeeriExportV2, keeriExportV2Schema } from "../src/keeri.js";
import { v2Fixture } from "./fixtures/keeri-v2.js";

// Keeri's catalogue v2 export gained three per-variant fields on 2026-10-27:
// `shipping` (packed carton measurements or null), `fulfilment` (stocked or
// made-to-order with a lead time, or null) and `eligibility` (whether the
// variant can be quoted and held today, with reason codes). The store does not
// act on them yet, but it must keep accepting the export, which is strict.
function withNewFields(overrides: Record<string, unknown> = {}) {
  const base = v2Fixture();
  return {
    ...base,
    models: base.models.map((m) => ({
      ...m,
      variants: m.variants.map((v) => ({
        ...v,
        shipping: { packedWeightGrams: 12000, cartonLengthCm: 120, cartonWidthCm: 60, cartonHeightCm: 45, cartonCount: 1 },
        fulfilment: { kind: "made_to_order", leadTimeDays: 21 },
        eligibility: { sellable: true, reasons: [] },
        ...overrides,
      })),
    })),
  };
}

test("the v2 export is accepted with shipping, fulfilment and eligibility on every variant", () => {
  const parsed = keeriExportV2Schema.parse(withNewFields());
  const variant = parsed.models[0]!.variants[0]!;
  assert.deepEqual(variant.shipping, { packedWeightGrams: 12000, cartonLengthCm: 120, cartonWidthCm: 60, cartonHeightCm: 45, cartonCount: 1 });
  assert.deepEqual(variant.fulfilment, { kind: "made_to_order", leadTimeDays: 21 });
  assert.deepEqual(variant.eligibility, { sellable: true, reasons: [] });
  const tenant = parsed.tenantId;
  assert.equal(adaptKeeriExportV2(withNewFields(), tenant).products.length > 0, true, "adaptation still produces products");
});

test("null shipping and fulfilment, and unsellable eligibility with reason codes, are accepted", () => {
  const parsed = keeriExportV2Schema.parse(
    withNewFields({
      shipping: null,
      fulfilment: null,
      eligibility: { sellable: false, reasons: ["price_missing", "not_selected", "approval_missing", "lead_time_missing"] },
    }),
  );
  const variant = parsed.models[0]!.variants[0]!;
  assert.equal(variant.shipping, null);
  assert.equal(variant.fulfilment, null);
  assert.equal(variant.eligibility?.sellable, false);
  assert.deepEqual(variant.eligibility?.reasons, ["price_missing", "not_selected", "approval_missing", "lead_time_missing"]);
});

test("the fields stay optional so an export from an older Keeri still parses", () => {
  assert.doesNotThrow(() => keeriExportV2Schema.parse(v2Fixture()));
});

test("malformed shipping measurements are rejected rather than stored", () => {
  assert.throws(() =>
    keeriExportV2Schema.parse(
      withNewFields({ shipping: { packedWeightGrams: 0, cartonLengthCm: 120, cartonWidthCm: 60, cartonHeightCm: 45, cartonCount: 1 } }),
    ),
  );
  assert.throws(() => keeriExportV2Schema.parse(withNewFields({ fulfilment: { kind: "dropship", leadTimeDays: null } })));
  assert.throws(() => keeriExportV2Schema.parse(withNewFields({ eligibility: { sellable: "yes", reasons: [] } })));
});
