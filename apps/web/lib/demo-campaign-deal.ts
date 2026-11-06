import type { StorefrontContent } from "@shopmaple/contracts";

/**
 * TEMPORARY placeholder until the first real campaign offer is published. Delete this file and its one call in
 * `readPublishedContent` then.
 *
 * It is switched on only by CAMPAIGN_DEAL_DEMO=1 (see .env.example) and a production server ignores that, because
 * SALE30 is not a real code: shoppers must never be told to hurry for an offer that does not exist. The end is a fixed
 * date rather than "N days from now", so the countdown behaves as a real one does and does not restart on every visit.
 */
const demoCampaign = "landing-announcement";
const demoDeal = { offer: "30% off", code: "SALE30" };
const demoSchedule = { startsAt: null, endsAt: "2027-02-13T18:30:00.000Z" };

/**
 * Adds the placeholder as ordinary campaign data, so it travels the same path a real campaign will. Skipped during an
 * API outage, and as soon as any campaign carries a real offer.
 */
export function withDemoCampaignDeal<T extends StorefrontContent & { campaignsAvailable?: boolean }>(document: T, env: Record<string, string | undefined> = process.env): T {
  if (env.NODE_ENV === "production" || env.CAMPAIGN_DEAL_DEMO !== "1") return document;
  if (document.campaignsAvailable === false || document.campaigns.some((campaign) => campaign.deal)) return document;
  return {
    ...document,
    campaigns: document.campaigns.map((campaign) => (campaign.key === demoCampaign ? { ...campaign, deal: demoDeal, schedule: demoSchedule } : campaign)),
  };
}
