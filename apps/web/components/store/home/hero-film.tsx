"use client";
import { ContentImage as Image } from "@/components/content-image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { TemplateMediaItem } from "@shopmaple/contracts";

/** The hero photograph with its click-to-play workshop film; the message is server markup passed as children. */
export function HeroFilm({ poster, children }: { poster: TemplateMediaItem; children?: ReactNode }) {
  const video = useRef<HTMLVideoElement>(null);
  const togglePlayback = useRef<(() => void) | null>(null);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let disposed = false;
    let intersecting: boolean | null = null;
    let requested = false;
    let request = 0;
    let pending: number | null = null;
    const permitted = () => !disposed && requested &&
      document.visibilityState === "visible" && intersecting !== false;
    const pause = () => {
      requested = false;
      request += 1;
      pending = null;
      v.pause();
      if (!disposed) {
        setStarting(false);
        setPlaying(false);
      }
    };
    const onPlay = () => {
      if (!permitted()) pause();
      else setPlaying(!v.paused);
    };
    const onPause = () => {
      // A queued pause event can arrive after a newer Play has already started.
      if (v.paused) pause();
      else setPlaying(true);
    };
    const toggle = () => {
      if (pending !== null || !v.paused) {
        pause();
        return;
      }
      requested = true;
      if (!permitted()) {
        pause();
        return;
      }
      if (!v.getAttribute("src")) v.src = "/media/workshop.mp4";
      const currentRequest = ++request;
      pending = currentRequest;
      setStarting(true);
      const settle = (failed = false) => {
        if (disposed) {
          if (!togglePlayback.current) v.pause();
          return;
        }
        // Old completions must not cancel a newer explicit Play. Every stop
        // clears intent, so returning onscreen never revives a cancelled request.
        if (!permitted()) {
          pause();
          return;
        }
        if (request !== currentRequest) return;
        pending = null;
        setStarting(false);
        if (failed) pause();
        else setPlaying(!v.paused);
      };
      void v.play().then(() => settle(), () => settle(true));
    };
    const onVisibility = () => { if (document.hidden) pause(); };
    const onMotion = () => { if (motion?.matches) pause(); };
    togglePlayback.current = toggle;
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", pause);
    v.addEventListener("error", pause);
    document.addEventListener("visibilitychange", onVisibility);
    motion?.addEventListener("change", onMotion);
    const observer = typeof window.IntersectionObserver === "function"
      ? new window.IntersectionObserver((entries) => {
          const entry = entries.reduce<IntersectionObserverEntry | undefined>(
            (latest, item) => item.target === v && (!latest || item.time >= latest.time) ? item : latest,
            undefined,
          );
          if (!entry || disposed) return;
          intersecting = entry.isIntersecting;
          if (!intersecting) pause();
        }, { threshold: 0 })
      : null;
    observer?.observe(v);
    return () => {
      disposed = true;
      togglePlayback.current = null;
      observer?.disconnect();
      motion?.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVisibility);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", pause);
      v.removeEventListener("error", pause);
      pause();
    };
  }, []);
  return (
    <div data-hero-film className="relative isolate h-[520px] overflow-hidden rounded-xl bg-espresso max-[1024px]:h-auto max-[1024px]:aspect-[656/520] max-[750px]:aspect-[4/5]">
      <Image src={poster.image} alt={poster.alt} fill sizes="(max-width: 1024px) 100vw, 656px" preload className="object-cover" />
      <video ref={video} muted playsInline loop preload="none" aria-label="Maple furniture craftsmanship"
        className="absolute inset-0 size-full object-cover" />
      <div aria-hidden="true" className="absolute inset-0 bg-[rgb(0_0_0/0.32)]" />
      <button data-video-control type="button" onClick={() => togglePlayback.current?.()}
        aria-label={playing ? "Pause workshop video" : starting ? "Cancel workshop video playback" : "Play workshop video"}
        className="absolute inset-0 z-[1] cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:-outline-offset-[6px] focus-visible:outline-white">
        <span className="sr-only">Toggle motion</span>
      </button>
      {children}
    </div>
  );
}
