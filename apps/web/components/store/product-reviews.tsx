import Link from "next/link";
import type { ProductReviews as Reviews, PublicReview } from "@shopmaple/contracts";

const pill = "inline-flex h-11 items-center gap-2 rounded-[30px] bg-white px-6 text-[14px] font-medium text-maple no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/** Five small stars, the first `rating` filled; one label for the group. */
function Stars({ rating }: { rating: number }) {
  return (
    <span data-review-stars role="img" aria-label={`Rated ${rating} out of 5`} className="flex gap-1">
      {[0, 1, 2, 3, 4].map((i) => (
        // eslint-disable-next-line @next/next/no-img-element -- fixed-size design star
        <img key={i} src="/product-page/star.svg" alt="" width={15} height={15} className={i < rating ? "size-[15px]" : "size-[15px] opacity-25 grayscale"} />
      ))}
    </span>
  );
}

/** The frame's review card, without its stock photo: a buyer's own words, name and city. */
function ReviewCard({ review }: { review: PublicReview }) {
  const who = review.city ? `${review.displayName}, ${review.city}` : review.displayName;
  return (
    <li data-review-card className="flex w-[min(420px,82vw)] shrink-0 snap-start flex-col gap-4 rounded-[16px] bg-white p-6 text-black md:p-9">
      <Stars rating={review.rating} />
      <h3 className="m-0 text-[24px] leading-[1.2] font-medium text-maple md:text-[28px]">{review.title}</h3>
      <p className="m-0 text-[14px] leading-[1.6] whitespace-pre-line text-[#1c1c1c]">{review.body}</p>
      <div className="mt-auto flex items-center gap-2.5 pt-2">
        <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-maple text-[12px] font-medium text-white">{review.displayName.slice(0, 1).toUpperCase()}</span>
        <span className="grid">
          <span className="text-[14px] font-medium">{who}</span>
          <span data-verified className="inline-flex items-center gap-1 text-[12px] text-[#5e574f]">
            <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="6" r="5.25" /><path d="M3.75 6.1 5.3 7.6 8.3 4.5" /></svg>
            Verified buyer
          </span>
        </span>
      </div>
    </li>
  );
}

/**
 * Frame 999:329 ("Hear From Them"): the burgundy band with the rating on the right and review cards below.
 * Everything here comes from approved reviews by buyers whose order was delivered; with none it says so.
 * "Write a review" explains how reviews are collected: only a buyer's emailed link opens the form.
 */
export function ProductReviews({ reviews, writeHref }: { reviews: Reviews | null | undefined; writeHref: string }) {
  const rating = reviews?.count && reviews.average !== null ? { value: reviews.average, count: reviews.count } : null;
  const filled = rating ? Math.round(rating.value) : 0;
  return (
    <section id="product-reviews" data-store data-reviews aria-labelledby="product-reviews-title" className="bg-maple px-4 py-12 font-product text-white md:px-[93px] md:py-[91px]">
      <div className="mx-auto flex max-w-[1246px] flex-col gap-10 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col items-start gap-6">
          <h2 id="product-reviews-title" className="m-0 text-[36px] leading-[1.2] font-medium md:text-[48px]">Hear From Them</h2>
          {rating
            ? <p data-reviews-sub className="m-0 text-[20px] leading-[1.2] font-medium md:text-[24px]">From buyers whose order was delivered.</p>
            : <p data-reviews-note className="m-0 max-w-[420px] text-[20px] leading-[1.3] font-medium md:text-[24px]">No reviews to show yet. Buyers are invited to review after delivery.</p>}
          <Link data-write-review href={writeHref} className={pill}>
            Write a review
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
            <img src="/product-page/arrow-up-right.svg" alt="" width={18} height={18} className="size-[18px]" />
          </Link>
        </div>
        {rating && (
          <div data-rating-summary role="group" aria-label={`Rated ${rating.value.toFixed(1)} out of 5 from ${rating.count} ${rating.count === 1 ? "review" : "reviews"}`} className="flex flex-col gap-4 md:items-start">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="text-[28px] leading-[1.6] md:text-[35.6px]">{rating.value.toFixed(1)}</span>
              <span aria-hidden="true" className="flex gap-2.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  // eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon
                  <img key={i} data-star src="/product-page/star-white.svg" alt="" width={38} height={38} className={i < filled ? "size-7 md:size-[38px]" : "size-7 opacity-30 md:size-[38px]"} />
                ))}
              </span>
            </div>
            {" "}
            <p className="m-0 text-[20px] leading-[1.2] font-medium md:text-[24px]">{rating.count} {rating.count === 1 ? "review" : "reviews"}</p>
          </div>
        )}
      </div>
      {reviews?.reviews.length ? (
        <ul aria-label="Reviews" className="mx-auto mt-10 mb-0 flex max-w-[1246px] snap-x snap-mandatory list-none gap-5 overflow-x-auto p-0 pb-2 md:mt-14 md:gap-6">
          {reviews.reviews.map((review) => <ReviewCard key={review.id} review={review} />)}
        </ul>
      ) : null}
    </section>
  );
}
