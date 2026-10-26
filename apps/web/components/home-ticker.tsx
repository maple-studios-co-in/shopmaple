"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

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
    <div ref={element} className={`home-ticker${animated ? " home-ticker-animated" : ""}`}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      <p id={id} className="home-ticker-copy">{text}</p>
      <div className="home-ticker-track" aria-hidden="true" hidden={!animated}
        style={{ animationPlayState: running ? "running" : "paused" }}>
        <span className="home-ticker-repeat">{text}</span>
        <span className="home-ticker-repeat">{text}</span>
      </div>
      <button type="button" className="home-ticker-control" hidden={!animated} aria-controls={id}
        aria-label={`${paused ? "Resume" : "Pause"} scrolling text`} onClick={() => setPaused(value => !value)}>
        {paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
      </button>
    </div>
  );
}
