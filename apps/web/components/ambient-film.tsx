"use client";
import { useEffect, useRef } from "react";

/**
 * A short film that plays on its own, muted and looping, while it is on screen (owner, 12 Nov 2026: the homepage
 * testimonial). It is server-rendered with its poster and fixed proportions, so nothing moves when it loads; until it is
 * scrolled to, only the film's opening bytes load. Visitors who ask for reduced motion see the poster and the film never
 * starts; without script the poster shows as well.
 */
export function AmbientFilm({ src, poster, label, className, width, height }: {
  src: string; poster?: string; label: string; className?: string; width: number; height: number;
}) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const player = video.current;
    if (!player) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let visible = typeof IntersectionObserver !== "function";
    const update = () => {
      if (visible && !reduced?.matches) { player.muted = true; void player.play()?.catch(() => {}); return; }
      if (player.paused) return;
      player.pause();
      // Asking for less motion mid-film brings the poster back rather than leaving a frame.
      if (reduced?.matches) player.load();
    };
    const observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); update(); }, { threshold: 0.25 })
      : null;
    observer?.observe(player);
    reduced?.addEventListener?.("change", update);
    update();
    return () => { observer?.disconnect(); reduced?.removeEventListener?.("change", update); };
  }, [src]);
  return <video ref={video} className={className} src={src} poster={poster} width={width} height={height} muted loop playsInline preload="metadata"
    aria-label={label} data-ambient-film="" />;
}
