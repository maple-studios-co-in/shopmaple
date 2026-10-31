"use client";
import { ContentImage as Image } from "@/components/content-image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
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
    <section data-store data-hero aria-label="Explore Maple furniture"
      className="mx-auto grid w-full max-w-[1440px] gap-2 px-4 pt-4 font-body md:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:px-12">
      <div data-hero-film className="group/film relative isolate aspect-[4/5] overflow-hidden rounded-[18px] bg-espresso sm:aspect-[16/10] lg:aspect-auto lg:min-h-[440px]">
        <Image src={poster.image} alt={poster.alt} fill sizes="(max-width: 1023px) 100vw, 54vw" preload className="object-cover" />
        <video ref={video} muted playsInline loop preload="none" aria-label="Maple furniture craftsmanship"
          className="absolute inset-0 size-full object-cover" />
        <button data-video-control type="button" onClick={() => togglePlayback.current?.()}
          aria-label={playing ? "Pause workshop video" : starting ? "Cancel workshop video playback" : "Play workshop video"}
          className="absolute inset-0 z-[1] cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:-outline-offset-[6px] focus-visible:outline-white">
          <span className="sr-only">Toggle motion</span>
        </button>
        <Link data-hero-cta href="/pages/nimbus-collection"
          className="absolute bottom-6 left-6 z-[2] inline-flex items-center gap-3 rounded-md bg-brand px-5 py-3 text-ui font-semibold text-white no-underline shadow-sm hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:bottom-8 sm:left-8">
          {content.cta} <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
      <div data-hero-tiles className="grid grid-cols-2 gap-2">
        {content.tiles.map(({ key, label, priceLabel }) => {
          const artwork = resolveHomeTemplateMedia(`home-hero-${key}`, media);
          return <Link data-hero-tile key={key} href={(key === "beds" ? "/collections/" : "/pages/") + key}
            className="group/tile relative isolate block aspect-square overflow-hidden rounded-[18px] bg-forest text-white no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:aspect-[5/4] lg:aspect-auto">
            <Image src={artwork.image} alt={artwork.alt} fill sizes="(max-width: 1023px) 48vw, 23vw" preload
              className="-z-[1] object-cover transition-transform duration-500 group-hover/tile:scale-[1.03] motion-reduce:transition-none" />
            <div className="grid gap-1 p-3.5 sm:p-5">
              <h2 className="font-serif text-[19px] leading-tight font-semibold sm:text-h4">{label}</h2>
              <p className="text-label sm:text-meta">{priceLabel}</p>
              <span data-tile-link className="mt-1 inline-flex items-center gap-1.5 text-label font-semibold underline-offset-4 group-hover/tile:underline">
                View collection <ArrowRight aria-hidden="true" className="size-3.5" />
              </span>
            </div>
          </Link>;
        })}
      </div>
    </section>
  );
}
