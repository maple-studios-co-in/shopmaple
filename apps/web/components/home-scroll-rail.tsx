"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A product row with a thin, always-visible scrollbar instead of arrows (the owner's choice for
 * Bestsellers). The bar is drawn here because macOS hides native scrollbars until scrolling.
 * Touch, trackpads, Shift+wheel and the keyboard scroll the row natively; a mouse can drag the
 * row or the bar, and a drag never opens the card it started on.
 */
export function HomeScrollRail({ label, children }: { label: string; children: ReactNode }) {
  const rail = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ size: number; offset: number } | null>(null);
  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const measure = () => {
      const overflow = element.scrollWidth - element.clientWidth;
      if (overflow <= 1) return setBar(null);
      const size = element.clientWidth / element.scrollWidth;
      setBar({ size, offset: (element.scrollLeft / overflow) * (1 - size) });
    };
    let origin: { x: number; left: number } | null = null;
    let dragged = false;
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      origin = { x: event.clientX, left: element.scrollLeft };
      dragged = false;
    };
    const move = (event: PointerEvent) => {
      if (!origin) return;
      const distance = event.clientX - origin.x;
      if (Math.abs(distance) > 4) dragged = true;
      if (dragged) element.scrollLeft = origin.left - distance;
    };
    const up = () => { origin = null; };
    const click = (event: MouseEvent) => {
      if (!dragged) return;
      event.preventDefault();
      event.stopPropagation();
      dragged = false;
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    element.addEventListener("scroll", measure, { passive: true });
    element.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    element.addEventListener("click", click, true);
    return () => {
      resize.disconnect();
      element.removeEventListener("scroll", measure);
      element.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      element.removeEventListener("click", click, true);
    };
  }, []);
  /** Clicking or dragging along the bar moves the row to that point. */
  const seek = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = rail.current, line = track.current;
    if (!element || !line || !bar || (event.type === "pointermove" && event.buttons !== 1)) return;
    const box = line.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left - (box.width * bar.size) / 2) / (box.width * (1 - bar.size))));
    element.scrollLeft = ratio * (element.scrollWidth - element.clientWidth);
  };
  return (
    <div className="home-scroll">
      <div ref={rail} className="home-product-rail home-scroll-rail" data-scroll-rail role="group" aria-label={label} tabIndex={0}>
        {children}
      </div>
      <div ref={track} className="home-scroll-track" aria-hidden="true" hidden={!bar} onPointerDown={seek} onPointerMove={seek}>
        {bar && <span style={{ width: `${bar.size * 100}%`, left: `${bar.offset * 100}%` }} />}
      </div>
    </div>
  );
}
