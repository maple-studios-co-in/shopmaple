"use client";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * A product row with neither arrows nor a scrollbar (the Impact Layout frame's Bestsellers).
 * Touch, trackpads, Shift+wheel and the keyboard scroll the row natively; a mouse can drag the
 * row, and a drag never opens the card it started on. Card snapping is paused while dragging so
 * the row follows the pointer, then settles on the nearest card.
 *
 * Only a row with more than fits is draggable: `data-scrollable` (kept up to date as the window or the cards change
 * size) brings the grab hand, so a wide screen showing every card offers no drag (QA report, 16 Nov 2026).
 */
export function HomeScrollRail({ label, children }: { label: string; children: ReactNode }) {
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    let origin: { x: number; left: number } | null = null;
    let dragged = false;
    const measure = () => element.toggleAttribute("data-scrollable", element.scrollWidth > element.clientWidth + 1);
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    if (observer) {
      observer.observe(element);
      for (const child of element.children) observer.observe(child);
    }
    window.addEventListener("resize", measure);
    const stop = () => {
      origin = null;
      element.removeAttribute("data-dragging");
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0 || !element.hasAttribute("data-scrollable")) return;
      origin = { x: event.clientX, left: element.scrollLeft };
      dragged = false;
    };
    const move = (event: PointerEvent) => {
      if (!origin) return;
      // A released button that the page never saw (outside the window) ends the drag.
      if (!(event.buttons & 1)) return stop();
      const distance = event.clientX - origin.x;
      if (!dragged && Math.abs(distance) > 4) {
        dragged = true;
        element.setAttribute("data-dragging", "");
      }
      if (dragged) element.scrollLeft = origin.left - distance;
    };
    const click = (event: MouseEvent) => {
      if (!dragged) return;
      event.preventDefault();
      event.stopPropagation();
      dragged = false;
    };
    // Links and images would otherwise start the browser's own drag and cancel the pointer.
    const nativeDrag = (event: DragEvent) => event.preventDefault();
    element.addEventListener("pointerdown", down);
    element.addEventListener("dragstart", nativeDrag);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    element.addEventListener("click", click, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("dragstart", nativeDrag);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      element.removeEventListener("click", click, true);
    };
  }, []);
  return (
    <div className="home-scroll">
      <div ref={rail} className="home-product-rail home-scroll-rail" data-scroll-rail role="group" aria-label={label} tabIndex={0}>
        {children}
      </div>
    </div>
  );
}
