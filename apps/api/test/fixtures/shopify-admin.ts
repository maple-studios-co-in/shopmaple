export function shopifyFixture() {
  return {
    schemaVersion: 1,
    source: "shopify-admin",
    capturedAt: "2026-10-25T10:00:00Z",
    complete: true,
    products: [
      {
        id: "gid://shopify/Product/101",
        handle: "real-chair",
        title: "Real chair",
        description: "Actual description",
        productType: "Chair",
        updatedAt: "2026-10-25T09:00:00Z",
        status: "DRAFT",
        media: {
          nodes: [
            { image: { url: "https://cdn.shopify.com/s/files/1/chair.jpg" } },
          ],
        },
        variants: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            {
              id: "gid://shopify/ProductVariant/201",
              title: "Oak",
              sku: "CHAIR-OAK",
              price: "123.45",
              compareAtPrice: null,
            },
          ],
        },
      },
    ],
  };
}

export function shopifyPricedFixture() {
  return {
    ...shopifyFixture(),
    publicPrices: {
      source: "shopify-product-json",
      origin: "https://shop.maplefurnishers.com",
      country: "IN",
      currency: "INR",
      capturedAt: "2026-10-25T10:00:00Z",
      products: [
        {
          id: "gid://shopify/Product/101",
          variants: [
            {
              id: "gid://shopify/ProductVariant/201",
              pricePaise: 12345,
              compareAtPaise: 15000 as number | null,
            },
          ],
        },
      ],
    },
  };
}
