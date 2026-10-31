"use client";
import { useEffect, useRef, useState } from "react";
import { getImageProps } from "next/image";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProductImage } from "./product-image";
import { HeartIcon } from "./icons";

const STAGE_SIZES = "(max-width:1023px) 100vw, (min-width:1432px) 724px, calc(100vw - 708px)";
// Thumbnails beyond this count mount their image only once they near the strip's viewport.
const EAGER_THUMBNAILS = 12;
const initialWindow = (count: number) => new Set(Array.from({ length: Math.min(count, EAGER_THUMBNAILS) }, (_, i) => i));

export function ProductGallery({ images, title, selected, onSelect, onZoom, saved, onSave }: {
  images: string[];
  title: string;
  selected: number;
  onSelect: (index: number) => void;
  onZoom: () => void;
  saved: boolean;
  onSave: () => void;
}) {
  const src = images[selected];
  const initialSrc = useRef(src);
  const [settledSrc, setSettledSrc] = useState(src);
  const [readySrc, setReadySrc] = useState<string>();
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const strip = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(() => initialWindow(images.length));
  const previousSelected = useRef(selected);
  const ready = src === settledSrc || src === readySrc;
  useEffect(() => {
    if (!src || readySrc !== src || settledSrc === src) return;
    const timer = window.setTimeout(() => setSettledSrc(src), 180);
    return () => window.clearTimeout(timer);
  }, [src, readySrc, settledSrc]);
  useEffect(() => {
    const container = strip.current;
    if (!container) return;
    if (typeof IntersectionObserver !== "function") {
      // Without intersection support every thumbnail loads as before.
      setNear(new Set(images.map((_, i) => i)));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      const seen: number[] = [];
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const index = Number((entry.target as HTMLElement).dataset.index);
        if (Number.isInteger(index)) { seen.push(index); observer.unobserve(entry.target); }
      }
      if (seen.length) setNear((current) => {
        if (seen.every((index) => current.has(index))) return current;
        const next = new Set(current);
        seen.forEach((index) => next.add(index));
        return next;
      });
    }, { root: container, rootMargin: "160px" });
    container.querySelectorAll<HTMLElement>("button[data-index]").forEach((button) => observer.observe(button));
    return () => observer.disconnect();
  }, [images]);
  useEffect(() => {
    // Scroll only the strip, never the page: option tiles below the gallery can change the photo on mobile.
    if (previousSelected.current === selected) return;
    previousSelected.current = selected;
    const container = strip.current;
    const button = container?.querySelector<HTMLElement>(`button[data-index="${selected}"]`);
    if (!container || !button || typeof container.scrollTo !== "function") return;
    container.scrollTo({
      top: button.offsetTop - (container.clientHeight - button.offsetHeight) / 2,
      left: button.offsetLeft - (container.clientWidth - button.offsetWidth) / 2,
      behavior: "auto",
    });
  }, [selected]);
  function advance(direction: number) {
    if (images.length > 1) onSelect((selected + direction + images.length) % images.length);
  }
  const neighbours = readySrc === src && images.length > 1
    ? [...new Set([images[(selected + 1) % images.length]!, images[(selected - 1 + images.length) % images.length]!])]
    : [];
  return (
    <div
      data-gallery
      className="flex flex-col-reverse gap-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand lg:flex-row lg:items-start lg:gap-3"
      role="group"
      aria-label="Product images"
      tabIndex={images.length > 1 ? 0 : undefined}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
        if (images.length > 1 && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
          event.preventDefault();
          advance(event.key === "ArrowRight" ? 1 : -1);
        }
      }}
    >
      {neighbours.map((href) => {
        const { props } = getImageProps({ src: href, alt: "", fill: true, sizes: STAGE_SIZES });
        return <link key={href} rel="preload" as="image" href={props.src} imageSrcSet={props.srcSet} imageSizes={props.srcSet ? props.sizes : undefined} />;
      })}
      <div data-thumbnails ref={strip} className={cn("flex gap-3 overflow-auto [scrollbar-width:none] lg:max-h-[min(900px,calc(100dvh-140px))] lg:w-[114px] lg:shrink-0 lg:flex-col", images.length < 2 && "hidden")}>
        {images.map((image, i) => (
          <button key={image} data-index={i} onClick={() => onSelect(i)} aria-label={"Show product image " + (i + 1)} aria-pressed={selected === i}
            className="relative aspect-[4/5] w-[76px] shrink-0 cursor-pointer overflow-hidden rounded-[15px] border-0 bg-cream p-0 after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] aria-pressed:after:shadow-[inset_0_0_0_2px_var(--color-espresso)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:w-full [&_img]:size-full [&_img]:object-cover">
            {near.has(i) || selected === i
              ? <ProductImage src={image} alt="" width={228} height={285} sizes="114px" />
              : <span aria-hidden="true" className="block size-full bg-cream" />}
          </button>
        ))}
      </div>
      <div className="relative flex-1 overflow-hidden rounded-[30px] bg-cream">
        {images.length ? (
          <button
            data-main-image
            className="relative block aspect-square w-full cursor-zoom-in overflow-hidden border-0 bg-cream p-0 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand lg:aspect-[4/5] [&_img]:object-cover"
            aria-label="Enlarge product image"
            onClick={(event) => {
              if (swiped.current && event.detail > 0) { swiped.current = false; return; }
              onZoom();
            }}
            onTouchStart={(event) => {
              swiped.current = false;
              const touch = event.touches[0];
              touchStart.current = event.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY } : null;
            }}
            onTouchMove={(event) => {
              const start = touchStart.current;
              const touch = event.touches[0];
              if (!start || !touch) return;
              const dx = Math.abs(touch.clientX - start.x);
              const dy = Math.abs(touch.clientY - start.y);
              if (event.touches.length !== 1 || (dy > 10 && dy > dx)) touchStart.current = null;
            }}
            onTouchCancel={() => { touchStart.current = null; }}
            onTouchEnd={(event) => {
              const start = touchStart.current;
              touchStart.current = null;
              const touch = event.changedTouches[0];
              if (!start || !touch || event.changedTouches.length !== 1 || event.touches.length) return;
              const dx = touch.clientX - start.x;
              const dy = touch.clientY - start.y;
              if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.25) {
                swiped.current = true;
                advance(dx < 0 ? 1 : -1);
              }
            }}
          >
            <span key={src} className="absolute inset-0 z-[1] transition-opacity duration-200 motion-reduce:transition-none" style={{ opacity: ready ? 1 : 0 }}>
              <ProductImage
                src={src}
                alt={title + " — view " + (selected + 1)}
                fill
                sizes={STAGE_SIZES}
                preload={src === initialSrc.current}
                onLoad={() => setReadySrc(src)}
                onError={() => setReadySrc(src)}
              />
            </span>
            {settledSrc && settledSrc !== src && (
              <span className="absolute inset-0" aria-hidden="true">
                <ProductImage src={settledSrc} alt="" fill sizes={STAGE_SIZES} />
              </span>
            )}
          </button>
        ) : (
          <div data-main-image className="grid aspect-square w-full place-content-center justify-items-center gap-2 text-meta text-taupe lg:aspect-[4/5]"><ProductImage alt={title} /></div>
        )}
        <button type="button" onClick={onSave} aria-label={saved ? "Remove from saved furniture" : "Save furniture"} aria-pressed={saved}
          className="absolute top-4 right-4 z-[2] grid size-10 cursor-pointer place-items-center rounded-full border-0 bg-white p-0 text-brand shadow-xs hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          <HeartIcon filled={saved} className="size-5" />
        </button>
        {images.length > 1 && (
          <div data-gallery-controls className="absolute top-1/2 right-[18px] z-[2] flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-full border border-solid border-brand/8 bg-white px-1.5 py-1.5 text-label text-brand">
            <button type="button" aria-label="Previous product image" onClick={() => advance(-1)}
              className="grid size-6 cursor-pointer place-items-center rounded-full border border-solid border-brand/10 bg-white p-0 text-brand hover:bg-cream focus-visible:outline-2 focus-visible:outline-brand"><ChevronUp aria-hidden="true" className="size-3.5" /></button>
            <span aria-live="polite" aria-atomic="true" className="py-1 [writing-mode:vertical-rl] tabular-nums">{selected + 1} / {images.length}</span>
            <button type="button" aria-label="Next product image" onClick={() => advance(1)}
              className="grid size-6 cursor-pointer place-items-center rounded-full border border-solid border-brand/10 bg-white p-0 text-brand hover:bg-cream focus-visible:outline-2 focus-visible:outline-brand"><ChevronDown aria-hidden="true" className="size-3.5" /></button>
          </div>
        )}
      </div>
    </div>
  );
}
