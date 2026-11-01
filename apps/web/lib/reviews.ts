import "server-only";
import { productReviewsSchema, reviewInvitationSchema, type ProductReviews, type ReviewInvitation } from "@shopmaple/contracts";

const api = () => process.env.API_URL ?? "http://127.0.0.1:4100";

/** A product's approved reviews, or null when there are none to show or they can't be read right now. */
export async function getProductReviews(handle: string): Promise<ProductReviews | null> {
  try {
    const response = await fetch(`${api()}/api/products/${encodeURIComponent(handle)}/reviews`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    const reviews = productReviewsSchema.parse(await response.json());
    return reviews.count ? reviews : null;
  } catch {
    return null;
  }
}

export type InvitationLookup =
  | { ok: true; invitation: ReviewInvitation }
  | { ok: false; reason: "missing" | "invalid" | "used" | "expired" | "unavailable" };

/** What a review link is for. The token stays server-side: it never reaches a third-party request. */
export async function getReviewInvitation(token: string | undefined): Promise<InvitationLookup> {
  if (!token) return { ok: false, reason: "missing" };
  try {
    const response = await fetch(`${api()}/api/reviews/invitation?token=${encodeURIComponent(token)}`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (response.status === 404 || response.status === 400) return { ok: false, reason: "invalid" };
    if (response.status === 410) {
      const body = (await response.json().catch(() => null)) as { code?: string } | null;
      return { ok: false, reason: body?.code === "REVIEW_LINK_EXPIRED" ? "expired" : "used" };
    }
    if (!response.ok) return { ok: false, reason: "unavailable" };
    return { ok: true, invitation: reviewInvitationSchema.parse(await response.json()) };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
