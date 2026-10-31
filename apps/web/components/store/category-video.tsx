"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/*
 * A muted, looping film with a full-size play/pause control (Our Story and the Nimbus page), in the
 * storefront's current look: legacy `.landing-video` restated as utilities. The caller's classes
 * size and place the frame and win over the defaults (`cn` merges them).
 */

type Video = { src: string; poster: string };
export function CategoryVideo({
  desktop,
  mobile,
  className = "",
  label,
  autoPlay = true,
}: {
  desktop: Video;
  mobile?: Video;
  className?: string;
  label: string;
  autoPlay?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const intent = useRef<"automatic" | "play" | "pause">("automatic");
  const togglePlayback = useRef<(() => void) | null>(null);
  const [playing, setPlaying] = useState(false);
  const [small, setSmall] = useState(false);
  const selected = small && mobile ? mobile : desktop;

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const viewport = window.matchMedia?.("(max-width: 749px)");
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let source = desktop.src;
    let intersecting: boolean | null = null;
    let disposed = false;
    let request = 0;
    let pending: number | null = null;

    // Unknown browser capabilities never enable automatic motion. Explicit Play
    // remains usable when an observer or motion query is unavailable.
    const permitted = () => !disposed && document.visibilityState === "visible" &&
      intent.current !== "pause" &&
      (intent.current === "play"
        ? intersecting !== false
        : autoPlay && !!motion && !motion.matches && intersecting === true);
    const pause = () => {
      request += 1;
      pending = null;
      video.pause();
      if (!disposed) setPlaying(false);
    };
    const synchronize = () => {
      if (!permitted()) {
        pause();
        return;
      }
      if (video.getAttribute("src") !== source) {
        pause();
        video.src = source;
      }
      if (!video.paused || pending !== null) return;
      const currentRequest = ++request;
      pending = currentRequest;
      const settle = () => {
        // A settled old request must not cancel a newer eligible playback.
        // On unmount, even a browser's late successful play must be stopped.
        if (disposed) {
          if (!togglePlayback.current) video.pause();
          return;
        }
        if (!permitted()) pause();
        if (request === currentRequest) {
          pending = null;
          setPlaying(!video.paused);
        }
      };
      void video.play().then(settle, settle);
    };
    const updateViewport = () => {
      const isSmall = viewport?.matches ?? window.innerWidth <= 749;
      source = isSmall && mobile ? mobile.src : desktop.src;
      setSmall(isSmall);
      synchronize();
    };
    const updateMotion = () => {
      // Enabling reduced motion suspends both automatic and manually started
      // films. Disabling it again never replaces the visitor's Play action.
      if (motion?.matches) intent.current = "pause";
      synchronize();
    };
    const onPlay = () => {
      if (!permitted()) pause();
      else setPlaying(!video.paused);
    };
    const onPause = () => setPlaying(!video.paused);
    const toggle = () => {
      if (video.paused) {
        intent.current = "play";
        synchronize();
      } else {
        intent.current = "pause";
        pause();
      }
    };
    togglePlayback.current = toggle;
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    viewport?.addEventListener("change", updateViewport);
    motion?.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", synchronize);
    if (motion?.matches) intent.current = "pause";
    updateViewport();
    const intersectionThreshold = 0.01;
    const observer = typeof window.IntersectionObserver === "function"
      ? new window.IntersectionObserver((entries) => {
          // One delivery can contain multiple crossings for this same film.
          const entry = entries.reduce<IntersectionObserverEntry | undefined>(
            (latest, item) => item.target === video && (!latest || item.time >= latest.time) ? item : latest,
            undefined,
          );
          if (!entry || disposed) return;
          intersecting = entry.isIntersecting && entry.intersectionRatio >= intersectionThreshold;
          synchronize();
        }, { threshold: intersectionThreshold })
      : null;
    observer?.observe(video);
    return () => {
      disposed = true;
      togglePlayback.current = null;
      observer?.disconnect();
      viewport?.removeEventListener("change", updateViewport);
      motion?.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", synchronize);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      pause();
    };
  }, [desktop.src, mobile?.src, autoPlay]);
  return (
    <div data-store data-category-video className={cn("relative min-w-0 overflow-hidden", className)}>
      <video
        className="block size-full object-cover"
        ref={ref}
        poster={selected.poster}
        playsInline
        loop
        muted
        preload="none"
        aria-label={label}
      />
      <button
        type="button"
        className="absolute inset-0 grid size-full cursor-pointer place-items-center rounded-none [border:0] bg-transparent text-white focus-visible:outline-2 focus-visible:-outline-offset-6 focus-visible:outline-white"
        aria-label={`${playing ? "Pause" : "Play"} ${label}`}
        onClick={() => togglePlayback.current?.()}
      >
        <span className="sr-only">Toggle motion</span>
      </button>
    </div>
  );
}
