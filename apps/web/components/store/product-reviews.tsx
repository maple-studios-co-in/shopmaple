"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ProductReview } from "@shopmaple/contracts";
import { cx } from "@/lib/cx";
import { ProductImage } from "./product-image";
import { ReviewDialog, type ReviewPiece } from "./review-dialog";

const pill = "inline-flex h-11 items-center gap-2 rounded-[30px] bg-white px-6 text-[14px] font-medium text-maple no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

const dateFormat = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

/** One approved review from Keeri: its words, the customer's name and city, and its photo when the customer sent one. */
function ReviewCard({ review }: { review: ProductReview }) {
  const photo = review.photos[0];
  return (
    <li data-review className="flex w-[min(86vw,680px)] shrink-0 snap-start overflow-hidden rounded-[14px] bg-white text-black">
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-6 md:p-8">
        <p aria-label={`Rated ${review.rating} out of 5`} className="m-0 text-[16px] tracking-[2px] text-[#FFB74A]">
          {"★".repeat(review.rating)}<span className="text-[#d9d3cc]">{"★".repeat(5 - review.rating)}</span>
        </p>
        <h3 className="m-0 text-[22px] leading-[1.2] font-medium text-maple md:text-[26px]">{review.title}</h3>
        <p className="m-0 text-[14px] leading-[1.6] whitespace-pre-line">{review.body}</p>
        <div className="mt-auto pt-2">
          <p className="m-0 text-[14px] font-medium">{review.reviewerName}{review.city ? `, ${review.city}` : ""}</p>
          <p className="m-0 text-[12px] text-[#5e574f]">
            {review.verifiedBuyer && <span data-verified className="mr-2 font-medium text-[#2f6b32]">✓ Verified buyer</span>}
            <time dateTime={review.reviewedAt}>{dateFormat.format(new Date(`${review.reviewedAt}T00:00:00Z`))}</time>
          </p>
        </div>
      </div>
      {photo && (
        <div className="relative hidden w-[45%] shrink-0 sm:block">
          <ProductImage src={photo.url} alt={`Photo from ${review.reviewerName}'s review`} fill sizes="300px" className="object-cover" />
        </div>
      )}
    </li>
  );
}

const arrow = "absolute top-1/2 z-[2] grid size-12 -translate-y-1/2 cursor-pointer place-items-center rounded-full border-0 bg-white p-0 text-maple shadow-[0_8px_24px_rgb(31_18_13/0.25)] transition-opacity duration-200 hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none";
// An arrow shows while the pointer is over the row, or when it has keyboard focus; at its end of the row it is gone.
const showing = (atEnd: boolean) => atEnd ? "invisible opacity-0"
  : "pointer-events-none opacity-0 group-hover/slider:pointer-events-auto group-hover/slider:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100";

/**
 * The reviews in a row that slides: swiped on a phone, and on a computer moved a review at a time by the arrows that
 * show while the pointer is over the row (owner, 4 Nov 2026).
 */
function ReviewSlider({ items }: { items: ProductReview[] }) {
  const track = useRef<HTMLUListElement>(null);
  const [ends, setEnds] = useState({ start: true, end: items.length < 2 });
  useEffect(() => {
    const row = track.current;
    if (!row) return;
    const measure = () => setEnds({ start: row.scrollLeft <= 2, end: row.scrollLeft + row.clientWidth >= row.scrollWidth - 2 });
    measure();
    row.addEventListener("scroll", measure, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(row);
    return () => { row.removeEventListener("scroll", measure); observer?.disconnect(); };
  }, [items.length]);
  const go = (direction: 1 | -1) => {
    const row = track.current, card = row?.querySelector<HTMLElement>("[data-review]");
    if (row && card) row.scrollBy?.({ left: direction * (card.offsetWidth + 24), behavior: "smooth" });
  };
  return (
    <div data-review-slider className="group/slider relative mt-10 md:mt-14">
      <ul ref={track} data-review-list aria-label="Customer reviews" className="m-0 flex snap-x snap-mandatory list-none gap-6 overflow-x-auto p-0 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((review) => <ReviewCard key={review.id} review={review} />)}
      </ul>
      {items.length > 1 && (
        <>
          <button type="button" data-review-prev aria-label="Previous review" disabled={ends.start} onClick={() => go(-1)} className={cx(arrow, "left-2 md:-left-6", showing(ends.start))}>
            <ChevronLeft aria-hidden="true" strokeWidth={2} className="size-6" />
          </button>
          <button type="button" data-review-next aria-label="Next review" disabled={ends.end} onClick={() => go(1)} className={cx(arrow, "right-2 md:-right-6", showing(ends.end))}>
            <ChevronRight aria-hidden="true" strokeWidth={2} className="size-6" />
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Frame 999:329 / 2:371 ("Hear From Them"): the burgundy band with the rating on the right, then the approved reviews
 * Keeri sent. Nothing is invented: with no reviews the band says so, and the rating is Keeri's own average and count
 * (or, for a product Keeri has no reviews for, the rating staff recorded from real reviews). "Write a review" opens the
 * form on the page (Figma 180:566), which joins the page on that first click (null until then) and keeps what the visitor
 * wrote once closed; without script, or with no `piece` to review, the link leads to `writeHref`.
 */
export function ProductReviews({ rating, writeHref, reviews: items = [], piece }: { rating: { value: number; count?: number } | null | undefined; writeHref: string; reviews?: ProductReview[]; piece?: ReviewPiece }) {
  const [writing, setWriting] = useState<boolean | null>(null);
  const writeLink = useRef<HTMLAnchorElement>(null);
  const stopWriting = () => { setWriting(false); writeLink.current?.focus(); };
  const reviews = rating?.count ? `${rating.count} ${rating.count === 1 ? "review" : "reviews"}` : "";
  const summary = rating
    ? { score: rating.value.toFixed(1), filled: Math.round(rating.value), line: reviews || `Rated ${rating.value.toFixed(1)} out of 5`, label: `Rated ${rating.value.toFixed(1)} out of 5${reviews ? ` from ${reviews}` : ""}` }
    : null;
  return (
    <section id="product-reviews" data-store data-reviews aria-labelledby="product-reviews-title" className="bg-maple px-4 py-12 font-text text-white md:px-12 md:py-[91px]">
      <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col items-start gap-6">
          <h2 id="product-reviews-title" className="m-0 text-[36px] leading-[1.2] font-medium md:text-[48px]">Hear From Them</h2>
          {summary
            ? <p data-reviews-sub className="m-0 font-heading text-[20px] leading-[1.2] font-medium md:text-[24px]">Share your experience with this piece.</p>
            : <p data-reviews-note className="m-0 max-w-[420px] font-heading text-[20px] leading-[1.3] font-medium md:text-[24px]">No reviews to show yet. Share your experience with this piece.</p>}
          <Link ref={writeLink} data-write-review data-fill-button="light" href={writeHref} className={pill}
            onClick={piece ? (event) => { event.preventDefault(); setWriting(true); } : undefined}>
            Write a review
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
            <img src="/product-page/arrow-up-right.svg" alt="" width={18} height={18} className="size-[18px]" />
          </Link>
        </div>
        {summary && (
          <div data-rating-summary role="group" aria-label={summary.label} className="flex flex-col gap-4 md:items-start">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="font-heading text-[28px] leading-[1.6] font-medium md:text-[35.6px]">{summary.score}</span>
              <span aria-hidden="true" className="flex gap-2.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  // eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon
                  <img key={i} data-star src="/product-page/star-white.svg" alt="" width={38} height={38} className={i < summary.filled ? "size-7 md:size-[38px]" : "size-7 opacity-30 md:size-[38px]"} />
                ))}
              </span>
            </div>
            {" "}
            <p className="m-0 font-heading text-[20px] leading-[1.2] font-medium md:text-[24px]">{summary.line}</p>
          </div>
        )}
      </div>
      {items.length > 0 && <ReviewSlider items={items} />}
      {piece && writing !== null && <ReviewDialog open={writing} onClose={stopWriting} piece={piece} />}
    </section>
  );
}
