import { cataloguePageSchema, catalogueCardResponseSchema, type CollectionQuery } from "@shopmaple/contracts";

/** Bind a public response to the exact request; shape validation alone cannot reject stale identities. */
export function parseCataloguePage(raw: unknown, handle: string, query: CollectionQuery, limit: 4 | 24) {
  const result = cataloguePageSchema.parse(raw);
  const expectedPage = Math.min(query.page, Math.max(1, Math.ceil(result.total / limit)));
  if (result.handle !== handle || result.limit !== limit ||
      Object.entries(query).some(([key, value]) => result.query[key as keyof CollectionQuery] !== (key === "page" ? expectedPage : value)))
    throw new Error("Invalid catalogue response");
  return result;
}

/** The address a card answers for: the requested one, or the current one after a renamed address redirected. */
export function cardHandle(response: Response, requested: string) {
  if (!response.redirected) return requested;
  const moved = decodeURIComponent(new URL(response.url).pathname.split("/").at(-1) ?? "");
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(moved) ? moved : requested;
}
export function parseCatalogueCard(raw: unknown, handle: string) {
  const result = catalogueCardResponseSchema.parse(raw);
  if (result.product.handle !== handle) throw new Error("Invalid catalogue response");
  return result.product;
}
