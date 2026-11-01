/** Policies Keeri can promise on this channel; dropship and unverified never are. */
export const sellablePolicy = (stockPolicy: string) =>
  stockPolicy === "stocked" || stockPolicy === "made_to_order";
