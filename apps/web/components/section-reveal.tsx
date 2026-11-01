"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function SectionReveal({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = host.current;
    if (!enabled || !node || typeof window.matchMedia !== "function" ||
        typeof IntersectionObserver !== "function" || typeof node.animate !== "function") return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;
    const pending = new Set<Element>([...node.querySelectorAll<HTMLElement>("[data-home-section]")]
      .filter(section => section.getBoundingClientRect().top >= window.innerHeight));
    const animations = new Map<Element, Animation>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || !pending.delete(entry.target)) continue;
        observer.unobserve(entry.target);
        if (preference.matches || entry.target.contains(document.activeElement)) continue;
        // Content is never hidden outside the animation, including before hydration.
        const animation = entry.target.animate([
          { opacity: 0.65, transform: "translateY(12px)" },
          { opacity: 1, transform: "translateY(0)" },
        ], { duration: 360, easing: "ease-out", fill: "none" });
        animations.set(entry.target, animation);
      }
    }, { threshold: 0 });
    pending.forEach(section => observer.observe(section));
    const stop = () => {
      pending.clear(); observer.disconnect();
      animations.forEach(animation => animation.cancel()); animations.clear();
    };
    const onPreference = () => { if (preference.matches) stop(); };
    const onFocus = (event: FocusEvent) => {
      for (const [section, animation] of animations) {
        if (section.contains(event.target as Node)) { animation.cancel(); animations.delete(section); }
      }
    };
    preference.addEventListener("change", onPreference);
    node.addEventListener("focusin", onFocus);
    return () => { stop(); preference.removeEventListener("change", onPreference); node.removeEventListener("focusin", onFocus); };
  }, [enabled]);
  return <div ref={host} className="home-parity home-refined">{children}</div>;
}
