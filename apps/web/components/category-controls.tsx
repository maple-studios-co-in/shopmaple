"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Pause, Play, ArrowLeft, ArrowRight } from "lucide-react";

export function CategoryIntroduction({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const content = description.replace(/\s+/g, " ").trim();
  return (
    <section className="landing-intro">
      <h1>{title}</h1>
      <p id={id}>{expanded ? content : `${content.slice(0, 197)}...`}</p>
      {description.length > 200 && (
        <button
          type="button"
          aria-controls={id}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Read Less" : "Read More"}
        </button>
      )}
    </section>
  );
}

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
  const [playing, setPlaying] = useState(false);
  const [small, setSmall] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 749px)");
    const update = () => setSmall(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const selected = small && mobile ? mobile : desktop;
  useEffect(() => {
    const video = ref.current;
    if (!video || !autoPlay) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pauseForReducedMotion = () => {
      if (motion.matches) video.pause();
    };
    motion.addEventListener("change", pauseForReducedMotion);
    if (!motion.matches) video.play().catch(() => {});
    return () => {
      motion.removeEventListener("change", pauseForReducedMotion);
      video.pause();
    };
  }, [selected.src, autoPlay]);
  return (
    <div className={`landing-video ${className}`}>
      <video
        ref={ref}
        src={selected.src}
        poster={selected.poster}
        playsInline
        loop
        muted
        preload="metadata"
        aria-label={label}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <button
        type="button"
        aria-label={`${playing ? "Pause" : "Play"} ${label}`}
        onClick={() => {
          const video = ref.current;
          if (video) {
            if (video.paused) video.play().catch(() => {});
            else video.pause();
          }
        }}
      >
        {playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
    </div>
  );
}

export function CategorySlideshow({
  slides,
}: {
  slides: { key?: string; desktop: string; mobile: string; alt: string }[];
}) {
  const [index, setIndex] = useState(0);
  const slide = slides[index]!;
  return (
    <section
      className="landing-slideshow"
      aria-label="Nimbus rooms"
      aria-roledescription="carousel"
    >
      <picture>
        <source media="(max-width: 749px)" srcSet={slide.mobile} />
        <img src={slide.desktop} alt={slide.alt} loading="lazy" />
      </picture>
      <div className="landing-slideshow-controls">
        <button
          type="button"
          onClick={() => setIndex((index + slides.length - 1) % slides.length)}
          aria-label="Previous room"
        >
          <ArrowLeft size={18} />
        </button>
        {slides.map((item, i) => (
          <button
            key={item.key ?? item.alt}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show ${item.alt}`}
            aria-pressed={i === index}
          >
            <span className="landing-slide-dot" />
          </button>
        ))}
        <button
          type="button"
          onClick={() => setIndex((index + 1) % slides.length)}
          aria-label="Next room"
        >
          <ArrowRight size={18} />
        </button>
      </div>
    </section>
  );
}
