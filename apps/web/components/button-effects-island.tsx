"use client";
import { useEffect } from "react";

/**
 * Attaches the buttons' fill from the pointer (lib/button-effects.ts) after hydration, on every page. It
 * renders nothing, and the behaviour loads as its own small chunk, so it stays out of first-load JavaScript;
 * until it arrives, and if it never does, buttons keep their plain hover colours.
 */
export function ButtonEffectsIsland() {
  useEffect(() => {
    let stop: (() => void) | undefined;
    let gone = false;
    void import("@/lib/button-effects").then(({ mountButtonEffects }) => {
      if (!gone) stop = mountButtonEffects(document);
    }).catch(() => { /* buttons keep their plain hover colours */ });
    return () => { gone = true; stop?.(); };
  }, []);
  return null;
}
