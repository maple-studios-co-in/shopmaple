import type { Metadata } from "next";
import Link from "next/link";
import { getReviewInvitation } from "@/lib/reviews";
import { ReviewForm } from "@/components/store/review-form";

export const dynamic = "force-dynamic";
// The address carries a private link: never indexed, and never sent onward as a referrer.
export const metadata: Metadata = { title: "Write a review", robots: { index: false, follow: false }, referrer: "no-referrer" };

const refusals = {
  missing: "Open the review link from your delivery email to write a review.",
  invalid: "This review link is not valid. Open the link from your delivery email exactly as it was sent.",
  used: "A review has already been written with this link. Thank you!",
  expired: "This review link has expired. Write to us with your order number and we'll send a new one.",
  unavailable: "We couldn't open the review form just now. Please try the link again in a few minutes.",
} as const;

export default async function NewReviewPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : undefined;
  const lookup = await getReviewInvitation(token);
  return (
    <main data-store className="bg-white px-4 py-12 font-product text-black md:px-[93px] md:py-[91px]">
      <div className="mx-auto grid max-w-[640px] gap-6">
        <h1 className="m-0 text-[36px] leading-[1.2] font-medium text-maple md:text-[48px]">Write a review</h1>
        {lookup.ok ? (
          <ReviewForm token={token!} invitation={lookup.invitation} />
        ) : (
          <div data-review-refused className="grid gap-4">
            <p role="status" className="m-0 text-[16px] leading-[1.6]">{refusals[lookup.reason]}</p>
            <Link href="/reviews" className="text-[14px] text-maple underline underline-offset-2">How reviews work</Link>
          </div>
        )}
      </div>
    </main>
  );
}
