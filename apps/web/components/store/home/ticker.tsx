"use client";

import { useEffect, useId, useRef, useState } from "react";


export function HomeTicker({ text, autoplay = true }: { text: string; autoplay?: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  const id = useId();
  const [supported, setSupported] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const media = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const updateMotion = () => setReduced(media?.matches ?? true);
    const updateVisibility = () => setPageVisible(!document.hidden);
    const threshold = 0.15;
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
      const latest = entries.reduce<IntersectionObserverEntry | undefined>((current, entry) =>
        entry.target === element.current && (!current || entry.time >= current.time) ? entry : current, undefined);
      if (latest) setVisible(latest.isIntersecting && latest.intersectionRatio >= threshold);
    }, { threshold });
    updateMotion();
    updateVisibility();
    setSupported(Boolean(media && observer));
    media?.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateVisibility);
    if (observer && element.current) observer.observe(element.current);
    return () => {
      observer?.disconnect();
      media?.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  const animated = autoplay && supported && !reduced;
  const running = animated && visible && pageVisible && !paused && !hovered && !focused;

  return (
    <div data-store className="w-full px-16 py-6 max-[1024px]:px-8 max-[750px]:px-4">
      <div ref={element} data-home-ticker data-animated={animated || undefined}
        className="relative overflow-hidden rounded-[14px] bg-brand px-4 py-5 text-center font-serif text-[clamp(22px,2.6vw,36px)] leading-tight text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)] data-[animated]:px-0 md:py-6"
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
        <p id={id} data-ticker-copy className={animated ? "sr-only" : "m-0 [overflow-wrap:anywhere]"}>{text}</p>
        <div data-ticker-track aria-hidden="true" hidden={!animated}
          className="flex w-max animate-ticker motion-reduce:hidden [&[hidden]]:hidden"
          style={{ animationPlayState: running ? "running" : "paused" }}>
          <span className="min-w-[100vw] flex-none px-12 whitespace-nowrap">{text}</span>
          <span className="min-w-[100vw] flex-none px-12 whitespace-nowrap">{text}</span>
        </div>
        <button type="button" hidden={!animated} aria-controls={id}
          aria-label={`${paused ? "Resume" : "Pause"} scrolling text`} onClick={() => setPaused(value => !value)}
          className="absolute end-2 top-1/2 grid size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-solid border-white/70 bg-brand p-0 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:hidden [&[hidden]]:hidden">
          <span className="sr-only">Toggle motion</span>
        </button>
      </div>
    </div>
  );
}
