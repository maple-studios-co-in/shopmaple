"use client";
import { useState } from "react";
import Link from "next/link";

/**
 * Answers come from the store's published policies (shipping, refund and warranty). The frame's eight copies of
 * "How do I track my order?" are a placeholder, and the store has no order tracking to describe.
 */
const questions = [
  ["How long does delivery take?", "Every Maple piece is made to order, so timelines depend on the piece, any customisation and our production load. The timeline we share when you order is indicative, and we keep you informed as your piece is made."],
  ["Is shipping included in the price?", "No. Shipping is charged separately, based on the size and weight of the piece and your delivery location, and the final cost is shared before you confirm your order."],
  ["Can I cancel, return or exchange my order?", "Orders can be cancelled only before production begins. Because each piece is custom built, returns and replacements are accepted only for manufacturing defects or transit damage. Please report an issue within 24–48 hours of delivery, with photos or videos and your order details."],
  ["What warranty do I get?", "Maple pieces carry a warranty of 36 months unless the product page states otherwise."],
  ["Can I customise the finish or size?", "Yes. Tell us what you have in mind and our team will confirm materials, finishes, sizes and pricing before you order."],
  ["Do you deliver across India?", "Yes. Tell us your location and we will confirm delivery and the cost."],
] as const;

export function ProductFaq() {
  const [open, setOpen] = useState(-1);
  return (
    <section data-store data-faq aria-labelledby="product-faq-title" className="bg-white px-4 py-12 font-manrope text-black md:px-[214px] md:py-[88px]">
      <div className="mx-auto flex max-w-[1004px] flex-col gap-10 md:flex-row md:gap-24">
        <div className="flex flex-col items-start gap-6 md:order-2 md:w-[452px] md:shrink-0">
          <h2 id="product-faq-title" className="m-0 text-[36px] leading-[1.2] font-medium text-maple md:text-[48px]">Frequently asked questions</h2>
          <p className="m-0 text-[20px] leading-[1.3] font-medium md:text-[24px]">Still looking for an answer?</p>
          <Link data-faq-contact href="/pages/contact" className="inline-flex h-11 items-center gap-2 rounded-[30px] bg-maple px-5 text-[14px] font-medium text-white no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple">
            Contact us
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
            <img src="/product-page/arrow-up-right.svg" alt="" width={18} height={18} className="size-[18px] rounded-full bg-white p-1" />
          </Link>
        </div>
        <div className="md:order-1 md:w-[452px] md:shrink-0">
          {questions.map(([question, answer], i) => (
            <details key={question} data-faq-item open={open === i} className="group border-0 border-b border-solid border-maple/8"
              onToggle={(event) => {
                const opened = event.currentTarget.open;
                setOpen((current) => (opened ? i : current === i ? -1 : current));
              }}>
              <summary className="flex min-h-[93px] cursor-pointer list-none items-center gap-4 text-[18px] leading-[1.6] font-medium marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className="relative grid size-[33px] shrink-0 place-items-center rounded-full bg-maple/8 before:absolute before:h-px before:w-3 before:bg-black group-not-open:after:absolute group-not-open:after:h-3 group-not-open:after:w-px group-not-open:after:bg-black" />
                {question}
              </summary>
              <p className="m-0 pb-6 pl-[49px] text-[14px] leading-[1.6]">{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
