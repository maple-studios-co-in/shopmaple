"use client";
import { useEffect, useRef, useState } from "react";
import { getImageProps } from "next/image";
import { ChevronLeft, ChevronRight, Heart } from "lucide-react";
import { ProductImage } from "./product-image";

const STAGE_SIZES = "(max-width:749px) 100vw, 44vw";
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
      className="product-gallery pdp-gallery"
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
      <div className="product-thumbnails" ref={strip}>
        {images.map((image, i) => (
          <button key={image} data-index={i} onClick={() => onSelect(i)} aria-label={"Show product image " + (i + 1)} aria-pressed={selected === i}>
            {near.has(i) || selected === i
              ? <ProductImage src={image} alt="" width={76} height={76} />
              : <span className="product-thumbnail-pending" aria-hidden="true" />}
          </button>
        ))}
      </div>
      <div className="pdp-gallery-stage">
        {images.length ? (
          <button
            className="product-main-image"
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
            <span key={src} className="pdp-gallery-image pdp-gallery-incoming" style={{ opacity: ready ? 1 : 0 }}>
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
              <span className="pdp-gallery-image" aria-hidden="true">
                <ProductImage src={settledSrc} alt="" fill sizes={STAGE_SIZES} />
              </span>
            )}
          </button>
        ) : (
          <div className="product-main-image"><ProductImage alt={title} /></div>
        )}
        <button className={"icon-button pdp-save" + (saved ? " saved" : "")} onClick={onSave}
          aria-label={saved ? "Remove from saved furniture" : "Save furniture"} aria-pressed={saved}>
          <Heart />
        </button>
        {images.length > 1 && (
          <div className="pdp-gallery-controls">
            <button className="icon-button" aria-label="Previous product image" onClick={() => advance(-1)}><ChevronLeft size={18} /></button>
            <span aria-live="polite" aria-atomic="true">{selected + 1} / {images.length}</span>
            <button className="icon-button" aria-label="Next product image" onClick={() => advance(1)}><ChevronRight size={18} /></button>
          </div>
        )}
      </div>
    </div>
  );
}
