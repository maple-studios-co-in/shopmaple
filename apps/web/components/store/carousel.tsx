"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { clsx } from "clsx";
import { arrowButton, playButton, productRail, productRailMobile, railFocus } from "./carousel-styles";

/*
 * The horizontal rail with previous/next controls (and, for the moving rows, a play/pause
 * control) used by the homepage rails, the Instagram and cities rows, the legacy Chairs
 * editorial and the category rails. Utilities restate the legacy `.home-carousel` rules in the
 * storefront's current look; each context passes its own rail, control and button classes so no
 * two utilities on one element compete.
 */

export type CarouselButtons = { previous?: string; next?: string; play?: string };

export function HomeCarousel({
  children,
  label,
  autoplay = false,
  className,
  railClassName = clsx(productRail, productRailMobile),
  controlsClassName = "mt-5",
  buttons,
}: {
  children: ReactNode;
  label: string;
  autoplay?: boolean;
  /** Extra classes for the carousel root. */
  className?: string;
  /** The rail's layout; the product rail by default. */
  railClassName?: string;
  /** Spacing and placement of the control row. */
  controlsClassName?: string;
  /** Replacement classes for the previous, next and play buttons. */
  buttons?: CarouselButtons;
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
    if (autoplay) setPaused(true);
    const element = rail.current;
    element?.scrollBy({
      left: element.clientWidth * direction,
      behavior: typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  const controls = (
    <div data-carousel-controls className={clsx("flex justify-end gap-2.5 [&[hidden]]:hidden", autoplay && "order-1", controlsClassName)} hidden={!ready}>
      {autoplay && <button data-carousel-play className={clsx("group/play", buttons?.play ?? playButton)} type="button" aria-controls={id} disabled={reduced}
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
        <span className="sr-only group-focus-visible/play:static group-focus-visible/play:size-auto group-focus-visible/play:[clip:auto] group-focus-visible/play:[clip-path:none]">Toggle motion</span>
      </button>}
      <button className={buttons?.previous ?? arrowButton} type="button" onClick={() => move(-1)} aria-controls={id} aria-label={`Previous ${label}`}><ArrowLeft size={20} aria-hidden="true" /></button>
      <button className={buttons?.next ?? arrowButton} type="button" onClick={() => move(1)} aria-controls={id} aria-label={`Next ${label}`}><ArrowRight size={20} aria-hidden="true" /></button>
    </div>
  );

  return (
    <div data-store data-carousel className={clsx("group/carousel", autoplay && "flex flex-col", className)} role="group" aria-label={label} aria-roledescription="carousel"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => { if (autoplay) setPaused(true); }}>
      {autoplay && controls}
      <div data-carousel-rail className={clsx(railClassName, railFocus)} id={id} ref={rail} aria-label={label} tabIndex={0}
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
