"use client";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import type { HomeDetails, TemplateMedia } from "@shopmaple/contracts";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";
import { defaultHomeDetails } from "@/lib/home-details-defaults";

export function Hero({
  content = defaultHomeDetails.hero,
  media,
}: { content?: HomeDetails["hero"]; media?: TemplateMedia } = {}) {
  const poster = resolveTemplateMedia("home-workshop-poster", media);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  function toggle() {
    const v = video.current;
    if (!v) return;
    if (playing) {
      v.pause();
      setPlaying(false);
    } else {
      if (!v.src) v.src = "/media/workshop.mp4";
      void v
        .play()
        .then(() => setPlaying(true))
        .catch(() => {});
    }
  }
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
          onClick={toggle}
          aria-label={playing ? "Pause workshop video" : "Play workshop video"}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
      </div>
      <div className="hero-categories">
        {content.tiles.map(({ key, label, priceLabel }) => {
          const artwork = resolveTemplateMedia(`home-hero-${key}`, media);
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
