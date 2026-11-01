"use client";
import { useEffect, useRef } from "react";

/** The shop's latest hero film, as published on shop.maplefurnishers.com. */
export const heroFilm = "https://shop.maplefurnishers.com/cdn/shop/videos/c/vp/f9239e922cef45df9972f1dac1b89e0a/f9239e922cef45df9972f1dac1b89e0a.HD-1080p-2.5Mbps-98879340.mp4?v=0";

/**
 * The film plays on its own, muted and looping, with no controls (the owner's choice). It is
 * started by script rather than the autoplay attribute, so a shopper whose device asks for
 * reduced motion never sees it move and keeps the still poster.
 */
export function HeroFilm() {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const apply = () => {
      if (reduced?.matches) v.pause();
      else { v.muted = true; void v.play()?.catch(() => {}); }
    };
    apply();
    reduced?.addEventListener?.("change", apply);
    return () => reduced?.removeEventListener?.("change", apply);
  }, []);
  return <video ref={video} src={heroFilm} muted loop playsInline preload="metadata" aria-hidden="true" />;
}
