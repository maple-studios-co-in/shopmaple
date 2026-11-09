import { isCampaignActive, type CampaignSchedule } from "./campaign-schedule";

/** A campaign's offer, ready for the product page's countdown: what it offers, its code, and the window its schedule sets. */
export type CampaignDeal = { campaign: string; offer: string; code: string; startsAt: string | null; endsAt: string };

type CampaignDealSource = {
  key: string;
  deal?: { offer: string; code: string } | undefined;
  schedule?: CampaignSchedule | null | undefined;
};

/** Every campaign that can run the countdown: one with an offer and a schedule that ends, since a timer needs a real deadline. */
export function campaignDeals(campaigns: readonly CampaignDealSource[]): CampaignDeal[] {
  return campaigns.flatMap(({ key, deal, schedule }) =>
    deal && schedule?.endsAt ? [{ campaign: key, offer: deal.offer, code: deal.code, startsAt: schedule.startsAt, endsAt: schedule.endsAt }] : []);
}

/** The offer running at `now`, on the same window as the campaign's banner. When campaigns overlap, the deadline that comes first. */
export function liveCampaignDeal(deals: readonly CampaignDeal[], now: number): CampaignDeal | undefined {
  return deals
    .filter(({ startsAt, endsAt }) => isCampaignActive({ startsAt, endsAt }, now))
    .reduce<CampaignDeal | undefined>((soonest, deal) => (!soonest || Date.parse(deal.endsAt) < Date.parse(soonest.endsAt) ? deal : soonest), undefined);
}
