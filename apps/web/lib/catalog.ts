import "server-only";
import { productListSchema, productSchema, catalogueCardsResponseSchema, type CollectionQuery } from "@shopmaple/contracts";
import { createCatalogueCache } from "./catalogue-cache";
import { parseCataloguePage } from "./catalogue-responses";
import { isProductHandle } from "./recent-products";
const readCatalogue = createCatalogueCache();
const api = () => process.env.API_URL ?? "http://127.0.0.1:4100";
export async function getProducts(query: Record<string, string> = {}) {
  const url = api() + "/api/products?" + new URLSearchParams(query);
  return readCatalogue(url, async () => {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error("Catalogue is temporarily unavailable.");
    return productListSchema.parse(await response.json());
  });
}
export async function getProduct(handle: string) {
  const url = api() + "/api/products/" + encodeURIComponent(handle);
  return readCatalogue(url, async () => {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("Product is temporarily unavailable.");
    return productSchema.parse(await response.json());
  });
}

/** One deadline covers headers and body even if the transport ignores cancellation. */
async function readCompact(url: string): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new Error("Catalogue is temporarily unavailable.")); controller.abort(); }, 6000);
  });
  try {
    return await Promise.race([expired, (async () => {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Catalogue is temporarily unavailable.");
      return response.json();
    })()]);
  } finally { clearTimeout(timer); }
}

export async function getCollectionPage(handle: string, query: CollectionQuery) {
  const params = new URLSearchParams({ limit: "24" });
  for (const [key, value] of Object.entries(query)) if (value !== "") params.set(key, String(value));
  const url = api() + "/api/catalogue/collections/" + encodeURIComponent(handle) + "?" + params;
  return readCatalogue(url, async () => parseCataloguePage(await readCompact(url), handle, query, 24));
}

export async function getProductCards(handles: string[]) {
  if (!handles.every(isProductHandle)) throw new Error("Invalid catalogue handles");
  const unique = [...new Set(handles)];
  const batches = Array.from({ length: Math.ceil(unique.length / 50) }, (_, index) => unique.slice(index * 50, (index + 1) * 50));
  const results = await Promise.all(batches.map(async batch => {
    const url = api() + "/api/catalogue/cards?" + new URLSearchParams({ handles: batch.join(",") });
    return readCatalogue(url, async () => {
      const result = catalogueCardsResponseSchema.parse(await readCompact(url));
      let previous = -1;
      for (const product of result.products) {
        const position = batch.indexOf(product.handle);
        if (position <= previous) throw new Error("Invalid catalogue response");
        previous = position;
      }
      return result.products;
    });
  }));
  return results.flat();
}
