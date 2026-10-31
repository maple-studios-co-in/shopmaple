"use client";
import { ContentImage as Image } from "@/components/content-image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { TemplateMediaItem } from "@shopmaple/contracts";

/** The film on shop.maplefurnishers.com's hero (1 November 2026). */
const film = "https://shop.maplefurnishers.com/cdn/shop/videos/c/vp/f9239e922cef45df9972f1dac1b89e0a/f9239e922cef45df9972f1dac1b89e0a.HD-1080p-2.5Mbps-98879340.mp4?v=0";

/**
 * The hero photograph and its film, which plays muted and looping by itself while it is on screen
 * in a visible tab, unless the shopper prefers reduced motion. The control over the film pauses it
 * (and it then stays paused) or plays it (which also overrides reduced motion). The server draws only
 * the poster, so script-free renders such as the section builder's thumbnails show the still; the
 * message is server markup passed as children.
 */
export function HeroFilm({ poster, children }: { poster: TemplateMediaItem; children?: ReactNode }) {
  const video = useRef<HTMLVideoElement>(null);
  const toggle = useRef<(() => void) | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    // "auto" follows the motion preference; "play" and "pause" are the shopper's own choice.
    let intent: "auto" | "play" | "pause" = "auto";
    let onscreen = true;
    let disposed = false;
    let request = 0;
    let pending = false;
    const wanted = () => !disposed && document.visibilityState === "visible" && onscreen &&
      (intent === "play" || (intent === "auto" && !motion?.matches));
    const show = () => { if (!disposed) setActive(pending || !v.paused); };
    const sync = () => {
      if (!wanted()) {
        request += 1;
        pending = false;
        v.pause();
        show();
        return;
      }
      if (pending || !v.paused) return;
      v.muted = true;
      if (!v.getAttribute("src")) v.src = film;
      const current = ++request;
      pending = true;
      show();
      void v.play().then(() => {
        // A start that resolves after unmount must not leave the film running.
        if (current !== request) { if (disposed) v.pause(); return; }
        pending = false;
        if (!wanted()) v.pause();
        show();
      }, () => {
        if (current !== request) return;
        pending = false;
        // A refused start (autoplay policy, failed load) waits for the shopper instead of retrying.
        intent = "pause";
        show();
      });
    };
    const onPlay = () => { if (!wanted()) v.pause(); show(); };
    const onStop = () => { if (v.paused) pending = false; show(); };
    const onError = () => { intent = "pause"; onStop(); };
    toggle.current = () => {
      intent = pending || !v.paused ? "pause" : "play";
      sync();
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onStop);
    v.addEventListener("ended", onStop);
    v.addEventListener("error", onError);
    document.addEventListener("visibilitychange", sync);
    motion?.addEventListener("change", sync);
    const observer = typeof window.IntersectionObserver === "function"
      ? new window.IntersectionObserver((entries) => {
          const entry = entries.reduce<IntersectionObserverEntry | undefined>(
            (latest, item) => item.target === v && (!latest || item.time >= latest.time) ? item : latest,
            undefined,
          );
          if (!entry) return;
          onscreen = entry.isIntersecting;
          sync();
        }, { threshold: 0 })
      : null;
    observer?.observe(v);
    sync();
    return () => {
      disposed = true;
      toggle.current = null;
      observer?.disconnect();
      motion?.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onStop);
      v.removeEventListener("ended", onStop);
      v.removeEventListener("error", onError);
      request += 1;
      v.pause();
    };
  }, []);
  return (
    <div data-hero-film className="relative isolate h-full overflow-hidden rounded-xl bg-espresso max-[1024px]:h-auto max-[1024px]:aspect-[656/520] max-[750px]:aspect-[4/5]">
      <Image src={poster.image} alt={poster.alt} fill sizes="(max-width: 1024px) 100vw, 46vw" preload className="object-cover" />
      <video ref={video} muted playsInline loop preload="none" aria-label="Maple at home, the shop film"
        className="absolute inset-0 size-full object-cover" />
      <div aria-hidden="true" className="absolute inset-0 bg-[rgb(0_0_0/0.32)]" />
      <button data-video-control type="button" onClick={() => toggle.current?.()}
        aria-label={active ? "Pause hero film" : "Play hero film"}
        className="absolute inset-0 z-[1] cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:-outline-offset-[6px] focus-visible:outline-white">
        <span className="sr-only">Toggle motion</span>
      </button>
      {children}
    </div>
  );
}
