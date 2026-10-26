import { productListSchema, productSchema } from "@shopmaple/contracts";
import { toProductCard, type ProductCardModel } from "./product-card-model";
import { isProductHandle } from "./recent-products";

async function readPublic(url: string, controller: AbortController): Promise<unknown> {
  if (controller.signal.aborted) throw new Error("Search interrupted");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Error("Search interrupted"));
    controller.signal.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => controller.abort(), 6000);
  });
  try {
    return await Promise.race([cancelled, (async () => {
      const response = await fetch(url, { signal: controller.signal });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("Search unavailable");
      return response.json();
    })()]);
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener("abort", onAbort);
  }
}
export async function searchProducts(query: string, controller: AbortController) {
  const params = new URLSearchParams({ limit: "4", sort: "title" });
  if (query) params.set("q", query);
  const result = productListSchema.parse(await readPublic("/api/products?" + params, controller));
  if (!Number.isSafeInteger(result.total) || result.total < result.products.length || result.page !== 1 || result.limit !== 4 ||
      result.products.length > 4 || new Set(result.products.map(product => product.handle)).size !== result.products.length ||
      result.products.some(product => !product.published || !isProductHandle(product.handle)))
    throw new Error("Invalid search results");
  return { products: result.products.map(toProductCard), total: result.total };
}
export async function recentProduct(handle: string, controller: AbortController): Promise<ProductCardModel | null> {
  if (!isProductHandle(handle)) throw new Error("Invalid recent product");
  const data = await readPublic("/api/products/" + encodeURIComponent(handle), controller);
  if (data === null) return null;
  const product = productSchema.parse(data);
  if (product.handle !== handle || !product.published) throw new Error("Invalid recent product");
  return toProductCard(product);
}
