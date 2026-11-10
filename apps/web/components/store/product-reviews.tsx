"use client";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
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
    <li data-review className="flex w-[min(86vw,680px)] shrink-0 snap-start overflow-hidden rounded-[14px] bg-white text-black md:h-full">
      {/* Sized to the card, so styles/review-cards.css can drop the review's last lines when the card is short. */}
      <div data-review-text className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-6 md:p-7">
        <p aria-label={`Rated ${review.rating} out of 5`} className="m-0 flex shrink-0 items-center gap-2 text-[16px] leading-6 text-[#FFB74A]">
          <span aria-hidden="true" className="tracking-[2px]">{"★".repeat(review.rating)}<span className="text-[#d9d3cc]">{"★".repeat(5 - review.rating)}</span></span>
          <span data-review-score aria-hidden="true" className="font-heading text-[14px] leading-none font-medium text-[#1c1c1c]">{review.rating.toFixed(1)}</span>
        </p>
        <h3 data-review-title className="m-0 line-clamp-2 shrink-0 text-[22px] leading-[1.2] font-medium text-maple md:text-[24px]">{review.title}</h3>
        <p data-review-body className="m-0 line-clamp-5 shrink-0 text-[14px] leading-[1.6] whitespace-pre-line">{review.body}</p>
        <div className="mt-auto shrink-0 pt-2">
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
    <div data-review-slider className="group/slider relative mt-8 md:mt-6 md:min-h-0 md:flex-1">
      <ul ref={track} data-review-list aria-label="Customer reviews" className="m-0 flex snap-x snap-mandatory list-none gap-6 overflow-x-auto p-0 pb-2 [scrollbar-width:none] md:h-full md:pb-0 [&::-webkit-scrollbar]:hidden">
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
 * The invitation rises into place the first time it scrolls into view: each part a little after the last, on the site's
 * ease-out curve. Content is never hidden outside the animation (it is drawn whole before the script and when already
 * on screen), and nothing moves for shoppers who ask for less motion.
 */
function useEntrance(stage: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = stage.current;
    if (!node || typeof IntersectionObserver !== "function" || typeof node.animate !== "function" || typeof window.matchMedia !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || node.getBoundingClientRect().top < window.innerHeight) return;
    const animations: Animation[] = [];
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      node.querySelectorAll<HTMLElement>("[data-entrance]").forEach((part, index) => animations.push(part.animate(
        [{ opacity: 0, transform: "translateY(18px)" }, { opacity: 1, transform: "translateY(0)" }],
        { duration: 900, delay: index * 110, easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" })));
    }, { threshold: 0.2 });
    observer.observe(node);
    return () => { observer.disconnect(); animations.forEach((animation) => animation.cancel()); };
  }, [stage]);
}

const starPath = "m12 2.6 2.75 6.25 6.8.7-5.1 4.55 1.45 6.7L12 17.35 6.1 20.8l1.45-6.7-5.1-4.55 6.8-.7z";
// A dash in a title ("Console Table with Mirror – Black Glass Top") stays at the end of a line, never the start of one.
const subject = (title: string | undefined) => !title ? "This piece" : (/^the\s/i.test(title) ? title : `The ${title}`).replace(/ ([–—]) /g, "\u00a0$1 ");

/**
 * Before the first review (owner, 10 Nov 2026: "redesign it as per the ambience of the website"): not a three-quarter
 * screen of empty burgundy, but an invitation sized to what it says, lit like a stage (styles/review-cards.css). It names
 * the piece, offers five stars that open the form already rated, and leads with Write the first review. Nothing is
 * invented: no score, no sample review, and the promise under it is the one the form keeps (approval before it shows).
 */
function FirstReview({ piece, writeHref, writeLink, onWrite }: {
  piece?: ReviewPiece; writeHref: string; writeLink: RefObject<HTMLAnchorElement | null>; onWrite: (from: HTMLElement, rating?: number) => void;
}) {
  const stage = useRef<HTMLElement>(null);
  const label = useId();
  useEntrance(stage);
  return (
    <section ref={stage} id="product-reviews" data-store data-reviews data-reviews-empty aria-labelledby="product-reviews-title"
      className="relative isolate overflow-hidden bg-maple px-4 py-10 font-text text-white md:px-12">
      <div className="relative mx-auto flex max-w-[760px] flex-col items-center gap-5 text-center md:gap-6 md:py-4">
        <div data-entrance className="flex flex-col items-center gap-3">
          <p data-reviews-eyebrow className="m-0 flex items-center gap-3 font-heading text-[12px] leading-none font-medium tracking-[0.22em] text-white/75 uppercase">
            <span aria-hidden="true" className="h-px w-7 bg-white/35 md:w-10" />Be the first<span aria-hidden="true" className="h-px w-7 bg-white/35 md:w-10" />
          </p>
          <h2 id="product-reviews-title" className="m-0 text-[36px] leading-[1.15] font-medium tracking-[-0.01em] md:text-[48px]">Hear From Them</h2>
        </div>
        <div data-entrance className="flex flex-col items-center gap-2">
          <p data-reviews-note className="m-0 font-heading text-[20px] leading-[1.35] font-medium text-balance md:text-[24px]">{subject(piece?.title)} is waiting for its first review.</p>
          <p className="m-0 text-[15px] leading-[1.6] text-white/75 md:text-[16px]">Own one? Tell us how it lives in your home.</p>
        </div>
        <div data-entrance className="flex w-full max-w-[360px] flex-col items-stretch gap-3 pt-1 sm:w-auto sm:max-w-none sm:flex-row sm:items-center sm:gap-4">
          {piece && (
            <div data-rate role="group" aria-labelledby={label} className="inline-flex h-12 items-center justify-center gap-3 rounded-[30px] border border-solid border-white/25 bg-white/[0.06] pr-5 pl-3">
              <span id={label} className="sr-only">Rate the {piece.title}</span>
              <span className="flex items-center">
                {[1, 2, 3, 4, 5].map((stars) => (
                  <button key={stars} type="button" data-rate-star aria-label={`${stars} ${stars === 1 ? "star" : "stars"}`} onClick={(event) => onWrite(event.currentTarget, stars)}
                    className="grid size-9 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 text-white/70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" className="size-[22px]"><path d={starPath} /></svg>
                  </button>
                ))}
              </span>
              <span aria-hidden="true" className="font-heading text-[14px] leading-none font-medium whitespace-nowrap text-white/85">Rate it</span>
            </div>
          )}
          <Link ref={writeLink} data-write-review data-fill-button="light" href={writeHref}
            className="inline-flex h-12 items-center justify-center gap-2.5 rounded-[30px] bg-white px-7 font-heading text-[15px] font-medium whitespace-nowrap text-maple no-underline shadow-[0_12px_32px_rgb(31_6_3/0.28)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            onClick={piece ? (event) => { event.preventDefault(); onWrite(event.currentTarget); } : undefined}>
            Write the first review
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
            <img src="/product-page/arrow-up-right.svg" alt="" width={18} height={18} className="size-[18px]" />
          </Link>
        </div>
        <p data-entrance className="m-0 text-[13px] leading-[1.5] text-white/60">Every review is read by the Maple team before it appears.</p>
      </div>
    </section>
  );
}

/**
 * Frame 999:329 / 2:371 ("Hear From Them"): the burgundy band with the rating on the right, then the approved reviews
 * Keeri sent. Nothing is invented: before the first review the band invites one (FirstReview), and the rating is Keeri's
 * own average and count. Only review cards take three quarters of the screen on a computer (owner, 9 Nov 2026); a rating
 * without written reviews keeps the band to its heading. "Write a review" opens the form on the page (Figma 180:566),
 * which joins the page on that first click (null until then) and keeps what the visitor wrote once closed; without
 * script, or with no `piece` to review, the link leads to `writeHref`.
 */
export function ProductReviews({ rating, writeHref, reviews: items = [], piece }: { rating: { value: number; count?: number } | null | undefined; writeHref: string; reviews?: ProductReview[]; piece?: ReviewPiece }) {
  const [writing, setWriting] = useState<boolean | null>(null);
  // A star chosen in the band, applied once as the form opens; the link opens it as the visitor left it.
  const [chosen, setChosen] = useState<{ rating: number } | null>(null);
  const writeLink = useRef<HTMLAnchorElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const write = (from: HTMLElement, stars?: number) => { opener.current = from; setChosen(stars ? { rating: stars } : null); setWriting(true); };
  const stopWriting = () => { setWriting(false); (opener.current ?? writeLink.current)?.focus(); };
  const reviews = rating?.count ? `${rating.count} ${rating.count === 1 ? "review" : "reviews"}` : "";
  const summary = rating
    ? { score: rating.value.toFixed(1), filled: Math.round(rating.value), label: `Rated ${rating.value.toFixed(1)} out of 5${reviews ? ` from ${reviews}` : ""}` }
    : null;
  const dialog = piece && writing !== null && <ReviewDialog open={writing} onClose={stopWriting} piece={piece} chosen={chosen} />;
  if (!summary && items.length === 0) return <><FirstReview piece={piece} writeHref={writeHref} writeLink={writeLink} onWrite={write} />{dialog}</>;
  return (
    // Three quarters of the screen on a computer (owner, 9 Nov 2026): the cards take what the heading leaves.
    <section id="product-reviews" data-store data-reviews aria-labelledby="product-reviews-title"
      className={cx("bg-maple px-4 py-10 font-text text-white md:px-12 md:py-10", items.length > 0 && "md:flex md:h-[75svh] md:min-h-[540px] md:flex-col")}>
      <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col items-start gap-6 md:gap-4">
          <h2 id="product-reviews-title" className="m-0 text-[36px] leading-[1.2] font-medium md:text-[48px]">Hear From Them</h2>
          <p data-reviews-sub className="m-0 font-heading text-[20px] leading-[1.2] font-medium md:text-[24px]">Share your experience with this piece.</p>
          <Link ref={writeLink} data-write-review data-fill-button="light" href={writeHref} className={pill}
            onClick={piece ? (event) => { event.preventDefault(); write(event.currentTarget); } : undefined}>
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
          </div>
        )}
      </div>
      {items.length > 0 && <ReviewSlider items={items} />}
      {dialog}
    </section>
  );
}
