import { v2Fixture } from "./keeri-v2.js";

// Synthetic approved assets, deliberately exceeding the former per-product limit.
export function largeGalleryFixture(count = 37, relation: "model" | "variant" = "model") {
  const data = v2Fixture();
  const model = data.models[0]!;
  const variant = model.variants[0]!;
  const media = Array.from({ length: count }, (_, i) => ({
    id: `gallery-${i}`, tenantId: "maple", modelId: "model1",
    variantId: relation === "variant" ? "variant1" : null,
    stage: "approved", storageKey: `maple/approved/gallery-${i}.webp`,
    supersededAt: null, position: i,
  }));
  model.media = relation === "model" ? media : [];
  variant.media = relation === "variant" ? media : [];
  data.publicMedia = media.map(asset => ({
    assetId: asset.id, url: `https://store.maplefurnishers.com/media/keeri/${asset.id}.webp`,
  }));
  return data;
}
