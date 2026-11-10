"use client";
import { Children, useRef, useState, type ReactNode } from "react";

/**
 * The listing's slider of the newest stories (Figma 268:4339): one story in view, the arrows and dots under it. The
 * stories are drawn on the server and passed in; this only moves between them, by the arrows, the dots, the left and
 * right keys, or a swipe. A story out of view is hidden from screen readers and takes no focus; a swipe or drag never
 * opens the story it started on.
 */
export function BlogFeaturedSlider({ label, children }: { label: string; children: ReactNode }) {
  const slides = Children.toArray(children);
  const [index, setIndex] = useState(0);
  const start = useRef<number | null>(null);
  const swiped = useRef(false);
  const go = (next: number) => setIndex(Math.max(0, Math.min(slides.length - 1, next)));
  const last = slides.length - 1;
  return (
    <div data-blog-featured role="group" aria-roledescription="carousel" aria-label={label} className="blog-featured"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") go(index - 1);
        if (event.key === "ArrowRight") go(index + 1);
      }}>
      <div className="blog-featured-viewport"
        onPointerDown={(event) => { start.current = event.clientX; swiped.current = false; }}
        onPointerUp={(event) => {
          if (start.current === null) return;
          const moved = event.clientX - start.current;
          start.current = null;
          if (Math.abs(moved) > 40) {
            swiped.current = true;
            go(index + (moved < 0 ? 1 : -1));
          }
        }}
        onPointerCancel={() => { start.current = null; }}
        onClickCapture={(event) => {
          if (!swiped.current) return;
          swiped.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        onDragStart={(event) => event.preventDefault()}>
        <div data-blog-slides className="blog-featured-track" style={{ transform: `translateX(-${index * 100}%)` }}>
          {slides.map((slide, at) => (
            <div key={at} data-slide-frame className="blog-featured-frame" role="group" aria-roledescription="slide"
              aria-label={`${at + 1} of ${slides.length}`} aria-hidden={at === index ? undefined : true} inert={at !== index}>
              {slide}
            </div>
          ))}
        </div>
      </div>
      {slides.length > 1 && (
        <div className="blog-featured-controls">
          <button type="button" data-slide-prev className="blog-slider-arrow" aria-label="Previous story" disabled={index === 0} onClick={() => go(index - 1)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
            <img src="/blog/slider-previous.svg" alt="" width={15} height={15} />
          </button>
          <div className="blog-featured-dots">
            {slides.map((_, at) => (
              <button key={at} type="button" data-slide-dot className="blog-dot-button" aria-label={`Show story ${at + 1} of ${slides.length}`}
                aria-current={at === index ? "true" : undefined} onClick={() => go(at)} />
            ))}
          </div>
          <button type="button" data-slide-next className="blog-slider-arrow" aria-label="Next story" disabled={index === last} onClick={() => go(index + 1)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
            <img src="/blog/slider-next.svg" alt="" width={15} height={15} />
          </button>
        </div>
      )}
    </div>
  );
}
