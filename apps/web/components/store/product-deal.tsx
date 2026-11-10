"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { liveCampaignDeal, type CampaignDeal, type ProductHighlights } from "@shopmaple/contracts";
import { useCampaignClock } from "../campaign-clock";

export type Deal = NonNullable<ProductHighlights["deal"]>;

/** Whether the store-wide offer is still running at `now`. */
export const dealLive = (deal: Deal | undefined, now: number): deal is Deal => Boolean(deal && Date.parse(deal.endsAt) > now);

/**
 * The offer the page shows right now: a running campaign's, or else the one set by hand. Rechecked as each offer starts
 * and ends, so an open page follows the campaign without a reload.
 */
export function useRunningDeal({ campaignDeals, deal: manual }: { campaignDeals: readonly CampaignDeal[]; deal?: Deal | undefined }, openedAt: number): Deal | undefined {
  const now = useCampaignClock([...campaignDeals.flatMap((deal) => [deal.startsAt, deal.endsAt]), manual?.endsAt], openedAt);
  return liveCampaignDeal(campaignDeals, now) ?? (dealLive(manual, now) ? manual : undefined);
}

/** One offer's identity: a different one starts the box and the tab afresh, which brings back a tab closed for the last. */
export const dealKey = (deal: Deal) => `${deal.code}:${deal.endsAt}`;

/**
 * The whole seconds left before `endsAt`, rounded up: the last second reads 1 and the box goes the moment the offer ends,
 * so it never shows zeros, a negative number or a time that has passed (and an unreadable end shows nothing). The first
 * render counts from `openedAt`, the server's clock when it drew the page, so the markup already carries the numbers and
 * hydration matches; then the browser's clock takes over, ticking on the deadline's own second boundaries (never a beat
 * late, never twice in one second) and catching up when the shopper comes back to the tab (owner, 10 Nov 2026).
 */
// Before the browser paints, so a box that mounts on an open page (the next campaign's) never shows the page's old clock.
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

function useSecondsLeft(endsAt: string, openedAt: number) {
  const end = Date.parse(endsAt);
  const [now, setNow] = useState(openedAt);
  useBeforePaint(() => {
    let timer: number | undefined;
    function tick() {
      window.clearTimeout(timer);
      const current = Date.now();
      setNow(current);
      const left = end - current;
      if (left > 0) timer = window.setTimeout(tick, ((left - 1) % 1000) + 1);
    }
    const onVisibility = () => { if (!document.hidden) tick(); };
    tick();
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [end]);
  const left = end - now;
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/**
 * A digit that changes rolls up into its box, as the frame's digit columns (2:461) suggest: only that digit, once, on the
 * site's ease-out curve. The first paint stays still, and so does everything for shoppers who ask for less motion.
 */
function useDigitRoll() {
  const ready = useRef(false);
  useEffect(() => { ready.current = true; }, []);
  return useCallback((digit: HTMLSpanElement | null) => {
    if (!digit || !ready.current || typeof digit.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    digit.animate([{ transform: "translateY(70%)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }], { duration: 480, easing: "cubic-bezier(.22,1,.36,1)" });
  }, []);
}

const units = [["Days", "Day", 86_400], ["Hours", "Hour", 3_600], ["Mins", "Min", 60], ["Secs", "Sec", 1]] as const;
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "9 November 2026, 6:02 am IST": spelled out here rather than by Intl, whose wording differs between server and browser. */
export function endsLabel(iso: string) {
  const ist = new Date(Date.parse(iso) + 330 * 60_000);
  const hours = ist.getUTCHours(), minutes = String(ist.getUTCMinutes()).padStart(2, "0");
  return `${ist.getUTCDate()} ${months[ist.getUTCMonth()]} ${ist.getUTCFullYear()}, ${hours % 12 || 12}:${minutes} ${hours < 12 ? "am" : "pm"} IST`;
}

/**
 * Frame 2:447 ("Don't miss the deal"): the burgundy offer box with its code to copy and a countdown to the end the
 * admin set. It shows only while the offer runs, counting from `openedAt` (the page's clock, see useSecondsLeft). The
 * numbers tick for sighted shoppers; screen readers hear the end date once instead of a number every second.
 */
export function ProductDeal({ deal, openedAt }: { deal: Deal; openedAt: number }) {
  const seconds = useSecondsLeft(deal.endsAt, openedAt);
  const roll = useDigitRoll();
  const [copied, setCopied] = useState("");
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(""), 3000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  if (seconds <= 0) return null;
  async function copy() {
    try {
      await window.navigator.clipboard.writeText(deal.code);
      setCopied("Copied");
    } catch {
      setCopied("Couldn’t copy the code");
    }
  }
  let left = seconds;
  return (
    // The box measures itself (a size container): with room, the code sits left and the four boxes right, as drawn;
    // narrower, as on a phone, the code centres over four boxes spread across the width (owner, 10 Nov 2026).
    <section id="product-deal" data-countdown aria-labelledby="product-deal-title" className="@container rounded-[10px] bg-maple px-5 py-[22px] text-white sm:px-[22px]">
      <div className="flex flex-col items-center gap-4 @min-[352px]:flex-row @min-[352px]:justify-between @min-[352px]:gap-3">
        <div className="flex flex-col items-center gap-[7px]">
          <h2 id="product-deal-title" className="m-0 text-[17.5px] leading-[1.6] font-medium whitespace-nowrap">Don’t miss the deal</h2>
          <p className="sr-only">Offer ends {endsLabel(deal.endsAt)}</p>
          <div className="flex h-[26px] items-center gap-2 rounded-[26px] border border-dashed border-white/40 py-[3px] pr-[3px] pl-[8px]">
            <span data-deal-code className="font-heading text-[11px] leading-none font-medium tracking-[0.03em]">{deal.code}</span>
            <button type="button" data-deal-copy onClick={() => void copy()} aria-label={`Copy code ${deal.code}`}
              className="inline-flex h-[18px] cursor-pointer items-center gap-1 rounded-[17px] border-0 bg-white px-2 text-[10px] leading-none font-medium text-maple transition-colors duration-200 ease-[cubic-bezier(.22,1,.36,1)] hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
              <img src="/product-page/deal-copy.svg" alt="" width={6} height={11} className="h-[11px] w-1.5" />
              {copied === "Copied" ? "Copied" : "Copy"}
            </button>
            <span data-deal-copy-status role="status" className="sr-only">{copied}</span>
          </div>
        </div>
        <div aria-hidden="true" className="grid w-full grid-cols-4 gap-[5px] @min-[352px]:flex @min-[352px]:w-auto">
          {units.map(([plural, singular, size]) => {
            const value = Math.floor(left / size);
            left -= value * size;
            const digits = [...String(value).padStart(2, "0")];
            return (
              <span key={plural} data-countdown-unit className="flex h-[52px] flex-col items-center justify-center rounded-[4px] bg-white text-maple @min-[352px]:size-[41px]">
                {/* Each digit keyed by its place, so one that does not change keeps its element and only a new one rolls in. */}
                <span className="flex overflow-hidden py-px text-[22px] leading-none font-medium tabular-nums @min-[352px]:text-[19.5px]">
                  {digits.map((digit, index) => <span key={`${digits.length - index}:${digit}`} ref={roll} data-countdown-digit className="inline-block">{digit}</span>)}
                </span>
                {" "}
                <span className="mt-0.5 text-[10px] leading-none">{value === 1 ? singular : plural}</span>
              </span>
            );
          })}
        </div>
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
