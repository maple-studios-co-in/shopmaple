"use client";
import { useId, useState, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { ProductImage } from "./product-image";

export type Feature = { key: string; title: string; icon: string; body: ReactNode; meta?: string };

/**
 * Frame 999:265 ("Precision in Every Detail"): three bordered cards, each opening to its full text, beside a large
 * photo of the piece. The cards carry the catalogue's own text (details, dimensions, materials and care), never the
 * frame's placeholder copy, and a card with no text behind it is not shown.
 */
export function ProductFeatures({ features, photo, title }: { features: Feature[]; photo?: string; title: string }) {
  if (!features.length) return null;
  return (
    <section data-store data-features aria-labelledby="product-features-title" className="bg-white px-4 pt-14 pb-12 font-product text-black md:px-12 md:pt-[60px] md:pb-[120px]">
      <div className="flex flex-col items-center gap-3 text-center">
        <h2 id="product-features-title" className="m-0 text-[36px] leading-[1.2] font-medium text-maple md:text-[48px]">Precision in Every Detail</h2>
        <p data-features-intro className="m-0 text-[14px] leading-[1.6]">Crafted in Delhi, made to order and fully customisable.</p>
      </div>
      <div className="mt-10 grid gap-10 md:mt-[95px] lg:grid-cols-[minmax(0,508px)_minmax(0,900px)] lg:items-center lg:justify-center lg:gap-[88px]">
        <div className="flex flex-col gap-6 lg:gap-10">
          {features.map((feature) => <FeatureCard key={feature.key} feature={feature} />)}
        </div>
        {photo && (
          <div data-feature-photo className="relative mx-auto aspect-[760/604] w-full max-w-[900px] overflow-hidden rounded-[20px] bg-cream [&_img]:object-cover">
            <ProductImage src={photo} alt={`${title} — detail view`} fill sizes="(max-width:1023px) 90vw, min(900px, calc(100vw - 772px))" />
          </div>
        )}
      </div>
    </section>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <article data-feature data-open={open} className="rounded-[10px] border border-solid border-maple/8 bg-white p-5">
      <div className="flex items-start justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
        <img src={`/product-page/${feature.icon}.svg`} alt="" width={26} height={24} className="h-6 w-auto" />
        <button type="button" aria-expanded={open} aria-controls={bodyId} aria-label={feature.title} onClick={() => setOpen((value) => !value)}
          className="relative grid size-[30px] shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-maple p-0 before:absolute before:h-px before:w-2 before:bg-white after:absolute after:h-2 after:w-px after:bg-white data-[open=true]:after:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple"
          data-open={open} />
      </div>
      <h3 className="m-0 mt-5 text-[20px] leading-[1.2] font-medium text-black">{feature.title}</h3>
      <div id={bodyId} data-feature-body className={cx("mt-2 text-[14px] leading-[1.6] whitespace-pre-line text-black [&_p]:m-0 [&_p+p]:mt-2 [&_:is(ul,ol)]:my-2 [&_:is(ul,ol)]:pl-5 [&_:is(h2,h3,h4,h5,h6)]:m-0 [&_:is(h2,h3,h4,h5,h6)]:text-[15px] [&_:is(h2,h3,h4,h5,h6)]:font-semibold [&_a]:font-semibold [&_a]:text-maple [&_a]:underline", !open && "line-clamp-2")}>
        {feature.body}
      </div>
      {open && feature.meta && <p data-feature-meta className="m-0 mt-2 text-[13px] text-[#5e574f]">{feature.meta}</p>}
    </article>
  );
}
