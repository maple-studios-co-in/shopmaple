/**
 * A header action (account, saved, bag) in "MF / Main navigation": a 21 px burgundy line icon in a
 * 40 x 40 target, 40 x 44 under 750 px. Tailwind's max-[750px] means `width < 750`.
 */
export const headerIcon =
  "relative inline-flex size-10 items-center justify-center border-0 bg-transparent p-0 text-brand hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand max-[750px]:h-11 [&_svg]:size-[21px]";
