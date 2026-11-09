"use client";
import { useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUp, Plus } from "lucide-react";
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
  /** The body runs past the two lines a closed card shows (longer than `previewChars`). */
  long?: boolean;
};

/** About how much body text two lines of a card hold; longer text shows its first two lines until the card opens. */
export const previewChars = 90;
// A closed card shows this many of its rows; the rest stay on the page, hidden until it opens.
const previewRows = 2;
// Where a highlight's hotspot sits on the photo (left and top, as a share of it), in Keeri's order: spread over the
// middle of the frame, where a product photograph puts the piece. Keeri's highlights carry no position of their own.
const noteSpots = [[30, 34], [68, 30], [52, 56], [28, 74], [72, 72]] as const;
// Card placement on wide screens (frame 2:625): the first and third left of the photo, the second and fourth right. The right pair sits 60px
// lower, moved rather than pushed, so the left column keeps its own spacing.
const place = ["xl:col-start-1 xl:row-start-1", "xl:col-start-3 xl:row-start-1 xl:translate-y-[60px]", "xl:col-start-1 xl:row-start-2", "xl:col-start-3 xl:row-start-2 xl:translate-y-[60px]"];
const shortRow = 28;
const rich = "[&_p]:m-0 [&_p+p]:mt-2 [&_:is(ul,ol)]:my-2 [&_:is(ul,ol)]:pl-5 [&_:is(h2,h3,h4,h5,h6)]:m-0 [&_:is(h2,h3,h4,h5,h6)]:text-[15px] [&_:is(h2,h3,h4,h5,h6)]:font-semibold [&_a]:font-semibold [&_a]:text-maple [&_a]:underline";

/**
 * Frame 2:625 ("Precision in Every Detail"), for every piece, sofas and beds included (owner, 4 Nov 2026): the piece's
 * photo with a hotspot for each of its highlights in Keeri, which opens a chip with that line, and four cards
 * around it. The hotspots and the cards stand apart: no line joins them, and a piece without highlights in Keeri has no
 * hotspots rather than invented ones. A card shows a little (two lines of text, two rows) and opens in place to show the
 * rest and its link; all of it stays on the page for search engines and screen readers. The cards carry the catalogue's
 * own text, never the frame's placeholder copy. As Keeri's highlights carry no position, a piece with them stands on its
 * white-background photo where it has one (`contain`), whole and in the middle, under its hotspots.
 */
export function ProductFeatures({ features, highlights = [], photo, title, tagline, contain = false }: {
  features: Feature[]; highlights?: string[]; photo?: string; title: string; tagline: string;
  /** The photo is a white-background cut-out, shown whole on a soft panel. */
  contain?: boolean;
}) {
  const [open, setOpen] = useState<string[]>([]);
  const [shownNote, setShownNote] = useState<number | null>(null);
  const chipBase = useId();
  const cards = features.slice(0, 4);
  const notes = photo ? highlights.slice(0, noteSpots.length) : [];
  // An open chip closes on Escape, or on a tap anywhere but its own hotspot.
  useEffect(() => {
    if (shownNote === null) return;
    const close = (event: Event) => {
      if (event.type === "keydown" ? (event as KeyboardEvent).key === "Escape" : !(event.target as Element | null)?.closest?.("[data-highlight]")) setShownNote(null);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", close); };
  }, [shownNote]);
  if (!cards.length) return null;
  const toggle = (key: string) => setOpen((shown) => (shown.includes(key) ? shown.filter((item) => item !== key) : [...shown, key]));
  return (
    <section data-store data-features aria-labelledby="product-features-title" className="bg-white px-4 font-text text-black md:px-12">
      <div className="mx-auto flex max-w-[1240px] flex-col items-center gap-2 text-center">
        <h2 id="product-features-title" className="m-0 text-[36px] leading-[1.2] font-medium text-maple md:text-[46px] md:leading-[1.5]">Precision in Every Detail</h2>
        <p data-features-intro className="m-0 text-[15px] leading-[26px] text-[#756d68] md:text-[17px]">Discover the finishes, textures and thoughtful details that make {title} your own.</p>
      </div>
      <div data-features-layout="around" className="relative mx-auto mt-10 grid max-w-[1304px] gap-4 md:mt-16 md:grid-cols-2 md:gap-6 xl:mt-[90px] xl:grid-cols-[304px_minmax(0,640px)_304px] xl:grid-rows-[auto_auto] xl:justify-between xl:gap-x-6 xl:gap-y-10 xl:pb-[60px] wide:max-w-none wide:grid-cols-[minmax(0,1fr)_minmax(0,2.1fr)_minmax(0,1fr)]">
        {photo && (
          <figure className="m-0 flex flex-col items-center md:col-span-2 xl:col-span-1 xl:col-start-2 xl:row-span-2 xl:row-start-1">
            <div data-feature-photo className="relative aspect-[640/508] w-full max-w-[640px] wide:max-w-none">
              {/* A cut-out sits on the same soft panel as a photograph, its white blended into it. */}
              <div data-feature-photo-frame className={cx("absolute inset-0 overflow-hidden rounded-[20px] bg-transparent", contain ? "[&_img]:object-contain [&_img]:mix-blend-multiply" : "[&_img]:object-cover")}>
                <ProductImage src={photo} alt={`${title} — detail view`} fill sizes="(max-width:767px) 92vw, (min-width:1600px) 50vw, 640px" />
              </div>
              {notes.map((line, i) => {
                const [x, y] = noteSpots[i]!, shown = shownNote === i, chipId = `${chipBase}-highlight-${i}`;
                return (
                  // A zero-size anchor at the point itself: the plus centres on it, and a chip opens 30px to either side of it.
                  <div key={i} data-highlight={i} className={cx("absolute size-0", shown ? "z-[4]" : "z-[3]")} style={{ left: `${x}%`, top: `${y}%` }}>
                    <button type="button" data-highlight-spot aria-label={`Highlight ${i + 1} of ${notes.length}`} aria-expanded={shown} aria-controls={chipId} aria-describedby={chipId}
                      onClick={() => setShownNote(shown ? null : i)}
                      className="group/spot relative grid size-[46px] -translate-1/2 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple">
                      {/* A dark plus on a light disc, turning to a cross while its chip is open (owner, 9 Nov 2026). */}
                      <span data-highlight-plus aria-hidden="true" className="relative grid size-8 place-items-center rounded-full bg-[#f6e8e5] text-maple shadow-[0_2px_10px_rgb(128_36_28/0.18)] transition-transform group-aria-expanded/spot:rotate-45 motion-reduce:transition-none">
                        <Plus className="size-4" strokeWidth={2.5} />
                      </span>
                    </button>
                    <p id={chipId} data-highlight-chip hidden={!shown}
                      className={cx("absolute top-0 m-0 w-max max-w-[min(17rem,calc(50vw-46px))] -translate-y-1/2 rounded-[14px] border border-solid border-maple/15 bg-white px-4 py-2.5 text-left text-[13px] leading-[19px] font-medium text-[#3b3430] shadow-[0_10px_30px_rgb(31_18_13/0.16)]",
                        x <= 50 ? "left-[30px]" : "right-[30px]")}>
                      {line}
                    </p>
                  </div>
                );
              })}
            </div>
            <figcaption data-features-caption className="mt-6 flex flex-col items-center gap-1 text-center xl:mt-[49px]">
              <span className="text-[12px] leading-[18px] font-medium tracking-[2px] text-maple uppercase">{title}</span>
              <span className="text-[14px] leading-[21px] text-[#756d68]">{tagline}</span>
            </figcaption>
          </figure>
        )}
        {cards.map((feature, i) => (
          <FeatureCard key={feature.key} feature={feature} open={open.includes(feature.key)} onToggle={() => toggle(feature.key)} className={place[i]!} />
        ))}
      </div>
    </section>
  );
}

/**
 * A card that shows a little until it is opened: two lines of text, or two rows, with the rest and its link opening in
 * place from the arrow in its top corner, which points up while closed and down once open (owner, 6 Nov 2026). The arrow
 * belongs to the title's button, drawn in the corner, so one control opens the card and its title names it. A card with
 * nothing more to show has no arrow.
 */
function FeatureCard({ feature, open, onToggle, className }: { feature: Feature; open: boolean; onToggle: () => void; className: string }) {
  const contentId = useId();
  const rows = feature.rows ?? [];
  // Plain text counts its own length; rich text comes with its length already judged.
  const long = Boolean(feature.long || (typeof feature.body === "string" && feature.body.length > previewChars));
  const opens = long || rows.length > previewRows || Boolean(feature.link);
  const closed = opens && !open;
  return (
    <article id={`feature-${feature.key}`} data-feature={feature.key} data-open={open}
      className={cx("relative z-[2] flex min-w-0 scroll-mt-24 flex-col items-start gap-3 self-start rounded-[12px] border border-solid border-[#eae5e1] bg-white p-[22px] transition-[border-color,box-shadow] motion-reduce:transition-none data-[open=true]:border-maple/40 data-[open=true]:shadow-[0_10px_30px_rgb(128_36_28/0.08)]", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
      <img src={`/product-page/${feature.icon}.svg`} alt="" width={26} height={26} className="size-[26px]" />
      <h3 className="m-0 w-full text-[22px] leading-[1.5] font-medium text-[#3b3430]">
        {opens ? (
          <button type="button" data-feature-toggle aria-expanded={open} aria-controls={contentId} onClick={onToggle}
            className="group/toggle block w-full cursor-pointer rounded-[6px] border-0 bg-transparent p-0 text-left [font:inherit] text-inherit focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-maple">
            <span>{feature.title}</span>
            <span data-feature-arrow aria-hidden="true" className="absolute top-[21px] right-[22px] grid size-7 place-items-center rounded-full bg-maple text-white transition-transform group-aria-expanded/toggle:rotate-180 motion-reduce:transition-none">
              <ArrowUp className="size-4" strokeWidth={2.25} />
            </span>
          </button>
        ) : feature.title}
      </h3>
      <div id={contentId} data-feature-content className="flex w-full flex-col gap-3">
        {feature.body && (
          <div data-feature-body className={cx("text-[15px] leading-[23px] whitespace-pre-line text-[#756d68]", rich, closed && long && "line-clamp-2")}>{feature.body}</div>
        )}
        {rows.length > 0 && (
          <dl data-feature-rows className="m-0 flex w-full flex-col gap-2 text-[13px] leading-5">
            {rows.map(([label, value], index) => value.length <= shortRow ? (
              <div key={label} data-feature-row="" hidden={closed && index >= previewRows} className={cx(closed && index >= previewRows ? "hidden" : "flex", "items-start justify-between gap-4")}>
                <dt className="text-[#756d68]">{label}</dt>
                <dd className="m-0 text-right font-medium text-[#3b3430]">{value}</dd>
              </div>
            ) : (
              <div key={label} data-feature-row="stacked" hidden={closed && index >= previewRows} className={cx(closed && index >= previewRows ? "hidden" : "flex", "flex-col gap-0.5")}>
                <dt className="text-[#756d68]">{label}</dt>
                <dd className="m-0 font-medium text-[#3b3430]">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {feature.link && (
          <Link data-feature-link href={feature.link.href} hidden={closed} className="text-[12px] leading-[18px] font-medium text-maple no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple">
            {feature.link.label}
          </Link>
        )}
      </div>
    </article>
  );
}
