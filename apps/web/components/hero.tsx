"use client";
import { ContentImage as Image } from "@/components/content-image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import type { HomeDetails, TemplateMedia } from "@shopmaple/contracts";
import { resolveHomeTemplateMedia } from "@/lib/home-template-media";
import { defaultHomeDetails } from "@/lib/home-details-defaults";

/** The shop's latest hero film, as published on shop.maplefurnishers.com. */
export const heroFilm = "https://shop.maplefurnishers.com/cdn/shop/videos/c/vp/f9239e922cef45df9972f1dac1b89e0a/f9239e922cef45df9972f1dac1b89e0a.HD-1080p-2.5Mbps-98879340.mp4?v=0";

/**
 * The film plays on its own, muted and looping, with no controls (the owner's choice). A shopper
 * whose device asks for reduced motion sees the still poster instead.
 */
export function Hero({
  content = defaultHomeDetails.hero,
  media,
}: { content?: HomeDetails["hero"]; media?: TemplateMedia } = {}) {
  const poster = resolveHomeTemplateMedia("home-workshop-poster", media);
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
          src={heroFilm}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
        <div className="hero-introduction">
          <Link className="hero-cta" href="/pages/nimbus-collection">
            {content.cta} <ArrowUpRight size={17} />
          </Link>
        </div>
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
