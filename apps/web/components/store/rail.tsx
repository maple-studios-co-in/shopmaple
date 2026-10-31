"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const arrow = "absolute z-10 grid size-10 cursor-pointer place-items-center rounded-full border border-sand bg-white text-espresso shadow-[0_4px_14px_rgba(41,37,31,0.12)] transition-colors hover:bg-cream hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:invisible";

/**
 * A row that scrolls sideways: the track is focusable (arrow keys scroll it) and two labelled
 * buttons page through it. A button hides while there is nothing more in its direction.
 */
export function Rail({ label, children, trackClassName, controlsClassName }: {
  label: string;
  children: ReactNode;
  trackClassName?: string;
  /** Positions the buttons, for example their vertical centre or the widths where they show. */
  controlsClassName?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const update = () => setEdges({
      // A few pixels of slack: snapping can rest the first or last item just off the edge.
      start: element.scrollLeft <= 8,
      end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 8,
    });
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, []);

  const page = (direction: 1 | -1) => {
    const element = track.current;
    if (!element) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? true;
    element.scrollBy({ left: direction * Math.max(element.clientWidth * 0.8, 160), behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <div data-rail className="relative">
      <div
        ref={track}
        data-rail-track
        role="region"
        aria-label={label}
        tabIndex={0}
        className={cn(
          "flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand [&::-webkit-scrollbar]:hidden",
          trackClassName,
        )}
      >
        {children}
      </div>
      <button type="button" aria-label={`Previous ${label}`} disabled={edges.start} onClick={() => page(-1)} className={cn(arrow, "left-0 -translate-x-1/3", controlsClassName)}>
        <ChevronLeft aria-hidden="true" className="size-5" />
      </button>
      <button type="button" aria-label={`Next ${label}`} disabled={edges.end} onClick={() => page(1)} className={cn(arrow, "right-0 translate-x-1/3", controlsClassName)}>
        <ChevronRight aria-hidden="true" className="size-5" />
      </button>
    </div>
  );
}
