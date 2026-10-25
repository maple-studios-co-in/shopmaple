import { keeriExportV2Schema } from "../../src/keeri.js";
import { keeriFixture } from "./keeri.js";
export function v2Fixture() {
  const old = keeriFixture();
  return keeriExportV2Schema.parse({
    ...old,
    schemaVersion: 2,
    models: old.models.map((m) => ({
      ...m,
      status: "draft",
      channelPublished: true,
      shopifyProductId: null,
      variants: m.variants.map((v) => ({
        ...v,
        status: "draft",
        published: false,
        channelPublished: true,
        shopifyProductId: null,
        shopifyVariantId: null,
      })),
    })),
  });
}
