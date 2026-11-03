"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ProductCard } from "@shopmaple/contracts";
import { shopMoney } from "@/lib/format";
import { ProductImage } from "./product-image";

const arrow = "grid size-7 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-[#eee8e5] p-0 disabled:cursor-default disabled:bg-[#f8f6f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple";

/**
 * Frame 36:476 ("Complete the look"): pieces from the rooms this piece is styled with, one card each with its photo,
 * name and price, in a row that scrolls by hand or with the arrows. Each card leads to its piece, where its options
 * are chosen; the frame's "+ Add" would need an option this card cannot choose.
 */
export function CompleteTheLook({ pieces }: { pieces: ProductCard[] }) {
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const measure = () => {
    const row = track.current;
    if (row) setEdges({ start: row.scrollLeft <= 1, end: row.scrollLeft + row.clientWidth >= row.scrollWidth - 1 });
  };
  useEffect(measure, [pieces]);
  if (!pieces.length) return null;
  function step(direction: 1 | -1) {
    const row = track.current;
    if (!row) return;
    const card = row.firstElementChild as HTMLElement | null;
    const still = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollBy({ left: direction * ((card?.offsetWidth ?? row.clientWidth) + 12), behavior: still ? "auto" : "smooth" });
  }
  return (
    <section data-complete-look aria-labelledby="complete-look-title" className="flex min-w-0 flex-col gap-[14px]">
      <div className="flex items-center justify-between gap-3">
        <h2 id="complete-look-title" className="m-0 text-[20px] leading-7 font-medium text-[#1c1c1c]">Complete the look</h2>
        <div className="flex gap-2">
          <button type="button" aria-label="Previous piece" disabled={edges.start} onClick={() => step(-1)} className={arrow}>
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
            <img src={edges.start ? "/product-page/look-prev.svg" : "/product-page/look-next.svg"} alt="" width={14} height={14} className={edges.start ? "size-3.5" : "size-3.5 -scale-x-100"} />
          </button>
          <button type="button" aria-label="Next piece" disabled={edges.end} onClick={() => step(1)} className={arrow}>
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
            <img src={edges.end ? "/product-page/look-prev.svg" : "/product-page/look-next.svg"} alt="" width={14} height={14} className={edges.end ? "size-3.5 -scale-x-100" : "size-3.5"} />
          </button>
        </div>
      </div>
      <ul ref={track} onScroll={measure} className="m-0 flex list-none snap-x snap-mandatory gap-3 overflow-x-auto p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {pieces.map((piece) => (
          <li key={piece.id} data-look-item className="flex h-[112px] w-[min(366px,calc(100%-44px))] shrink-0 snap-start items-center gap-3 rounded-[6px] border border-solid border-[#e6e2df] bg-white p-3">
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
