"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const stepMs = 4000;
const fits = (row: HTMLElement) => row.scrollWidth <= row.clientWidth + 2;
const stillMotion = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/**
 * The cities between two arrows (Figma 177:1159). It is a real row that scrolls, so a thumb can swipe it and a keyboard can
 * move it; each arrow moves it one city, and past either end it goes round. With the owner's switch on (`autoplay`) it
 * also moves on by itself, unless a visitor is on it or has asked for less motion. With every city in view the arrows step
 * aside. The cities themselves are drawn on the server and passed in, so nothing about them waits for this script.
 */
export function CityRail({ autoplay = true, children }: { autoplay?: boolean; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const held = useRef(false);
  const [overflowing, setOverflowing] = useState(true);
  const hold = (on: boolean) => { held.current = on; };

  const step = (direction: 1 | -1) => {
    const row = track.current, card = row?.querySelector<HTMLElement>(".home-city-card");
    if (!row || !card) return;
    const behavior = stillMotion() ? "auto" : "smooth";
    const last = row.scrollWidth - row.clientWidth;
    if (direction === 1 && row.scrollLeft >= last - 2) row.scrollTo?.({ left: 0, behavior });
    else if (direction === -1 && row.scrollLeft <= 2) row.scrollTo?.({ left: last, behavior });
    else row.scrollBy?.({ left: direction * (card.offsetWidth + (parseFloat(getComputedStyle(row).columnGap) || 20)), behavior });
  };
  const moveOn = useRef(step);
  moveOn.current = step;

  useEffect(() => {
    const row = track.current;
    if (!row) return;
    const measure = () => setOverflowing(!fits(row));
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(row);
    return () => { window.removeEventListener("resize", measure); observer?.disconnect(); };
  }, []);

  useEffect(() => {
    if (!autoplay || stillMotion()) return;
    const timer = setInterval(() => {
      const row = track.current;
      if (row && !held.current && document.visibilityState !== "hidden" && !fits(row)) moveOn.current(1);
    }, stepMs);
    return () => clearInterval(timer);
  }, [autoplay]);

  return (
    <div className="home-cities-rail" data-cities-rail role="group" aria-roledescription="carousel" aria-label="Cities served" data-overflowing={String(overflowing)}
      onMouseEnter={() => hold(true)} onMouseLeave={() => hold(false)} onFocus={() => hold(true)} onBlur={() => hold(false)}
      onTouchStart={() => hold(true)} onTouchEnd={() => hold(false)}>
      <button type="button" className="home-cities-arrow" data-cities-prev aria-label="Previous cities" hidden={!overflowing} onClick={() => step(-1)}>
        <ChevronLeft aria-hidden="true" strokeWidth={2.25} />
      </button>
      <div ref={track} className="home-city-track" tabIndex={0} aria-label="Cities served, scrollable">{children}</div>
      <button type="button" className="home-cities-arrow" data-cities-next aria-label="Next cities" hidden={!overflowing} onClick={() => step(1)}>
        <ChevronRight aria-hidden="true" strokeWidth={2.25} />
      </button>
    </div>
  );
}
