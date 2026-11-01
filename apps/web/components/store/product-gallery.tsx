"use client";
import { useEffect, useId, useRef, useState } from "react";
import { getImageProps } from "next/image";
import { Heart, Plus } from "lucide-react";
import type { Hotspot } from "@/lib/product-hotspots";
import { cx } from "@/lib/cx";
import { ProductImage } from "./product-image";

// The photo column: the window less the gutters, the gap, the buy box (at least 455 px, 32 % of the grid) and the thumbnail strip.
const STAGE_SIZES = "(max-width:1023px) 100vw, calc(100vw - 257px - max(455px, (100vw - 96px) * 0.32))";
// Thumbnails beyond this count mount their image only once they near the strip's viewport.
const EAGER_THUMBNAILS = 12;
const initialWindow = (count: number) => new Set(Array.from({ length: Math.min(count, EAGER_THUMBNAILS) }, (_, i) => i));

export function ProductGallery({ images, title, selected, onSelect, onZoom, saved, onSave, hotspotImage, hotspots = [] }: {
  images: string[];
  title: string;
  selected: number;
  onSelect: (index: number) => void;
  onZoom: () => void;
  saved: boolean;
  onSave: () => void;
  /** A white-background photo among `images`; while it is shown, `hotspots` mark its details. */
  hotspotImage?: string;
  hotspots?: Hotspot[];
}) {
  const src = images[selected];
  const cutout = Boolean(hotspotImage) && src === hotspotImage;
  const [openSpot, setOpenSpot] = useState<number | null>(null);
  const spotLayer = useRef<HTMLDivElement>(null);
  const noteId = useId();
  // A note belongs to the photo and finish it was opened on.
  useEffect(() => setOpenSpot(null), [src]);
  useEffect(() => {
    if (openSpot === null) return;
    const close = (event: PointerEvent) => { if (!spotLayer.current?.contains(event.target as Node)) setOpenSpot(null); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [openSpot]);
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
      className={cx("flex min-w-0 flex-col gap-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand sm:gap-4", images.length > 1 && "lg:grid lg:grid-cols-[114px_minmax(0,1fr)] lg:items-start lg:gap-3")}
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
      <div className={cx("relative overflow-hidden rounded-[20px] lg:rounded-[30px]", cutout ? "border border-solid border-maple/8 bg-white" : "bg-cream", images.length > 1 && "lg:col-start-2")}>
        {images.length ? (
          <button
            data-main-image
            className={cx("relative block aspect-[4/5] w-full cursor-zoom-in overflow-hidden border-0 p-0 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand 2xl:aspect-square", cutout ? "bg-white [&_img]:object-contain" : "bg-cream [&_img]:object-cover")}
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
          <div data-main-image className="grid aspect-[4/5] w-full 2xl:aspect-square place-content-center justify-items-center gap-2 text-meta text-[#5e574f]"><ProductImage alt={title} /></div>
        )}
        {cutout && hotspots.length > 0 && (
          // Markers sit over the white-background photo, which is drawn 4:5 and centred in the stage.
          <div ref={spotLayer} data-hotspots className="pointer-events-none absolute inset-0 z-[3] grid place-items-center"
            onKeyDown={(event) => {
              if (event.key !== "Escape" || openSpot === null) return;
              event.stopPropagation();
              const opened = openSpot;
              setOpenSpot(null);
              spotLayer.current?.querySelectorAll<HTMLElement>("button[data-hotspot]")[opened]?.focus();
            }}>
            <div className="relative aspect-[4/5] h-full max-w-full">
              {hotspots.map((spot, i) => {
                const open = openSpot === i;
                const left = `${Math.round(spot.x * 1000) / 10}%`;
                const top = `${Math.round(spot.y * 1000) / 10}%`;
                return (
                  <div key={spot.label}>
                    <button type="button" data-hotspot aria-label={spot.label} aria-expanded={open} aria-controls={open ? noteId : undefined}
                      onClick={() => setOpenSpot(open ? null : i)} style={{ left, top }}
                      className="pointer-events-auto absolute grid size-8 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-solid border-maple bg-white p-0 text-maple shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple">
                      <span aria-hidden="true" className="absolute inset-0 rounded-full bg-maple/30 motion-safe:animate-ping" />
                      <Plus aria-hidden="true" strokeWidth={2.4} className={cx("relative size-4 transition-transform motion-reduce:transition-none", open && "rotate-45")} />
                    </button>
                    {open && (
                      <div id={noteId} data-hotspot-note role="group" aria-label={spot.label}
                        style={{ [spot.y > 0.5 ? "bottom" : "top"]: spot.y > 0.5 ? `calc(${100 - Math.round(spot.y * 1000) / 10}% + 22px)` : `calc(${top} + 22px)`, ...(spot.x < 0.35 ? { left: `calc(${left} - 16px)` } : spot.x > 0.65 ? { right: `calc(${100 - Math.round(spot.x * 1000) / 10}% - 16px)` } : { left, transform: "translateX(-50%)" }) }}
                        className="pointer-events-auto absolute z-[4] w-[min(240px,70%)] rounded-[10px] border border-solid border-maple/10 bg-white p-3 text-left text-[13px] leading-[1.45] text-black shadow-md">
                        <strong className="block text-[12px] font-semibold text-maple">{spot.label}</strong>{" "}
                        <span>{spot.note}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <button type="button" onClick={onSave} aria-label={saved ? "Remove from saved furniture" : "Save furniture"} aria-pressed={saved}
          className="absolute top-4 right-4 z-[2] grid size-10 cursor-pointer place-items-center rounded-full border-0 bg-white p-0 text-brand shadow-xs hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          <Heart aria-hidden="true" strokeWidth={1.6} className={saved ? "size-5 fill-current" : "size-5"} />
        </button>
        {images.length > 1 && (
          // The arrows show below 1024 px, where the thumbnail row scrolls; the position is announced at every width.
          <span data-gallery-status aria-live="polite" aria-atomic="true" className="sr-only">Photo {selected + 1} of {images.length}</span>
        )}
        {images.length > 1 && (
          // The frame's vertical pill beside the large photo: previous, a track showing the position, next.
          <div data-gallery-controls className="absolute top-1/2 right-[18px] z-[2] flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-[30px] border border-solid border-maple/8 bg-white px-[6.5px] py-[5.5px]">
            <button type="button" aria-label="Previous product image" onClick={() => advance(-1)}
              className="grid size-6 cursor-pointer place-items-center rounded-full border border-solid border-maple/8 bg-white p-0 hover:bg-cream focus-visible:outline-2 focus-visible:outline-maple">
              {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design chevron, turned to point up */}
              <img src="/product-page/arrow-prev.svg" alt="" width={8} height={6} className="rotate-90" />
            </button>
            <span aria-hidden="true" className="relative my-1 block h-[60px] w-1.5 overflow-hidden rounded-full bg-maple/10">
              <span className="absolute inset-x-0 rounded-full bg-maple transition-[top] duration-200 motion-reduce:transition-none" style={{ top: `${(selected / images.length) * 100}%`, height: `${100 / images.length}%` }} />
            </span>
            <button type="button" aria-label="Next product image" onClick={() => advance(1)}
              className="grid size-6 cursor-pointer place-items-center rounded-full border border-solid border-maple/8 bg-white p-0 hover:bg-cream focus-visible:outline-2 focus-visible:outline-maple">
              {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design chevron, turned to point down */}
              <img src="/product-page/arrow-next.svg" alt="" width={8} height={6} className="rotate-90" />
            </button>
          </div>
        )}
      </div>
      <div data-thumbnails ref={strip} className={cx("flex gap-3 overflow-x-auto [scrollbar-width:none] sm:gap-4 lg:order-first lg:col-start-1 lg:h-0 lg:min-h-full lg:flex-col lg:self-stretch lg:overflow-x-hidden lg:overflow-y-auto lg:gap-4", images.length < 2 && "hidden")}>
        {images.map((image, i) => (
          <button key={image} data-index={i} onClick={() => onSelect(i)} aria-label={"Show product image " + (i + 1)} aria-pressed={selected === i}
            className="relative aspect-[4/5] shrink-0 basis-[calc((100%-36px)/4)] cursor-pointer overflow-hidden rounded-[15px] border-0 bg-cream p-0 after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] aria-pressed:after:shadow-[inset_0_0_0_2px_#563c49] lg:basis-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand sm:basis-[calc((100%-48px)/4)] [&_img]:size-full [&_img]:object-cover">
            {near.has(i) || selected === i
              ? <ProductImage src={image} alt="" width={228} height={285} sizes="(max-width:1023px) 25vw, 114px" />
              : <span aria-hidden="true" className="block size-full bg-cream" />}
          </button>
        ))}
      </div>
    </div>
  );
}
