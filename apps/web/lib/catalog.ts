import "server-only";
import { productListSchema, productSchema } from "@shopmaple/contracts";
const api = () => process.env.API_URL ?? "http://127.0.0.1:4100";
export async function getProducts(query: Record<string, string> = {}) {
  const response = await fetch(
    api() + "/api/products?" + new URLSearchParams(query),
    { next: { revalidate: 30 }, signal: AbortSignal.timeout(6000) },
  );
  if (!response.ok) throw new Error("Catalogue is temporarily unavailable.");
  return productListSchema.parse(await response.json());
}
export async function getProduct(handle: string) {
  const response = await fetch(
    api() + "/api/products/" + encodeURIComponent(handle),
    { next: { revalidate: 30 }, signal: AbortSignal.timeout(6000) },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Product is temporarily unavailable.");
  return productSchema.parse(await response.json());
}
