import "server-only";
import { productListSchema, productSchema } from "@shopmaple/contracts";
import { createCatalogueCache } from "./catalogue-cache";
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
