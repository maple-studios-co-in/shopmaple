import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How reviews work",
  description: "Every review on Maple Furnishers comes from a buyer whose order was delivered.",
  alternates: { canonical: "/reviews" },
};

/** Where "Write a review" leads: reviews come only from buyers, by an emailed link after delivery. */
export default function ReviewsExplained() {
  return (
    <main data-store data-reviews-explained className="bg-white px-4 py-12 font-product text-black md:px-[93px] md:py-[91px]">
      <div className="mx-auto grid max-w-[720px] gap-6">
        <h1 className="m-0 text-[36px] leading-[1.2] font-medium text-maple md:text-[48px]">How reviews work</h1>
        <p className="m-0 text-[16px] leading-[1.6]">
          Every review you read on our website is written by someone who bought the piece from us. We don&apos;t accept reviews from anyone else, and we never write or pay for them.
        </p>
        <ol className="m-0 grid gap-4 pl-5 text-[16px] leading-[1.6]">
          <li>After your order is delivered, we email you a private link for each piece you bought.</li>
          <li>The link opens a short form: a star rating, a title, your review, and the name and city you want shown.</li>
          <li>We read every review before it appears, to keep out spam and personal details. We publish honest reviews whether they are glowing or critical.</li>
        </ol>
        <p className="m-0 text-[16px] leading-[1.6]">
          Bought from us and can&apos;t find your email? Each link stays open for 90 days. Write to us from the <Link href="/pages/contact" className="text-maple underline underline-offset-2">contact page</Link> with your order number and we&apos;ll send it again.
        </p>
      </div>
    </main>
  );
}
