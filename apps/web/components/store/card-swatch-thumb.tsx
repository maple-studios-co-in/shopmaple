"use client";
import Link from "next/link";
import { useProductHighlights } from "./product-highlights";

/**
 * An option with no photo of its own, drawn as its colour swatch when staff entered a colour for that
 * option name; otherwise nothing. The colours live in the browser-side highlights, so this is the one
 * small client piece of the option thumbnails; photo thumbnails render on the server.
 */
export function CardSwatchThumb({ name, href }: { name: string; href: string }) {
  const hex = useProductHighlights().swatch(name);
  if (!hex) return null;
  return (
    <li data-card-option-thumb>
      <Link href={href} aria-label={name} title={name} className="block size-7 rounded-full border border-sand p-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        <span data-swatch style={{ backgroundColor: hex }} className="block size-full rounded-full shadow-[inset_0_0_0_1px_rgb(41_37_31/0.18)]" />
      </Link>
    </li>
  );
}
