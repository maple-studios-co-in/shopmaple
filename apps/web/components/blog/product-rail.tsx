"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The Shop Bestsellers row (Figma 268:4374): cards side by side that swipe or scroll, with a dot for each place the row
 * can start from (twelve cards four at a time make nine). The dots appear once the row is measured in the browser.
 */
export function BlogProductRail({ label, children }: { label: string; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [places, setPlaces] = useState(0);
  const [place, setPlace] = useState(0);
  useEffect(() => {
    const row = track.current;
    if (!row) return;
    const cards = () => [...row.children] as HTMLElement[];
    const stride = () => { const [a, b] = cards(); return a && b ? b.offsetLeft - a.offsetLeft : row.clientWidth || 1; };
    const measure = () => {
      const all = cards();
      if (!all.length || !row.clientWidth) return setPlaces(0);
      const inView = Math.max(1, Math.round((row.clientWidth + 16) / stride()));
      setPlaces(Math.max(0, all.length - inView + 1));
    };
    const follow = () => setPlace(Math.round(row.scrollLeft / stride()));
    measure();
    row.addEventListener("scroll", follow, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(row);
    return () => { row.removeEventListener("scroll", follow); observer?.disconnect(); };
  }, []);
  const go = (at: number) => {
    const row = track.current;
    const card = row?.children[at] as HTMLElement | undefined;
    if (row && card) row.scrollTo?.({ left: card.offsetLeft - (row.children[0] as HTMLElement).offsetLeft, behavior: "smooth" });
  };
  return (
    <div data-blog-rail className="blog-rail">
      <div ref={track} className="blog-rail-track" role="group" aria-label={label} tabIndex={0}>{children}</div>
      {places > 1 && (
        <div className="blog-rail-dots">
          {Array.from({ length: places }, (_, at) => (
            <button key={at} type="button" className="blog-dot-button" aria-label={`Scroll to product ${at + 1}`}
              aria-current={at === place ? "true" : undefined} onClick={() => go(at)} />
          ))}
        </div>
      )}
    </div>
  );
}
