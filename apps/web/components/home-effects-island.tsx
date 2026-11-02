"use client";
import { useEffect } from "react";

/**
 * Attaches the homepage's motion after hydration: the Nimbus/Terra stage, the typed statement, the
 * counting figures, the editorial flipbook and the wordmark reveal. It renders nothing; every section is
 * complete server markup, and the behaviour (lib/home-effects.ts) loads as its own chunk, so it stays
 * out of the homepage's first-load JavaScript.
 */
export function HomeEffectsIsland() {
  useEffect(() => {
    let stop: (() => void) | undefined;
    let gone = false;
    void import("@/lib/home-effects").then(({ mountHomeEffects }) => {
      if (!gone) stop = mountHomeEffects(document);
    }).catch(() => { /* every section stays in its finished, still state */ });
    return () => { gone = true; stop?.(); };
  }, []);
  return null;
}
