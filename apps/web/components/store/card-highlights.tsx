"use client";
import { Star } from "lucide-react";
import { useProductHighlights } from "./product-highlights";

// The card's staff-entered highlights. The card renders on the server; these read the highlights in the browser.

export function CardNewBadge({ handle }: { handle: string }) {
  const extra = useProductHighlights().product(handle);
  return extra?.isNew ? <span data-card-new className="rounded-[4px] bg-[#6b2fd6] px-2 py-1 text-2xs leading-none font-bold text-white">New</span> : null;
}

export function CardRating({ handle }: { handle: string }) {
  const rating = useProductHighlights().product(handle)?.rating;
  if (!rating) return null;
  return (
    <span data-card-rating role="img" aria-label={`Rated ${rating.value.toFixed(1)} out of 5 from ${rating.count} ${rating.count === 1 ? "review" : "reviews"}`}
      className="inline-flex items-center gap-1 text-espresso">
      <span aria-hidden="true">{rating.value.toFixed(1)}</span>
      <Star aria-hidden="true" className="size-3.5 fill-[#f5a623] text-[#f5a623]" />
      <span aria-hidden="true" className="text-[#5e574f]">({rating.count})</span>
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
