import "server-only";
import { cache } from "react";
import { z } from "zod";
import { storefrontContentSchema } from "@shopmaple/contracts";
import { defaultStorefrontContent } from "./content-defaults";
const publishedSchema = z
  .object({
    version: z.number().int().min(1),
    content: storefrontContentSchema,
  })
  .strict();
export async function readPublishedContent(transport: typeof fetch = fetch) {
  try {
    const response = await transport(
      (process.env.API_URL ?? "http://127.0.0.1:4100") +
        "/api/content/storefront",
      { cache: "no-store", signal: AbortSignal.timeout(3000) },
    );
    if (response.ok) {
      const result = publishedSchema.safeParse(await response.json());
      if (result.success) return result.data.content;
    }
  } catch {
    /* Original bundled public content remains available during an outage. */
  }
  return structuredClone(defaultStorefrontContent);
}
export const getPublishedContent = cache(() => readPublishedContent());
