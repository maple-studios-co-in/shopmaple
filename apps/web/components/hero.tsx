"use client";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import { shopFile } from "@/lib/format";
import type { HomeDetails } from "@shopmaple/contracts";
import { defaultHomeDetails } from "@/lib/home-details-defaults";

const tileImages = {
  sofas: "engaged_5.jpg?v=1767435623",
  chairs: "engaged_6_1.jpg?v=1767444019",
  tables: "engaged_8_1.jpg?v=1767444598",
  beds: "engaged_9_1.jpg?v=1767448207",
};
export function Hero({
  content = defaultHomeDetails.hero,
}: { content?: HomeDetails["hero"] } = {}) {
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
          src="/media/workshop-poster.webp"
          alt="Furniture craftsmanship at Maple"
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
        {content.tiles.map(({ key, label, priceLabel }) => (
          <Link
            href={(key === "beds" ? "/collections/" : "/pages/") + key}
            className="category-tile"
            key={key}
          >
            <Image
              src={shopFile(tileImages[key])}
              alt=""
              fill
              sizes="(max-width: 700px) 48vw, 25vw"
              preload
            />
            <div>
              <h2>{label}</h2>
              <p>{priceLabel}</p>
            </div>
            <ArrowUpRight aria-hidden size={21} />
          </Link>
        ))}
      </div>
    </section>
  );
}
