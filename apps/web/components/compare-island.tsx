"use client";
import { useEffect, useRef } from "react";

/**
 * Brings the before/after card to life after the page has loaded. The card is complete server
 * HTML; this renders nothing of its own and loads the drag script as a separate chunk, so it
 * adds no weight to the homepage's first-load JavaScript.
 */
export function CompareIsland() {
  const anchor = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const card = anchor.current?.closest<HTMLElement>("[data-compare-card]");
    if (!card) return;
    let live = true;
    let detach: (() => void) | undefined;
    void import("./compare-drag").then(({ attachCompare }) => { if (live) detach = attachCompare(card); });
    return () => { live = false; detach?.(); };
  }, []);
  return <span ref={anchor} hidden data-compare-island />;
}
