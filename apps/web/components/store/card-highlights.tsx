"use client";
import { Star } from "lucide-react";
import { useProductHighlights } from "./product-highlights";

// The card's staff-entered highlights. The card renders on the server; these read the highlights in the browser.

export function CardNewBadge({ handle }: { handle: string }) {
  const extra = useProductHighlights().product(handle);
  return extra?.isNew ? <span data-card-new className="rounded-[4px] bg-[#6b2fd6] px-2 py-1 text-2xs leading-none font-bold text-white">New</span> : null;
}

export function CardLimitedBadge({ handle }: { handle: string }) {
  const extra = useProductHighlights().product(handle);
  return extra?.isLimited ? <span data-card-limited className="rounded-[4px] bg-[#b07a1f] px-2 py-1 text-2xs leading-none font-bold text-white">Limited</span> : null;
}

/**
 * Every card carries its rating on the right of the name, as the score and one gold star ("4.6 ★"): the average of
 * the piece's approved reviews in Keeri, which the card brings with it (owner, 4 Nov 2026). A piece without approved
 * reviews shows a dash and an empty star in the same place ("– ☆", read out and shown on hover as "No reviews yet").
 * Nothing typed, sampled or estimated stands in for a rating.
 */
export function CardRating({ rating }: { rating?: { value: number; count: number } | null }) {
  if (!rating) {
    return (
      <span data-card-rating data-card-rating-empty role="img" aria-label="No reviews yet" title="No reviews yet"
        className="inline-flex items-center gap-1 text-[14px] leading-none text-[#8a8178]">
        <span aria-hidden="true">–</span>
        <Star aria-hidden="true" strokeWidth={1.75} className="size-4 text-[#f5a623]" />
      </span>
    );
  }
  const label = `Rated ${rating.value.toFixed(1)} out of 5 from ${rating.count} ${rating.count === 1 ? "review" : "reviews"}`;
  return (
    <span data-card-rating role="img" aria-label={label} title={label}
      className="inline-flex items-center gap-1 text-[14px] leading-none text-[#3a352f]">
      <span aria-hidden="true">{rating.value.toFixed(1)}</span>
      <Star aria-hidden="true" className="size-4 fill-[#f5a623] text-[#f5a623]" />
    </span>
  );
}

export function CardSwatches({ optionNames }: { optionNames: string[] }) {
  const highlights = useProductHighlights();
  const swatches = optionNames.flatMap((name) => { const hex = highlights.swatch(name); return hex ? [{ name, hex }] : []; });
  if (!swatches.length) return null;
  return (
    <ul data-card-swatches aria-label={`Available in ${swatches.map((swatch) => swatch.name).join(", ")}`} className="mt-1 flex flex-wrap gap-1.5">
      {swatches.slice(0, 6).map((swatch) => (
        <li key={swatch.name} data-swatch title={swatch.name} style={{ backgroundColor: swatch.hex }}
          className="size-4 rounded-full shadow-[inset_0_0_0_1px_rgb(41_37_31/0.18)]" />
      ))}
      {swatches.length > 6 ? <li aria-hidden="true" className="text-label text-[#5e574f]">+{swatches.length - 6}</li> : null}
    </ul>
  );
}
