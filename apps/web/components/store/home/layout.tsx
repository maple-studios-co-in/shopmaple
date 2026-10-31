import type { ReactNode } from "react";

/** A "Maple / PDF Review / Home" section's frame: 64 px around a 1312 px column at 1440. */
export const designSection = "mx-auto flex w-full max-w-[1440px] flex-col gap-7 p-16 font-body max-[1024px]:px-8 max-[1024px]:py-12 max-[750px]:gap-5 max-[750px]:px-5 max-[750px]:py-10";
/** The 16 px taupe line under a section title. */
export function SectionLede({ children }: { children: ReactNode }) {
  return <p data-section-lede className="text-price text-taupe">{children}</p>;
}
/** The design's burgundy button ("Explore Nimbus →"). */
export const solidButton = "inline-flex w-fit min-w-[190px] items-center justify-center rounded-sm bg-brand px-3.5 py-3.5 text-ui font-bold text-white no-underline hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
