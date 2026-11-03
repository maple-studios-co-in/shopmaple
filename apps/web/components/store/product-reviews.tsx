import Link from "next/link";

const pill = "inline-flex h-11 items-center gap-2 rounded-[30px] bg-white px-6 text-[14px] font-medium text-maple no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/**
 * Frame 999:329 ("Hear From Them"): the burgundy band with the rating on the right. The frame's review cards
 * (placeholder names, copy and a stock photo) have no data behind them, so only the rating the admin has
 * recorded from real reviews is shown, and only when there is one.
 */
export function ProductReviews({ rating, writeHref }: { rating: { value: number; count?: number } | null | undefined; writeHref: string }) {
  const reviews = rating?.count ? `${rating.count} ${rating.count === 1 ? "review" : "reviews"}` : "";
  const summary = rating
    ? { score: rating.value.toFixed(1), filled: Math.round(rating.value), line: reviews || `Rated ${rating.value.toFixed(1)} out of 5`, label: `Rated ${rating.value.toFixed(1)} out of 5${reviews ? ` from ${reviews}` : ""}` }
    : null;
  return (
    <section id="product-reviews" data-store data-reviews aria-labelledby="product-reviews-title" className="bg-maple px-4 py-12 font-product text-white md:px-[93px] md:py-[91px]">
      <div className="mx-auto flex max-w-[1246px] flex-col gap-10 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col items-start gap-6">
          <h2 id="product-reviews-title" className="m-0 text-[36px] leading-[1.2] font-medium md:text-[48px]">Hear From Them</h2>
          {summary
            ? <p data-reviews-sub className="m-0 text-[20px] leading-[1.2] font-medium md:text-[24px]">Share your experience with this piece.</p>
            : <p data-reviews-note className="m-0 max-w-[420px] text-[20px] leading-[1.3] font-medium md:text-[24px]">No reviews to show yet. Share your experience with this piece.</p>}
          <Link data-write-review data-fill-button="light" href={writeHref} className={pill}>
            Write a review
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
            <img src="/product-page/arrow-up-right.svg" alt="" width={18} height={18} className="size-[18px]" />
          </Link>
        </div>
        {summary && (
          <div data-rating-summary role="group" aria-label={summary.label} className="flex flex-col gap-4 md:items-start">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="text-[28px] leading-[1.6] md:text-[35.6px]">{summary.score}</span>
              <span aria-hidden="true" className="flex gap-2.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  // eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon
                  <img key={i} data-star src="/product-page/star-white.svg" alt="" width={38} height={38} className={i < summary.filled ? "size-7 md:size-[38px]" : "size-7 opacity-30 md:size-[38px]"} />
                ))}
              </span>
            </div>
            {" "}
            <p className="m-0 text-[20px] leading-[1.2] font-medium md:text-[24px]">{summary.line}</p>
          </div>
        )}
      </div>
    </section>
  );
}
