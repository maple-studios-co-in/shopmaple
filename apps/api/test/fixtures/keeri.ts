// Synthetic projection of the verified Keeri Prisma fields; no merchant records.
export function keeriFixture() {
  return {
    schemaVersion: 1,
    source: "keeri-export",
    complete: true,
    tenantId: "maple",
    capturedAt: "2026-10-25T10:00:00Z",
    publication: [{ modelId: "model1", handle: "zyro-chair", category: "chairs" }],
    publicMedia: [{ assetId: "photo1", url: "https://media.example.com/zyro.webp" }],
    models: [{
      id: "model1", tenantId: "maple", name: "Zyro", productType: "chair",
      description: "Solid wood chair", status: "published", deletedAt: null,
      updatedAt: "2026-10-25T09:00:00Z",
      media: [{ id: "photo1", tenantId: "maple", modelId: "model1", variantId: null,
        stage: "approved", storageKey: "maple/approved/photo1.webp", supersededAt: null, position: 0 }],
      variants: [{ id: "variant1", tenantId: "maple", modelId: "model1", sku: "CH-ZYRO-LGDWBN",
        variantName: "Linen / Walnut", status: "published", published: true,
        deletedAt: null, stockPolicy: "stocked", updatedAt: "2026-10-25T09:15:00Z",
        prices: [{ kind: "mrp", amount: 1234567, currency: "INR", updatedAt: "2026-10-25T09:30:00Z" }],
        media: [] }],
    }],
  };
}
