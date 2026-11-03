import Link from "next/link";
import type { ProductReview } from "@shopmaple/contracts";
import { ProductImage } from "./product-image";

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

/**
 * Frame 999:329 / 2:371 ("Hear From Them"): the burgundy band with the rating on the right, then the approved reviews
 * Keeri sent. Nothing is invented: with no reviews the band says so, and the rating is Keeri's own average and count
 * (or, for a product Keeri has no reviews for, the rating staff recorded from real reviews).
 */
export function ProductReviews({ rating, writeHref, reviews = [] }: { rating: { value: number; count: number } | null | undefined; writeHref: string; reviews?: ProductReview[] }) {
  const filled = rating ? Math.round(rating.value) : 0;
  return (
    <section id="product-reviews" data-store data-reviews aria-labelledby="product-reviews-title" className="bg-maple px-4 py-12 font-product text-white md:px-12 md:py-[91px]">
      <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col items-start gap-6">
          <h2 id="product-reviews-title" className="m-0 text-[36px] leading-[1.2] font-medium md:text-[48px]">Hear From Them</h2>
          {rating
            ? <p data-reviews-sub className="m-0 text-[20px] leading-[1.2] font-medium md:text-[24px]">Share your experience with this piece.</p>
            : <p data-reviews-note className="m-0 max-w-[420px] text-[20px] leading-[1.3] font-medium md:text-[24px]">No reviews to show yet. Share your experience with this piece.</p>}
          <Link data-write-review data-fill-button="light" href={writeHref} className={pill}>
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
      {reviews.length > 0 && (
        <ul data-review-list aria-label="Customer reviews" className="m-0 mt-10 flex snap-x snap-mandatory list-none gap-6 overflow-x-auto p-0 pb-2 md:mt-14">
          {reviews.map((review) => <ReviewCard key={review.id} review={review} />)}
        </ul>
      )}
    </section>
  );
}
