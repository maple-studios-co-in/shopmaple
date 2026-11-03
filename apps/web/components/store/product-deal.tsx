"use client";
import { useEffect, useState } from "react";
import type { ProductHighlights } from "@shopmaple/contracts";

export type Deal = NonNullable<ProductHighlights["deal"]>;

/** Whether the store-wide offer is still running at `now`. */
export const dealLive = (deal: Deal | undefined, now: number): deal is Deal => Boolean(deal && Date.parse(deal.endsAt) > now);

/** The clock, ticking once a second from mount; null on the server and the first paint, so the markup carries no time. */
function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

const units = [["Days", "Day", 86_400_000], ["Hours", "Hour", 3_600_000], ["Mins", "Min", 60_000], ["Secs", "Sec", 1000]] as const;
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "9 November 2026, 6:02 am IST": spelled out here rather than by Intl, whose wording differs between server and browser. */
export function endsLabel(iso: string) {
  const ist = new Date(Date.parse(iso) + 330 * 60_000);
  const hours = ist.getUTCHours(), minutes = String(ist.getUTCMinutes()).padStart(2, "0");
  return `${ist.getUTCDate()} ${months[ist.getUTCMonth()]} ${ist.getUTCFullYear()}, ${hours % 12 || 12}:${minutes} ${hours < 12 ? "am" : "pm"} IST`;
}

/**
 * Frame 2:447 ("Don't miss the deal"): the burgundy offer box with its code to copy and a countdown to the end the
 * admin set. It shows only while the offer runs. The numbers tick for sighted shoppers; screen readers hear the end
 * date once instead of a number every second.
 */
export function ProductDeal({ deal }: { deal: Deal }) {
  const now = useNow();
  const [copied, setCopied] = useState("");
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(""), 3000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const remaining = now === null ? null : Date.parse(deal.endsAt) - now;
  if (remaining !== null && remaining <= 0) return null;
  async function copy() {
    try {
      await window.navigator.clipboard.writeText(deal.code);
      setCopied("Copied");
    } catch {
      setCopied("Couldn’t copy the code");
    }
  }
  let left = remaining ?? 0;
  return (
    <section id="product-deal" data-countdown aria-labelledby="product-deal-title" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3 rounded-[10px] bg-maple px-5 py-[22px] text-white sm:px-[22px]">
      <div className="flex flex-col items-start gap-[7px]">
        <h2 id="product-deal-title" className="m-0 text-[17.5px] leading-[1.6] font-medium">Don’t miss the deal</h2>
        <p className="sr-only">Offer ends {endsLabel(deal.endsAt)}</p>
        <div className="flex h-[26px] items-center gap-2 rounded-[26px] border border-dashed border-white/40 py-[3px] pr-[3px] pl-[7px]">
          <span data-deal-code className="text-[11px] leading-none font-semibold tracking-[0.02em]">{deal.code}</span>
          <button type="button" data-deal-copy onClick={() => void copy()} aria-label={`Copy code ${deal.code}`}
            className="inline-flex h-[18px] cursor-pointer items-center gap-1 rounded-[17px] border-0 bg-white px-2 text-[10px] leading-none font-medium text-maple focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
            <img src="/product-page/deal-copy.svg" alt="" width={6} height={11} className="h-[11px] w-1.5" />
            {copied === "Copied" ? "Copied" : "Copy"}
          </button>
          <span data-deal-copy-status role="status" className="sr-only">{copied}</span>
        </div>
      </div>
      <div aria-hidden="true" className="flex gap-[5px]">
        {units.map(([plural, singular, size]) => {
          const value = Math.floor(left / size);
          left -= value * size;
          return (
            <span key={plural} data-countdown-unit className="flex size-[41px] flex-col items-center justify-center rounded-[4px] bg-white text-maple">
              <span className="text-[19.5px] leading-none font-medium tabular-nums">{now === null ? "––" : String(value).padStart(2, "0")}</span>
              {" "}
              <span className="mt-[3px] text-[10px] leading-none">{value === 1 ? singular : plural}</span>
            </span>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Frame 2:857: the offer tab on the page's left edge ("GET 20% OFF, USE CODE NEW20"), leading to the offer box. A
 * shopper can close it for the visit; a new offer brings it back.
 */
export function DealTab({ deal }: { deal: Deal }) {
  const key = `maple-deal-tab:${deal.code}:${deal.endsAt}`;
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    try { if (window.sessionStorage.getItem(key)) setClosed(true); } catch { /* storage off: the tab stays */ }
  }, [key]);
  if (closed) return null;
  function close() {
    setClosed(true);
    try { window.sessionStorage.setItem(key, "1"); } catch { /* storage off: closed for this page only */ }
  }
  return (
    <aside data-deal-tab aria-label="Offer" className="fixed top-[38%] left-0 z-40 hidden flex-col items-center gap-3 rounded-r-[30px] bg-white pt-[9px] pr-[10px] pb-4 pl-[11px] drop-shadow-[10px_0_10px_rgb(0_0_0/0.08)] md:flex">
      <button type="button" aria-label="Close offer" onClick={close}
        className="grid size-[22px] cursor-pointer place-items-center rounded-full border-0 bg-maple/8 p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple">
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
        <img src="/product-page/tab-close.svg" alt="" width={6} height={6} className="size-[5.5px]" />
      </button>
      <a href="#product-deal" className="text-maple no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple">
        <span data-deal-tab-text className="block rotate-180 text-[12px] leading-[22.4px] font-bold whitespace-nowrap uppercase [writing-mode:vertical-rl]">Get {deal.offer}, use code {deal.code}</span>
      </a>
    </aside>
  );
}
