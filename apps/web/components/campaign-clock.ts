"use client";
import { useEffect, useState } from "react";

/**
 * The time, as far as campaign windows care: the server's clock owns the first markup, then an open page rechecks at
 * each start and end, and again when the shopper comes back to it (timers sleep in background tabs).
 */
export function useCampaignClock(boundaries: readonly (string | null | undefined)[], serverNow: number) {
  const [now, setNow] = useState(serverNow);
  // Compared by value: the same instants in a new array must not restart the timer.
  const instants = boundaries.filter((value): value is string => Boolean(value)).join("|");
  useEffect(() => {
    let timer: number | undefined;
    function refresh() {
      if (timer !== undefined) window.clearTimeout(timer);
      const current = Date.now();
      setNow(current);
      const next = instants.split("|").filter(Boolean).map(Date.parse).filter((value) => value > current).sort((a, b) => a - b)[0];
      if (next !== undefined) timer = window.setTimeout(refresh, Math.min(next - current, 2_147_483_647));
    }
    function onVisibility() {
      if (!document.hidden) refresh();
    }
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [instants, serverNow]);
  return now;
}
