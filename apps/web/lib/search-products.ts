import { collectionQuery } from "@shopmaple/contracts";
import type { ProductCardModel } from "./product-card-model";
import { isProductHandle } from "./recent-products";
import { parseCataloguePage, parseCatalogueCard } from "./catalogue-responses";

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
  const normalized = collectionQuery({ q: query });
  const params = new URLSearchParams({ limit: "4", sort: "title" });
  if (normalized.q) params.set("q", normalized.q);
  const result = parseCataloguePage(await readPublic("/api/catalogue/collections/all?" + params, controller), "all", normalized, 4);
  return { products: result.products, total: result.total };
}
export async function recentProduct(handle: string, controller: AbortController): Promise<ProductCardModel | null> {
  if (!isProductHandle(handle)) throw new Error("Invalid recent product");
  const data = await readPublic("/api/catalogue/cards/" + encodeURIComponent(handle), controller);
  if (data === null) return null;
  return parseCatalogueCard(data, handle);
}
