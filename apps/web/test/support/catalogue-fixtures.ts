/** Synthetic HTTP fixtures: literal public fields, never production projection helpers. */
export const cardFixture = (handle: string, title = `${handle} Chair`) => ({
  id: handle, handle, title, image: null, pricePaise: 123400, compareAtPaise: null,
  priceFrom: false, otherOptionsOnRequest: false, optionCount: 1,
});
export const queryFixture = (q = "") => ({ q, sort: "title", availability: "", min: "", max: "", category: "", page: 1 });
export const cardEnvelope = (handle: string, title?: string) => ({ product: cardFixture(handle, title), published: true });
export const pageFixture = (handles: string[], total = handles.length, q = "") => ({
  handle: "all", query: queryFixture(q), products: handles.map(handle => cardFixture(handle)), total,
  collectionTotal: Math.max(total, handles.length), inStock: 0, outOfStock: Math.max(total, handles.length), highestPrice: 123400,
  limit: 4, published: true, mode: "preview", checkoutEnabled: false,
});
