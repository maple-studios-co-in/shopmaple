"use client";
import { useEffect } from "react";

/**
 * Attaches a homepage slider's behaviour after hydration. It renders nothing; the slider is already
 * complete server markup (a scroll-snap track), and the behaviour (dots, autoplay, video control) is
 * loaded as its own chunk, so it stays out of the homepage's first-load JavaScript.
 */
export function SliderIsland({ name }: { name: string }) {
  useEffect(() => {
    let stop: (() => void) | undefined;
    let gone = false;
    void import("@/lib/slider-behaviour").then(({ mountSlider }) => {
      const root = document.querySelector<HTMLElement>(`[data-slider="${name}"]`);
      if (!gone && root) stop = mountSlider(root);
    });
    return () => { gone = true; stop?.(); };
  }, [name]);
  return null;
}
