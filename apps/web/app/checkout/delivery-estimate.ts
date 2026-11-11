export type DayRange = { from: string; to: string };
type Fulfilment = { kind: "stocked" | "made_to_order"; leadTimeDays: number | null };

/** Days past the earliest day that make the window; the API's `estimateSpreadDays` (apps/api/src/account/orders.ts). */
const spreadDays = 4;
const indiaOffsetMs = (5 * 60 + 30) * 60_000;
const indiaDay = (at: Date, plusDays: number) => new Date(at.getTime() + indiaOffsetMs + plusDays * 86_400_000).toISOString().slice(0, 10);

/**
 * When a quoted order should arrive, by the rule the order page uses once it is paid: the longest made-to-order making
 * time plus the courier's estimated days, counted from today in India, then three days' spread. Null when the courier
 * gave no estimate or a piece's making time is unknown, rather than an invented date.
 */
export function estimatedArrival(quote: { items: Array<{ fulfilment?: Fulfilment }>; delivery?: { estimatedDays: number | null } | null }, now: Date): DayRange | null {
  const transit = quote.delivery?.estimatedDays;
  if (transit === null || transit === undefined) return null;
  let making = 0;
  for (const item of quote.items) {
    if (!item.fulfilment) return null;
    if (item.fulfilment.kind === "made_to_order") {
      if (item.fulfilment.leadTimeDays === null) return null;
      making = Math.max(making, item.fulfilment.leadTimeDays);
    }
  }
  return { from: indiaDay(now, making + transit), to: indiaDay(now, making + transit + spreadDays) };
}
