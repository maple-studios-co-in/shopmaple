"use client";
import { Children, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

export type JourneyMarker = { key: string; label: string };
type Drag = { id: number; x: number; y: number; time: number; moving: boolean };

/** A drag turns the chapter past this share of the slider's width, or a shorter flick at this speed (px per ms). */
const swipeShare = 0.18, flickSpeed = 0.5, flickMin = 30;
/** Past the first or last chapter the track gives this much of the pull, then springs back. */
const edgeGive = 0.35;

/**
 * The Maple journey's timeline (Figma 293:1434, owner 10 Nov 2026): one chapter in view, its photo beside its story; the
 * years under it choose a chapter, a single dot gliding to the chosen year, and the arrows step through. The chapters
 * are drawn on the server and passed in; this only moves between them, by the years, the arrows, the arrow and Home/End
 * keys, a swipe, or a mouse dragging the photo (so the story's text stays selectable). A chapter out of view is hidden
 * from screen readers and takes no focus.
 */
export function StoryJourneySlider({ label, markers, children }: { label: string; markers: readonly JourneyMarker[]; children: ReactNode }) {
  const slides = Children.toArray(children);
  const last = slides.length - 1;
  const [index, setIndex] = useState(0);
  const [distance, setDistance] = useState(1);
  const [dragging, setDragging] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const years = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const focusYear = useRef(false);

  const go = (next: number) => {
    const target = Math.max(0, Math.min(last, next));
    if (target === index) return;
    setDistance(Math.abs(target - index));
    setIndex(target);
  };
  const pull = (px: number) => track.current?.style.setProperty("--story-drag", `${Math.round(px)}px`);

  // The chosen year takes focus when the keys chose it, and on a narrow screen scrolls to the middle of its strip.
  useEffect(() => {
    const list = years.current;
    const tab = list?.querySelectorAll<HTMLElement>('[role="tab"]')[index];
    if (!list || !tab) return;
    if (focusYear.current) tab.focus();
    focusYear.current = false;
    if (list.scrollWidth <= list.clientWidth) return;
    const left = Math.max(0, Math.min(list.scrollWidth - list.clientWidth, tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2));
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo?.({ left, behavior: still ? "auto" : "smooth" });
  }, [index]);

  // Stacked on a narrow screen, the slider is as tall as the chapter in view (it eases to the next one's height); the
  // stylesheet sets this aside where photo and story sit side by side.
  useLayoutEffect(() => {
    const frame = viewport.current, slide = track.current?.children[index] as HTMLElement | undefined;
    if (!frame || !slide) return;
    const fit = () => { if (slide.offsetHeight) frame.style.height = `${slide.offsetHeight}px`; };
    fit();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(fit);
    observer.observe(slide);
    return () => observer.disconnect();
  }, [index]);

  // The photos wait (loading="lazy") until the journey nears the screen, then all load, so none arrives blank as it slides in.
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const warm = () => element.querySelectorAll('img[loading="lazy"]').forEach(img => img.setAttribute("loading", "eager"));
    if (typeof IntersectionObserver !== "function") { warm(); return; }
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      warm();
      observer.disconnect();
    }, { rootMargin: "800px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const onYear = (event.target as HTMLElement).getAttribute("role") === "tab";
    const next = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1
      : onYear && event.key === "Home" ? 0 : onYear && event.key === "End" ? last : null;
    if (next === null) return;
    event.preventDefault();
    if (Math.max(0, Math.min(last, next)) !== index) focusYear.current = onYear;
    go(next);
  }
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    // A mouse moves the chapters only by its photo, so the text can still be selected; a finger or pen anywhere.
    const mouse = event.pointerType === "mouse";
    if (last < 1 || (mouse && (event.button !== 0 || !(event.target as Element).closest(".story-chapter-media")))) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, moving: false };
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const held = drag.current;
    if (!held || held.id !== event.pointerId) return;
    const dx = event.clientX - held.x, dy = event.clientY - held.y;
    if (!held.moving) {
      // Mostly up or down is the page scrolling, not the slider.
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { drag.current = null; return; }
      if (Math.abs(dx) < 8) return;
      held.moving = true;
      setDragging(true);
      try { viewport.current?.setPointerCapture?.(event.pointerId); } catch { /* the pointer has already gone */ }
    }
    pull((index === 0 && dx > 0) || (index === last && dx < 0) ? dx * edgeGive : dx);
  }
  function release(event: PointerEvent<HTMLDivElement>, cancelled: boolean) {
    const held = drag.current;
    if (!held || held.id !== event.pointerId) return;
    drag.current = null;
    if (!held.moving) return;
    const dx = event.clientX - held.x;
    const width = viewport.current?.clientWidth || 1;
    const speed = Math.abs(dx) / Math.max(1, event.timeStamp - held.time);
    pull(0);
    setDragging(false);
    if (!cancelled && (Math.abs(dx) >= width * swipeShare || (Math.abs(dx) >= flickMin && speed >= flickSpeed))) go(index + (dx < 0 ? 1 : -1));
  }

  return (
    <div ref={root} className="story-timeline" role="group" aria-roledescription="carousel" aria-label={label}
      data-dragging={dragging ? "" : undefined} onKeyDown={onKeyDown}
      style={{ "--story-index": index, "--story-distance": distance, "--story-count": slides.length } as CSSProperties}>
      <div ref={viewport} className="story-timeline-viewport" aria-live="polite"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={event => release(event, false)} onPointerCancel={event => release(event, true)}
        onDragStart={event => event.preventDefault()}>
        <div ref={track} className="story-timeline-track">
          {slides.map((slide, at) => (
            <div key={markers[at]?.key ?? at} id={`${id}-chapter-${at}`} className="story-timeline-slide" role="tabpanel"
              aria-roledescription="slide" aria-labelledby={`${id}-year-${at}`} data-active={at === index ? "" : undefined}
              inert={at !== index} aria-hidden={at === index ? undefined : true}>
              {slide}
            </div>
          ))}
        </div>
      </div>
      <div className="story-timeline-nav">
        <div ref={years} className="story-timeline-years" role="tablist" aria-label="Chapters">
          <span className="story-timeline-dot" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- the design's 14px marker */}
            <img src="/media/our-story/journey-dot.svg" width={14} height={14} alt="" />
          </span>
          {markers.map((marker, at) => (
            <button key={marker.key} type="button" role="tab" id={`${id}-year-${at}`} className="story-timeline-year"
              aria-selected={at === index} aria-controls={`${id}-chapter-${at}`} tabIndex={at === index ? 0 : -1}
              onClick={() => go(at)}>
              {marker.label}
            </button>
          ))}
        </div>
        <div className="story-timeline-arrows">
          {/* Spent at either end but still focusable, so focus never drops to the page. */}
          <button type="button" className="story-timeline-arrow" aria-label="Previous chapter" aria-disabled={index === 0} onClick={() => go(index - 1)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the design's 24px chevron */}
            <img src="/media/our-story/previous.svg" width={24} height={24} alt="" />
          </button>
          <button type="button" className="story-timeline-arrow" aria-label="Next chapter" aria-disabled={index === last} onClick={() => go(index + 1)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the design's 24px chevron */}
            <img src="/media/our-story/next.svg" width={24} height={24} alt="" />
          </button>
        </div>
      </div>
    </div>
  );
}
