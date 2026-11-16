"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

/** Whether the row has more than it shows, and whether it sits at either end. */
type Edges = { overflow: boolean; start: boolean; end: boolean };
const sameEdges = (a: Edges, b: Edges) => a.overflow === b.overflow && a.start === b.start && a.end === b.end;
function edgesOf(element: HTMLElement): Edges {
  const room = element.scrollWidth - element.clientWidth;
  return { overflow: room > 1, start: element.scrollLeft <= 1, end: element.scrollLeft >= room - 1 };
}

export function HomeCarousel({ children, label, autoplay = false, railClassName = "home-product-rail", className = "" }: {
  children: ReactNode;
  label: string;
  autoplay?: boolean;
  railClassName?: string;
  className?: string;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const id = useId();
  const pointerPauseIntent = useRef<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  // The arrows show only while the row holds more than fits, each fading at its own end (QA report, 16 Nov 2026: on a
  // wide screen every chair was in view and the arrows still offered more).
  const [edges, setEdges] = useState<Edges>({ overflow: false, start: true, end: false });
  const measure = useCallback(() => {
    const element = rail.current;
    if (!element) return;
    const next = edgesOf(element);
    setEdges(previous => (sameEdges(previous, next) ? previous : next));
  }, []);

  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    // Cards that load or change size after the first paint change how much there is to scroll.
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    if (observer) {
      observer.observe(element);
      for (const child of element.children) observer.observe(child);
    }
    return () => {
      element.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [measure]);
  useEffect(measure, [measure, visible, hovered]);

  useEffect(() => {
    setReady(true);
    const media = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    const updateMotion = () => setReduced(media?.matches ?? true);
    const updateVisibility = () => setPageVisible(!document.hidden);
    updateMotion();
    updateVisibility();
    media?.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateVisibility);
    const visibilityThreshold = 0.15;
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(
      entries => {
        const latest = entries.reduce<IntersectionObserverEntry | undefined>(
          (current, entry) => entry.target === rail.current && (!current || entry.time >= current.time) ? entry : current,
          undefined,
        );
        if (latest) setVisible(latest.isIntersecting && latest.intersectionRatio >= visibilityThreshold);
      },
      { threshold: visibilityThreshold },
    );
    if (observer && rail.current) observer.observe(rail.current);
    else setVisible(false);
    return () => {
      media?.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!autoplay || paused || hovered || reduced || !visible || !pageVisible) return;
    const timer = setInterval(() => {
      const element = rail.current;
      if (!element || element.scrollWidth <= element.clientWidth) return;
      if (element.scrollLeft + element.clientWidth >= element.scrollWidth - 2) {
        element.scrollTo({ left: 0, behavior: "instant" });
      } else {
        element.scrollBy({ left: element.clientWidth, behavior: "smooth" });
      }
    }, 4500);
    return () => clearInterval(timer);
  }, [autoplay, paused, hovered, reduced, visible, pageVisible]);

  function move(direction: number) {
    const element = rail.current;
    if (!element) return;
    // Read afresh: a smooth scroll may still be under way since the arrows last changed.
    const now = edgesOf(element);
    if (!now.overflow || (direction < 0 ? now.start : now.end)) return;
    if (autoplay) setPaused(true);
    element.scrollBy({
      left: element.clientWidth * direction,
      behavior: typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  const controls = (
    <div className="home-carousel-controls" hidden={!ready || !edges.overflow}>
      {autoplay && <button className="motion-playback-control" type="button" aria-controls={id} disabled={reduced}
        aria-label={`${paused || reduced ? "Play" : "Pause"} ${label}`}
        title={reduced ? "Automatic motion is off because you prefer reduced motion" : undefined}
        onPointerDown={() => { pointerPauseIntent.current = !paused; }}
        onPointerCancel={() => { pointerPauseIntent.current = null; }}
        onKeyDown={() => { pointerPauseIntent.current = null; }}
        onClick={() => {
          const intent = pointerPauseIntent.current;
          pointerPauseIntent.current = null;
          setPaused(value => intent ?? !value);
        }}>
        <span className="sr-only">Toggle motion</span>
      </button>}
      {/* At an end the arrow stays focusable (a keyboard press never loses its place) but says it has nothing further. */}
      <button type="button" onClick={() => move(-1)} aria-controls={id} aria-label={`Previous ${label}`} aria-disabled={edges.start || undefined}><ArrowLeft size={20} aria-hidden="true" /></button>
      <button type="button" onClick={() => move(1)} aria-controls={id} aria-label={`Next ${label}`} aria-disabled={edges.end || undefined}><ArrowRight size={20} aria-hidden="true" /></button>
    </div>
  );

  return (
    <div className={`home-carousel ${autoplay ? "home-carousel-autoplay" : ""} ${className}`} role="group" aria-label={label} aria-roledescription="carousel"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => { if (autoplay) setPaused(true); }}>
      {autoplay && controls}
      <div className={railClassName} id={id} ref={rail} aria-label={label} tabIndex={0}
        onPointerDown={() => { if (autoplay) setPaused(true); }}
        onWheel={event => {
          if (autoplay && (event.deltaX !== 0 || (event.shiftKey && event.deltaY !== 0))) setPaused(true);
        }}>
        {children}
      </div>
      {!autoplay && controls}
    </div>
  );
}
