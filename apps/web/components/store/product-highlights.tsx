"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { CampaignDeal, ProductHighlights } from "@shopmaple/contracts";

type Lookup = {
  swatch: (name: string) => string | undefined;
  product: (handle: string) => ProductHighlights["products"][number] | undefined;
  /** The store-wide offer set by hand, which the product page counts down to while it runs and no campaign does. */
  deal?: ProductHighlights["deal"];
  /** The offers campaigns carry, whichever are running: the product page picks the live one as time passes. */
  campaignDeals: readonly CampaignDeal[];
};

const empty: Lookup = { swatch: () => undefined, product: () => undefined, campaignDeals: [] };
const Context = createContext<Lookup>(empty);

/** Staff-entered card highlights (colour dots, New, ratings) and campaign offers. The layout passes the published set; a draft preview passes its own. */
export function ProductHighlightsProvider({ value, deals, children }: { value?: ProductHighlights; deals?: readonly CampaignDeal[]; children: ReactNode }) {
  const lookup = useMemo<Lookup>(() => {
    const campaignDeals = deals ?? empty.campaignDeals;
    if (!value) return { ...empty, campaignDeals };
    const swatches = new Map(value.swatches.map((swatch) => [swatch.name.trim().toLowerCase(), swatch.hex]));
    const products = new Map(value.products.map((product) => [product.handle, product]));
    return { swatch: (name) => swatches.get(name.trim().toLowerCase()), product: (handle) => products.get(handle), deal: value.deal, campaignDeals };
  }, [value, deals]);
  return <Context.Provider value={lookup}>{children}</Context.Provider>;
}

export const useProductHighlights = () => useContext(Context);
