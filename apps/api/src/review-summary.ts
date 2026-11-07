/**
 * Keeri's approved reviews as the two columns the card reads use (Prisma `Product.reviewCount`/`reviewAverage`): how many
 * there are, 0 when none, and their average, null when none. A product page without Keeri's level counts as none.
 */
export function reviewSummary(page: { reviews: { average: number | null; count: number } } | null | undefined) {
  const count = page?.reviews.count ?? 0;
  return { reviewCount: count, reviewAverage: count > 0 ? (page?.reviews.average ?? null) : null };
}
