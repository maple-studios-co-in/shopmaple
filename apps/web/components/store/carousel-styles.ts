import { clsx } from "clsx";

/*
 * Class strings for the carousel (components/store/carousel.tsx), in a plain module so server
 * components can compose them: a "use client" module's exports reach the server only as
 * references. Utilities restate the legacy `.home-carousel` rules in the storefront's current look.
 */

/** Keyboard focus on a rail (legacy `.home-carousel [tabindex]:focus-visible`). */
export const railFocus = "focus-visible:outline-2 focus-visible:outline-current focus-visible:outline-offset-4";

/** The four-up product rail, two-up below 750 px (legacy `.home-product-rail`). */
export const productRail =
  "grid grid-flow-col auto-cols-[calc((100%-24px)/4)] gap-2 overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden *:min-w-0 *:snap-start";
export const productRailMobile = "max-[750px]:auto-cols-[calc((100%-8px)/2)]";

/** The round previous/next buttons (legacy `.home-carousel-controls button`). */
export const arrowButton =
  "grid size-[42px] place-items-center rounded-[50%] border border-[#292d2833] bg-transparent hover:bg-[#e9e4e0] focus-visible:outline-2 focus-visible:outline-current focus-visible:outline-offset-4 disabled:cursor-default disabled:opacity-45";

/**
 * The play/pause control of a moving row: visually hidden until the row is hovered or focused, the
 * row is paused, or the control itself has keyboard focus; never shown while disabled (reduced motion).
 */
const playReveal =
  "opacity-0 pointer-events-none group-hover/carousel:enabled:opacity-100 group-hover/carousel:enabled:pointer-events-auto group-focus-within/carousel:enabled:opacity-100 group-focus-within/carousel:enabled:pointer-events-auto [&[aria-label^='Play_']:enabled]:opacity-100 [&[aria-label^='Play_']:enabled]:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto disabled:cursor-default";
const playHidden =
  "absolute overflow-hidden whitespace-nowrap p-0 -m-px [clip:rect(0,0,0,0)] [clip-path:inset(50%)] focus-visible:size-auto focus-visible:m-0 focus-visible:p-2 focus-visible:[clip:auto] focus-visible:[clip-path:none] focus-visible:outline-2 focus-visible:outline-current focus-visible:outline-offset-4";
export const playButton = clsx(playHidden, playReveal, "grid size-px place-items-center rounded-[50%] [border:0] bg-transparent hover:bg-[#e9e4e0]");

