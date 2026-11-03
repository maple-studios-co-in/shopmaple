"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { cx } from "@/lib/cx";
import { ProductImage } from "./product-image";

export type FeatureRow = [label: string, value: string];
export type Feature = {
  key: string;
  title: string;
  icon: string;
  body?: ReactNode;
  rows?: FeatureRow[];
  link?: { label: string; href: string };
  /** Long text opens in full on request ("Read more"). */
  long?: boolean;
};

// Where the frame's hotspots sit on the photo (left and top, as a share of it), in card order.
const spots = [[22.5, 30.3], [63.8, 51.2], [19.2, 82.7], [78.4, 80.1]] as const;
// Card placement on wide screens (frame 2:625): 01 and 03 left of the photo, 02 and 04 right. The right pair sits 60px
// lower, moved rather than pushed, so the left column keeps its own spacing.
const place = ["xl:col-start-1 xl:row-start-1", "xl:col-start-3 xl:row-start-1 xl:translate-y-[60px]", "xl:col-start-1 xl:row-start-2", "xl:col-start-3 xl:row-start-2 xl:translate-y-[60px]"];
const shortRow = 28;
const rich = "[&_p]:m-0 [&_p+p]:mt-2 [&_:is(ul,ol)]:my-2 [&_:is(ul,ol)]:pl-5 [&_:is(h2,h3,h4,h5,h6)]:m-0 [&_:is(h2,h3,h4,h5,h6)]:text-[15px] [&_:is(h2,h3,h4,h5,h6)]:font-semibold [&_a]:font-semibold [&_a]:text-maple [&_a]:underline";

/**
 * Frame 2:625 ("Precision in Every Detail"): the piece's photo with a numbered hotspot per card, the cards around it
 * joined to their hotspots by thin lines on wide screens, and a caption under the photo. The cards carry the
 * catalogue's own text (details, materials, dimensions and care), never the frame's placeholder copy; a card with no
 * text behind it is not shown, and neither is its hotspot.
 */
export function ProductFeatures({ features, photo, title, tagline }: { features: Feature[]; photo?: string; title: string; tagline: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const cards = features.slice(0, 4);
  const keys = cards.map((feature) => feature.key).join(" ");
  useEffect(() => {
    const root = stage.current;
    if (!root || !photo || typeof ResizeObserver === "undefined") return;
    // Elbow lines from each card's inner edge to its hotspot, as the frame draws them; only where the cards flank the photo.
    const draw = () => {
      if (!window.matchMedia?.("(min-width: 1280px)").matches) { setLines([]); return; }
      const box = root.getBoundingClientRect();
      setLines(keys.split(" ").map((key, i) => {
        const card = root.querySelector(`[data-feature="${key}"]`)?.getBoundingClientRect();
        const spot = root.querySelector(`[data-hotspot="${key}"]`)?.getBoundingClientRect();
        if (!card || !spot) return "";
        const hx = spot.left + spot.width / 2 - box.left, hy = spot.top + spot.height / 2 - box.top;
        const y = Math.min(card.top - box.top + 109, card.bottom - box.top - 24);
        return i % 2 === 0
          ? `M${card.right - box.left} ${y}H${card.right - box.left + 82}V${hy}H${hx}`
          : `M${hx} ${hy}H${card.left - box.left - 56}V${y}H${card.left - box.left}`;
      }));
    };
    const observer = new ResizeObserver(draw);
    observer.observe(root);
    root.querySelectorAll("[data-feature]").forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [keys, photo]);
  if (!cards.length) return null;
  function show(key: string) {
    setActive((current) => (current === key ? null : key));
    document.getElementById(`feature-${key}`)?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }
  return (
    <section data-store data-features aria-labelledby="product-features-title" className="bg-white px-4 pt-14 pb-14 font-product text-black md:px-12 md:pt-[60px] md:pb-[100px]">
      <div className="mx-auto flex max-w-[1240px] flex-col items-center gap-2 text-center">
        <h2 id="product-features-title" className="m-0 text-[36px] leading-[1.2] font-medium text-maple md:text-[46px] md:leading-[1.5]">Precision in Every Detail</h2>
        <p data-features-intro className="m-0 text-[15px] leading-[26px] text-[#756d68] md:text-[17px]">Discover the finishes, textures and thoughtful details that make {title} your own.</p>
      </div>
      <div ref={stage} className="relative mx-auto mt-10 grid max-w-[1304px] gap-4 md:mt-16 md:grid-cols-2 md:gap-6 xl:mt-[90px] xl:grid-cols-[304px_minmax(0,640px)_304px] xl:grid-rows-[auto_auto] xl:justify-between xl:gap-x-6 xl:gap-y-10 xl:pb-[60px]">
        {photo && (
          <figure className="m-0 flex flex-col items-center md:col-span-2 xl:col-span-1 xl:col-start-2 xl:row-span-2 xl:row-start-1">
            <div data-feature-photo className="relative aspect-[640/508] w-full max-w-[640px] overflow-hidden rounded-[20px] bg-cream [&_img]:object-cover">
              <ProductImage src={photo} alt={`${title} — detail view`} fill sizes="(max-width:767px) 92vw, 640px" />
              {cards.map((feature, i) => (
                <button key={feature.key} type="button" data-hotspot={feature.key} aria-label={`Show ${feature.title}`} aria-controls={`feature-${feature.key}`}
                  aria-pressed={active === feature.key} onClick={() => show(feature.key)} style={{ left: `${spots[i]![0]}%`, top: `${spots[i]![1]}%` }}
                  className="group/spot absolute z-[2] grid size-[46px] -translate-1/2 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple">
                  {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design halo */}
                  <img src="/product-page/hotspot-halo.svg" alt="" width={46} height={46} className="absolute inset-0 size-[46px]" />
                  <span aria-hidden="true" className="relative grid size-8 place-items-center rounded-full bg-maple text-[20px] leading-[30px] text-white transition-transform group-aria-pressed/spot:rotate-45 motion-reduce:transition-none">+</span>
                </button>
              ))}
            </div>
            <figcaption data-features-caption className="mt-6 flex flex-col items-center gap-1 text-center xl:mt-[49px]">
              <span className="text-[12px] leading-[18px] font-medium tracking-[2px] text-maple uppercase">{title}</span>
              <span className="text-[14px] leading-[21px] text-[#756d68]">{tagline}</span>
            </figcaption>
          </figure>
        )}
        {cards.map((feature, i) => (
          <FeatureCard key={feature.key} feature={feature} number={i + 1} active={active === feature.key} className={place[i]!} />
        ))}
        <svg data-features-lines aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1] hidden size-full overflow-visible xl:block">
          {lines.map((d, i) => d && <path key={i} d={d} fill="none" stroke="#B4AAA3" strokeWidth={1.1} />)}
        </svg>
      </div>
    </section>
  );
}

function FeatureCard({ feature, number, active, className }: { feature: Feature; number: number; active: boolean; className: string }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const rows = feature.rows ?? [];
  // Long rows fold after the first three, as long text folds after four lines.
  const shownRows = feature.long && !open && !feature.body ? rows.slice(0, 3) : rows;
  return (
    <article id={`feature-${feature.key}`} data-feature={feature.key} data-active={active}
      className={cx("relative z-[2] flex min-w-0 scroll-mt-24 flex-col items-start gap-3 self-start rounded-[12px] border border-solid border-[#eae5e1] bg-white p-[22px] transition-[border-color,box-shadow] motion-reduce:transition-none data-[active=true]:border-maple/40 data-[active=true]:shadow-[0_10px_30px_rgb(128_36_28/0.08)]", className)}>
      <div className="flex w-full items-center justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
        <img src={`/product-page/${feature.icon}.svg`} alt="" width={26} height={26} className="size-[26px]" />
        <span data-feature-number className="text-[12px] leading-[18px] font-medium text-[#9b918a]">{String(number).padStart(2, "0")}</span>
      </div>
      <h3 className="m-0 text-[22px] leading-[1.5] font-medium text-[#3b3430]">{feature.title}</h3>
      <div id={bodyId} className="flex w-full flex-col gap-3">
        {feature.body && (
          <div data-feature-body className={cx("text-[15px] leading-[23px] whitespace-pre-line text-[#756d68]", rich, feature.long && !open && "line-clamp-4")}>{feature.body}</div>
        )}
        {shownRows.length > 0 && (
          <dl data-feature-rows className="m-0 flex w-full flex-col gap-2 text-[13px] leading-5">
            {shownRows.map(([label, value]) => value.length <= shortRow ? (
              <div key={label} data-feature-row="" className="flex items-start justify-between gap-4">
                <dt className="text-[#756d68]">{label}</dt>
                <dd className="m-0 text-right font-medium text-[#3b3430]">{value}</dd>
              </div>
            ) : (
              <div key={label} data-feature-row="stacked" className="flex flex-col gap-0.5">
                <dt className="text-[#756d68]">{label}</dt>
                <dd className="m-0 font-medium text-[#3b3430]">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      {feature.long && (
        <button type="button" data-feature-more aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((value) => !value)}
          className="cursor-pointer border-0 bg-transparent p-0 text-[12px] leading-[18px] font-medium text-[#3b3430] underline underline-offset-2 hover:text-maple focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple">
          {open ? "Read less" : "Read more"}
        </button>
      )}
      {feature.link && (
        <Link data-feature-link href={feature.link.href} className="text-[12px] leading-[18px] font-medium text-maple no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple">
          {feature.link.label}
        </Link>
      )}
    </article>
  );
}
