import Link from "next/link";
import type { ProductCard } from "@shopmaple/contracts";
import { shopMoney } from "@/lib/format";
import { ProductImage } from "./product-image";

/**
 * Frame 36:476 ("Complete the look"): pieces from the rooms this piece is styled with, one card each with its photo,
 * name and price, listed one below the other (owner, 4 Nov 2026) so the buy box scrolls on past them while the
 * gallery beside it stays put. Each card leads to its piece, where its options are chosen; the frame's "+ Add" would
 * need an option this card cannot choose.
 */
export function CompleteTheLook({ pieces }: { pieces: ProductCard[] }) {
  if (!pieces.length) return null;
  return (
    <section data-complete-look aria-labelledby="complete-look-title" className="flex min-w-0 flex-col gap-[14px]">
      <h2 id="complete-look-title" className="m-0 text-[20px] leading-7 font-medium text-[#1c1c1c]">Complete the look</h2>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {pieces.map((piece) => (
          <li key={piece.id} data-look-item className="flex h-[112px] w-full items-center gap-3 rounded-[6px] border border-solid border-[#e6e2df] bg-white p-3">
            <span className="relative h-[88px] w-16 shrink-0 overflow-hidden rounded-[4px] bg-cream [&_img]:object-cover">
              <ProductImage src={piece.image ?? undefined} alt="" fill sizes="64px" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span data-look-name className="line-clamp-2 text-[14px] leading-5 font-semibold text-[#1c1c1c]">{piece.title}</span>
              <span data-look-price className="text-[13px] leading-[18px] text-[#756d68]">{piece.priceFrom ? "From " : ""}{shopMoney(piece.pricePaise)}</span>
            </span>
            <Link data-look-view href={`/products/${piece.handle}`} aria-label={`View ${piece.title}`}
              className="inline-flex h-9 w-[70px] shrink-0 items-center justify-center rounded-[18px] bg-[#f1ebe8] text-[13px] leading-[18px] font-semibold text-maple no-underline hover:bg-[#eaded8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple">
              View
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
