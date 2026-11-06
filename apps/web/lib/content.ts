import "server-only";
import { cache } from "react";
import { z } from "zod";
import { campaignDeals, storefrontContentSchema, type CampaignDeal, type StorefrontContent } from "@shopmaple/contracts";
import { defaultStorefrontContent } from "./content-defaults";
import { withDemoCampaignDeal } from "./demo-campaign-deal";
const publishedSchema = z
  .object({
    version: z.number().int().min(1),
    content: storefrontContentSchema,
  })
  .strict();
/** A content document plus whether campaign banners may render (false only during an API outage). */
export type StorefrontDocument = StorefrontContent & { campaignsAvailable?: boolean };
export async function readPublishedContent(transport: typeof fetch = fetch): Promise<StorefrontDocument> {
  try {
    const response = await transport(
      (process.env.API_URL ?? "http://127.0.0.1:4100") +
        "/api/content/storefront",
      { cache: "no-store", signal: AbortSignal.timeout(3000) },
    );
    if (response.ok) {
      const result = publishedSchema.safeParse(await response.json());
      if (result.success) return withDemoCampaignDeal({ ...result.data.content, campaignsAvailable: true });
    } else if (response.status === 404) {
      const error = await response.json();
      if (error?.code === "CONTENT_NOT_PUBLISHED")
        return withDemoCampaignDeal({ ...structuredClone(defaultStorefrontContent), campaignsAvailable: true });
    }
  } catch {
    /* Original bundled public content remains available during an outage. */
  }
  return { ...structuredClone(defaultStorefrontContent), campaignsAvailable: false };
}
export const getPublishedContent = cache(() => readPublishedContent());
/** The campaign offers a document may run. The bundled copy read during an API outage cannot vouch for any, like the banners. */
export const documentDeals = (document: StorefrontDocument): CampaignDeal[] =>
  document.campaignsAvailable === false ? [] : campaignDeals(document.campaigns);
