"use client";
import { ContentImage as Image } from "@/components/content-image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { HomeDetails, TemplateMedia } from "@shopmaple/contracts";
import { resolveHomeTemplateMedia } from "@/lib/home-template-media";
import { defaultHomeDetails } from "@/lib/home-details-defaults";

export function Hero({
  content = defaultHomeDetails.hero,
  media,
}: { content?: HomeDetails["hero"]; media?: TemplateMedia } = {}) {
  const poster = resolveHomeTemplateMedia("home-workshop-poster", media);
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
    <section className="hero-grid" aria-label="Explore Maple furniture">
      <div className="hero-film">
        <Image
          src={poster.image}
          alt={poster.alt}
          fill
          sizes="(max-width: 700px) 100vw, 50vw"
          preload
        />
        <video
          ref={video}
          muted
          playsInline
          loop
          preload="none"
          aria-label="Maple furniture craftsmanship"
        />
        <div className="hero-introduction">
          <Link className="hero-cta" href="/pages/nimbus-collection">
            {content.cta} <ArrowUpRight size={17} />
          </Link>
        </div>
        <button
          className="video-control"
          type="button"
          onClick={() => togglePlayback.current?.()}
          aria-label={playing ? "Pause workshop video" : starting ? "Cancel workshop video playback" : "Play workshop video"}
        >
          <span className="sr-only">Toggle motion</span>
        </button>
      </div>
      <div className="hero-categories">
        {content.tiles.map(({ key, label, priceLabel }) => {
          const artwork = resolveHomeTemplateMedia(`home-hero-${key}`, media);
          return <Link
            href={(key === "beds" ? "/collections/" : "/pages/") + key}
            className="category-tile"
            key={key}
          >
            <Image
              src={artwork.image}
              alt={artwork.alt}
              fill
              sizes="(max-width: 700px) 48vw, 25vw"
              preload
            />
            <div>
              <h2>{label}</h2>
              <p>{priceLabel}</p>
            </div>
            <ArrowUpRight aria-hidden size={21} />
          </Link>;
        })}
      </div>
    </section>
  );
}
