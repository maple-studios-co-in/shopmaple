"use client";

import { useRef, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

export function HomeCarousel({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const rail = useRef<HTMLDivElement>(null);
  function move(direction: number) {
    const element = rail.current;
    if (element)
      element.scrollBy({
        left: element.clientWidth * direction,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }
  return (
    <div className="home-carousel">
      <div
        className="home-product-rail"
        ref={rail}
        aria-label={label}
        tabIndex={0}
      >
        {children}
      </div>
      <div className="home-carousel-controls">
        <button onClick={() => move(-1)} aria-label={`Previous ${label}`}>
          <ArrowLeft size={20} />
        </button>
        <button onClick={() => move(1)} aria-label={`Next ${label}`}>
          <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
}
