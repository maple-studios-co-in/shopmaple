"use client";
import { useState } from "react";
import { assurances } from "./product-assurances";

/**
 * Frame 999:317: large burgundy promises on a loop, a green dot between each. It stops on hover, on request (the pause
 * button, for keyboard and touch) and, wrapped and still, for people who ask for reduced motion.
 */
export function ProductTicker({ warranty }: { warranty: string }) {
  const [paused, setPaused] = useState(false);
  const items = [warranty, "Crafted in Delhi", "Fully customisable", assurances.delivery];
  const row = () => (
    <ul aria-hidden="true" className="m-0 flex shrink-0 list-none items-center p-0">
      {items.map((item) => (
        <li key={item} data-ticker-item className="flex shrink-0 items-center gap-6 pr-[72px] whitespace-nowrap md:gap-[67px] md:pr-[168px]">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design bullet */}
          <img src="/product-page/dot.svg" alt="" width={24} height={24} className="size-4 md:size-6" />
          {item}
        </li>
      ))}
    </ul>
  );
  return (
    <section data-store data-ticker aria-label="Maple promises" className="relative overflow-hidden bg-white py-10 font-product text-[44px] leading-[1.2] font-medium text-maple md:py-[68px] md:text-[86px]">
      <p data-ticker-copy className="sr-only">{items.join(". ")}.</p>
      <div data-ticker-track aria-hidden="true" className="flex w-max animate-pdp-ticker hover:[animation-play-state:paused] motion-reduce:hidden" style={{ animationPlayState: paused ? "paused" : undefined }}>
        {row()}
        {row()}
      </div>
      <ul aria-hidden="true" className="m-0 hidden list-none flex-wrap justify-center gap-x-10 gap-y-2 p-0 text-[32px] motion-reduce:flex">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
      <button type="button" data-ticker-pause aria-pressed={paused} onClick={() => setPaused((value) => !value)}
        className="absolute top-3 right-4 h-8 cursor-pointer rounded-full border border-solid border-maple/20 bg-white px-3 text-[12px] leading-none font-medium text-maple focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple motion-reduce:hidden">
        {paused ? "Play scrolling text" : "Pause scrolling text"}
      </button>
    </section>
  );
}
