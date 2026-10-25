"use client";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import { shopFile } from "@/lib/format";
const tiles = [
  ["Sofas", "25,000", "sofas", "engaged_5.jpg?v=1767435623"],
  ["Chairs", "8,000", "chairs", "engaged_6_1.jpg?v=1767444019"],
  ["Tables", "12,000", "tables", "engaged_8_1.jpg?v=1767444598"],
  ["Beds", "55,000", "beds", "engaged_9_1.jpg?v=1767448207"],
];
export function Hero() {
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
          <p>Thoughtfully made. Unmistakably yours.</p>
          <h1>Made for the way you live.</h1>
          <Link className="hero-cta" href="/collections/all">
            Explore furniture <ArrowUpRight size={17} />
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
        {tiles.map(([name, , category, image]) => (
          <Link
            href={"/collections/" + category}
            className="category-tile"
            key={category}
          >
            <Image
              src={shopFile(image!)}
              alt=""
              fill
              sizes="(max-width: 700px) 48vw, 25vw"
              preload
            />
            <div>
              <h2>{name}</h2>
              <p>Explore collection</p>
            </div>
            <ArrowUpRight aria-hidden size={21} />
          </Link>
        ))}
      </div>
    </section>
  );
}
