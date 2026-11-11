"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, Plus, X } from "lucide-react";
import { cx } from "@/lib/cx";
import { ProductImage } from "./product-image";

export type FeatureRow = [label: string, value: string];
export type Feature = {
  key: string;
  title: string;
  icon: string;
  body?: ReactNode;
  rows?: FeatureRow[];
  /** The rows are measurements, shown as pill chips (owner, 10 Nov 2026). */
  chips?: boolean;
  link?: { label: string; href: string };
  /** The body runs past the two lines a closed card shows (longer than `previewChars`). */
  long?: boolean;
};

/** About how much body text two lines of a card hold; longer text shows its first two lines on the card. */
export const previewChars = 90;
// A card shows this many of its rows; the rest stay on the page, hidden, and all of them show in its popup.
const previewRows = 2;
// Where a highlight's hotspot sits on the photo (left and top, as a share of it), in Keeri's order: spread over the
// middle of the frame, where a product photograph puts the piece. Keeri's highlights carry no position of their own.
const noteSpots = [[30, 34], [68, 30], [52, 56], [28, 74], [72, 72]] as const;
// Card placement beside the photo (frame 2:625), from 1024px: the first and third left of the photo, the second and
// fourth right. The right pair sits 60px lower, moved rather than pushed, so the left column keeps its own spacing.
const place = ["lg:col-start-1 lg:row-start-1", "lg:col-start-3 lg:row-start-1 lg:translate-y-[60px]", "lg:col-start-1 lg:row-start-2", "lg:col-start-3 lg:row-start-2 lg:translate-y-[60px]"];
const shortRow = 28;
const photoSizes = "(max-width:767px) 92vw, (min-width:1600px) 50vw, 640px";
const rich = "[&_p]:m-0 [&_p+p]:mt-2 [&_:is(ul,ol)]:my-2 [&_:is(ul,ol)]:pl-5 [&_:is(h2,h3,h4,h5,h6)]:m-0 [&_:is(h2,h3,h4,h5,h6)]:text-[15px] [&_:is(h2,h3,h4,h5,h6)]:font-semibold [&_a]:font-semibold [&_a]:text-maple [&_a]:underline";
// The store's calm motion: half a second, easing out.
const calm = "duration-500 ease-[cubic-bezier(.22,1,.36,1)]";

/** From 1024px the cards stand beside the photo, and a card's popup floats beside it; below, the popup is a bottom sheet. */
const beside = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(min-width: 1024px)").matches);

/**
 * Frame 2:625 ("Precision in Every Detail"), for every piece, sofas and beds included (owner, 4 Nov 2026): the piece's
 * photo with a hotspot for each of its highlights in Keeri, which opens a chip with that line, and four cards
 * around it. The hotspots and the cards stand apart: no line joins them, and a piece without highlights in Keeri has no
 * hotspots rather than invented ones. A card shows a little (two lines of text, two rows); all of its text stays on the
 * page for search engines and screen readers. The cards carry the catalogue's own text, never the frame's placeholder
 * copy. As Keeri's highlights carry no position, a piece with them stands on its white-background photo where it has one
 * (`contain`), whole and in the middle, under its hotspots. Under the photo stands the piece's name alone.
 *
 * A card opens like a chip (owner, 10 Nov 2026): the card stays exactly as it is, and its whole story floats in a popup
 * anchored to it, towards the photo, or rises as a sheet on a phone or tablet. One at a time; its close button, Escape
 * or a click outside closes it, back to the card's arrow.
 */
export function ProductFeatures({ features, highlights = [], photo, title, contain = false }: {
  features: Feature[]; highlights?: string[]; photo?: string; title: string;
  /** The photo is a white-background cut-out, shown whole on a soft panel. */
  contain?: boolean;
}) {
  const [openCard, setOpenCard] = useState<string | null>(null);
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
  // A card's popup closes on Escape or a click outside it, and the card's arrow takes the focus back. A click on another
  // card's arrow opens that one instead.
  useEffect(() => {
    if (openCard === null) return;
    const close = () => {
      setOpenCard(null);
      document.querySelector<HTMLElement>(`[data-feature="${openCard}"] [data-feature-toggle]`)?.focus({ preventScroll: true });
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const click = (event: MouseEvent) => {
      if (!(event.target as Element | null)?.closest?.("[data-feature-pop], [data-feature-toggle]")) close();
    };
    document.addEventListener("keydown", key);
    document.addEventListener("click", click);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("click", click); };
  }, [openCard]);
  if (!cards.length) return null;
  const toggle = (key: string) => setOpenCard((current) => (current === key ? null : key));
  const close = (key: string) => {
    setOpenCard(null);
    document.querySelector<HTMLElement>(`[data-feature="${key}"] [data-feature-toggle]`)?.focus({ preventScroll: true });
  };
  return (
    <section data-store data-features aria-labelledby="product-features-title" className="bg-white px-4 font-text text-black md:px-12">
      <div className="mx-auto flex max-w-[1240px] flex-col items-center gap-2 text-center">
        <h2 id="product-features-title" className="m-0 text-[36px] leading-[1.2] font-medium text-maple md:text-[46px] md:leading-[1.5]">Precision in Every Detail</h2>
        <p data-features-intro className="m-0 text-[15px] leading-[26px] text-[#756d68] md:text-[17px]">Discover the finishes, textures and thoughtful details that make {title} your own.</p>
      </div>
      {/* From 1024px the cards stand beside the photo (they waited for 1280px, which a laptop at 125% never reaches), their
          columns easing from 232px to 304px with the window while the photo takes the rest, up to 640px. */}
      <div data-features-layout="around"
        className="relative mx-auto mt-10 grid max-w-[1304px] gap-4 md:mt-14 md:grid-cols-2 md:gap-6 lg:mt-[clamp(56px,5.5vw,90px)] lg:grid-cols-[clamp(232px,calc(26vw_-_30px),304px)_minmax(0,640px)_clamp(232px,calc(26vw_-_30px),304px)] lg:grid-rows-[auto_auto] lg:justify-between lg:gap-x-[clamp(16px,2vw,24px)] lg:gap-y-10 lg:pb-[60px] wide:max-w-none wide:grid-cols-[minmax(0,1fr)_minmax(0,2.1fr)_minmax(0,1fr)]">
        {photo && (
          <figure className="m-0 flex flex-col items-center md:col-span-2 lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div data-feature-photo className="relative aspect-[640/508] w-full max-w-[640px] wide:max-w-none">
              {/* A cut-out stands on the page, its white blended into it; a photograph fills the frame (owner, 10 Nov 2026:
                  no picture inside a blurred copy of itself). */}
              <div data-feature-photo-frame className={cx("absolute inset-0 overflow-hidden rounded-[20px] bg-transparent", contain ? "[&_img]:object-contain [&_img]:mix-blend-multiply" : "[&_img]:object-cover")}>
                <ProductImage src={photo} alt={`${title} — detail view`} fill sizes={photoSizes} />
              </div>
              {notes.map((line, i) => {
                const [x, y] = noteSpots[i]!, shown = shownNote === i, chipId = `${chipBase}-highlight-${i}`;
                return (
                  // A zero-size anchor at the point itself: the plus centres on it, and a chip opens 26px to either side of it.
                  <div key={i} data-highlight={i} className={cx("absolute size-0", shown ? "z-[4]" : "z-[3]")} style={{ left: `${x}%`, top: `${y}%` }}>
                    <button type="button" data-highlight-spot aria-label={`Highlight ${i + 1} of ${notes.length}`} aria-expanded={shown} aria-controls={chipId} aria-describedby={chipId}
                      onClick={() => setShownNote(shown ? null : i)}
                      className="group/spot relative grid size-11 -translate-1/2 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-maple">
                      {/* A small dark plus on a light disc (owner, 9 and 10 Nov 2026), breathing a faint ring and turning to a
                          cross while its chip is open; the button around it keeps a 44px target. */}
                      <span data-highlight-plus aria-hidden="true" style={{ "--spot": i } as CSSProperties}
                        className={cx("relative grid size-[22px] place-items-center rounded-full bg-[#f6e8e5] text-maple shadow-[0_2px_8px_rgb(128_36_28/0.22)] transition-transform group-hover/spot:scale-110 group-aria-expanded/spot:rotate-45 motion-reduce:transition-none", calm)}>
                        <Plus className="size-3" strokeWidth={2.75} />
                      </span>
                    </button>
                    <p id={chipId} data-highlight-chip data-side={x <= 50 ? "right" : "left"} hidden={!shown}
                      className={cx("absolute top-0 m-0 w-max max-w-[min(17rem,calc(50vw-46px))] -translate-y-1/2 rounded-[14px] border border-solid border-maple/15 bg-white/95 px-4 py-2.5 text-left text-[13px] leading-[19px] font-medium text-[#3b3430] shadow-[0_14px_34px_-10px_rgb(31_18_13/0.22)] backdrop-blur-sm",
                        x <= 50 ? "left-[26px]" : "right-[26px]")}>
                      {line}
                    </p>
                  </div>
                );
              })}
            </div>
            {/* The piece's name alone, set bolder (owner, 10 Nov 2026). */}
            <figcaption data-features-caption className="mt-6 flex justify-center text-center lg:mt-10">
              <span className="text-[13px] leading-[18px] font-bold tracking-[0.2em] text-maple uppercase">{title}</span>
            </figcaption>
          </figure>
        )}
        {cards.map((feature, i) => (
          <FeatureCard key={feature.key} feature={feature} open={openCard === feature.key} onToggle={() => toggle(feature.key)} onClose={() => close(feature.key)}
            className={place[i]!} side={i % 2 ? "left" : "right"} />
        ))}
      </div>
    </section>
  );
}

/**
 * A card that shows a little (two lines of text, or two rows) and stays exactly so: the arrow in its top corner, which
 * points down while closed and turns up once open (owner, 10 Nov 2026), opens its popup. The arrow belongs to the title's
 * button, drawn in the corner, so one control opens the card and its title names it; that button reaches over the whole
 * card (its ::after fills the card's surface), so a click anywhere on the card opens it (owner, 10 Nov 2026), while a link
 * in the card's text stays above it. A card with nothing more to show has no arrow. `side` is where its popup opens:
 * towards the photo.
 */
function FeatureCard({ feature, open, onToggle, onClose, className, side }: {
  feature: Feature; open: boolean; onToggle: () => void; onClose: () => void; className: string; side: "left" | "right";
}) {
  const popId = useId();
  const rows = feature.rows ?? [];
  // Plain text counts its own length; rich text comes with its length already judged.
  const long = Boolean(feature.long || (typeof feature.body === "string" && feature.body.length > previewChars));
  const opens = long || rows.length > previewRows || Boolean(feature.link);
  // The popup sits beside the card, not in it: the card's own content is the same whether its popup is open or not.
  return (
    <div data-feature-slot data-open={open} className={cx("relative min-w-0 self-start", className)}>
      <article id={`feature-${feature.key}`} data-feature={feature.key} data-open={open} className="min-w-0">
        <div data-feature-surface className={cx("relative flex w-full flex-col items-start gap-3 rounded-[14px] border border-solid border-[#eae5e1] bg-white p-[22px] transition-[border-color,box-shadow] motion-reduce:transition-none",
          "has-[[data-feature-toggle]:hover]:border-[#dccbc4] has-[[data-feature-toggle]:hover]:shadow-[0_16px_32px_-22px_rgb(31_18_13/0.4)]",
          "has-[[data-feature-toggle]:focus-visible]:outline-2 has-[[data-feature-toggle]:focus-visible]:outline-offset-2 has-[[data-feature-toggle]:focus-visible]:outline-maple", calm)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
          <img src={`/product-page/${feature.icon}.svg`} alt="" width={26} height={26} className="size-[26px]" />
          <h3 className="m-0 w-full text-[22px] leading-[1.5] font-medium text-[#3b3430]">
            {opens ? (
              <button type="button" data-feature-toggle aria-expanded={open} aria-controls={popId} aria-haspopup="dialog" onClick={onToggle}
                className="group/toggle block w-full cursor-pointer rounded-[6px] border-0 bg-transparent p-0 text-left [font:inherit] text-inherit focus-visible:outline-none after:absolute after:inset-0 after:rounded-[14px] after:content-['']">
                <span>{feature.title}</span>
                <span data-feature-arrow aria-hidden="true"
                  className={cx("absolute top-[21px] right-[22px] grid size-7 place-items-center rounded-full bg-maple text-white shadow-[0_6px_14px_-6px_rgb(128_36_28/0.6)] transition-transform group-hover/toggle:scale-110 group-aria-expanded/toggle:rotate-180 motion-reduce:transition-none", calm)}>
                  <ArrowDown className="size-4" strokeWidth={2.25} />
                </span>
              </button>
            ) : feature.title}
          </h3>
          <div data-feature-content className="flex w-full flex-col gap-3 [&_a]:relative [&_a]:z-[1]">
            {feature.body && (
              <div data-feature-body className={cx("text-[15px] leading-[23px] whitespace-pre-line text-[#756d68]", rich, long && opens && "line-clamp-2")}>{feature.body}</div>
            )}
            {rows.length > 0 && (
              <dl data-feature-rows data-feature-chips={feature.chips || undefined} className={cx("m-0 flex w-full text-[13px] leading-5", feature.chips ? "flex-wrap gap-2" : "flex-col gap-2")}>
                {rows.map(([label, value], index) => {
                  const hide = opens && index >= previewRows, stacked = value.length > shortRow;
                  return (
                    <div key={label} data-feature-row={stacked ? "stacked" : ""} hidden={hide}
                      className={cx(hide ? "hidden" : feature.chips && !stacked ? "inline-flex" : "flex",
                        feature.chips
                          ? cx("max-w-full gap-x-1.5 border border-solid border-maple/12 bg-[#faf6f3]", stacked ? "flex-col items-start gap-y-0.5 rounded-[16px] px-3.5 py-2" : "items-baseline rounded-full px-3 py-1.5")
                          : stacked ? "flex-col gap-0.5" : "items-start justify-between gap-4")}>
                      <dt className={feature.chips ? "text-[#8a817b]" : "text-[#756d68]"}>{label}</dt>
                      <dd className={cx("m-0 font-medium text-[#3b3430]", !feature.chips && !stacked && "text-right")}>{value}</dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </div>
        </div>
      </article>
      {opens && <FeaturePop id={popId} feature={feature} open={open} side={side} onClose={onClose} />}
    </div>
  );
}

type Block = { kind: "rows"; rows: { label?: string; value: string }[] } | { kind: "heading" | "text"; text: string };

/**
 * Plain text as a popup tells it: every bullet, and every "Label: value" line, is a pill row; a short line followed by
 * more text is a heading; the rest is text. Bullets that share a line are split.
 */
export function popBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const row = (item: string) => {
    const labelled = /^([^:]{1,32}):\s*(\S.*)$/.exec(item);
    return labelled ? { label: labelled[1]!.trim(), value: labelled[2]!.trim() } : { value: item };
  };
  const pushRows = (items: { label?: string; value: string }[]) => {
    const last = blocks.at(-1);
    if (last?.kind === "rows") last.rows.push(...items);
    else blocks.push({ kind: "rows", rows: items });
  };
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  lines.forEach((line, index) => {
    if (!line) return;
    if (/^[•*–-]\s*/.test(line) || line.includes(" • ")) {
      pushRows(line.split("•").map((item) => item.replace(/^[*–-]\s*/, "").trim()).filter(Boolean).map(row));
      return;
    }
    if (/^[^:]{1,32}:\s*\S/.test(line)) { pushRows([row(line)]); return; }
    const next = lines.slice(index + 1).find(Boolean);
    const heading = line.length <= 48 && !/[.!?:,;]$/.test(line) && Boolean(next) && !/^[•*–-]/.test(next!);
    blocks.push({ kind: heading ? "heading" : "text", text: line });
  });
  return blocks;
}

/**
 * A card's popup, its "chip" (owner, 10 Nov 2026): a white panel with a soft layered shadow and a caret pointing back to
 * its card, opening towards the photo with a small pop (styles/product-parity.css), or, below 1024px, a sheet rising from
 * the bottom of the screen over a soft backdrop. Specifications are pill chips; materials, care and the like are pill
 * rows; About Product is text. It names itself by its card's title and has its own close button.
 */
function FeaturePop({ id, feature, open, side, onClose }: { id: string; feature: Feature; open: boolean; side: "left" | "right"; onClose: () => void }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"beside" | "sheet">("beside");
  const rows = feature.rows ?? [];
  // On opening: beside its card or as a sheet, placed to stay on screen under the pinned header, its caret on the arrow.
  useLayoutEffect(() => {
    const pop = panel.current;
    if (!open || !pop) return;
    const settle = () => {
      const next = beside() ? "beside" : "sheet";
      setMode(next);
      const card = pop.parentElement?.getBoundingClientRect();
      if (next !== "beside" || !card) return;
      const height = pop.offsetHeight;
      const header = parseFloat(getComputedStyle(pop).getPropertyValue("--site-header-offset")) || 0;
      let top = -10;
      top += Math.min(0, window.innerHeight - 16 - (card.top + top + height));
      top = Math.max(top, header + 12 - card.top);
      pop.style.setProperty("--pop-top", `${Math.round(top)}px`);
      pop.style.setProperty("--caret-y", `${Math.round(Math.min(Math.max(35 - top, 26), Math.max(26, height - 26)))}px`);
    };
    settle();
    pop.focus({ preventScroll: true });
    window.addEventListener("resize", settle);
    return () => window.removeEventListener("resize", settle);
  }, [open]);
  const sheet = mode === "sheet";
  return (
    <>
      {sheet && <div data-pop-backdrop aria-hidden="true" hidden={!open} onClick={onClose} />}
      <div ref={panel} id={id} role="dialog" aria-modal={sheet ? true : undefined} aria-labelledby={titleId} tabIndex={-1} hidden={!open}
        data-feature-pop data-mode={mode} data-side={side} className="text-left font-text text-[#3b3430] outline-none">
        {!sheet && <span data-pop-caret aria-hidden="true" />}
        <div data-pop-head className="flex items-center gap-3">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-maple/6">
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
            <img src={`/product-page/${feature.icon}.svg`} alt="" width={22} height={22} className="size-[22px]" />
          </span>
          <p id={titleId} data-pop-title className="m-0 min-w-0 flex-1 font-heading text-[20px] leading-[1.25] font-medium text-[#2b2522]">{feature.title}</p>
          <button type="button" data-pop-close aria-label={`Close ${feature.title}`} onClick={onClose}
            className={cx("grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-maple/6 p-0 text-maple transition-[background-color,rotate] hover:rotate-90 hover:bg-maple/12 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple motion-reduce:transition-none", calm)}>
            <X aria-hidden="true" className="size-4" strokeWidth={2.25} />
          </button>
        </div>
        <div data-pop-content className="flex flex-col gap-3">
          {feature.key === "about" || (feature.body && typeof feature.body !== "string") ? (
            feature.body && <div data-pop-body className={cx("text-[15px] leading-[24px] whitespace-pre-line text-[#5f5650]", rich)}>{feature.body}</div>
          ) : typeof feature.body === "string" && popBlocks(feature.body).map((block, index) => block.kind === "rows" ? (
            <PopRows key={index} rows={block.rows} />
          ) : block.kind === "heading" ? (
            <p key={index} data-pop-heading className="m-0 mt-1 font-heading text-[15px] leading-[1.35] font-medium text-[#2b2522]">{block.text}</p>
          ) : (
            <p key={index} data-pop-text className="m-0 text-[14px] leading-[22px] text-[#5f5650]">{block.text}</p>
          ))}
          {rows.length > 0 && (feature.chips ? (
            <ul data-pop-chips className="m-0 flex list-none flex-wrap gap-2 p-0">
              {rows.map(([label, value], index) => (
                <li key={label} data-pop-chip style={{ "--i": index } as CSSProperties}
                  className="inline-flex max-w-full items-baseline gap-1.5 rounded-full border border-solid border-maple/12 bg-[#faf6f3] px-3.5 py-[7px] text-[13.5px] leading-5">
                  <span className="text-[#8a817b]">{label}</span>
                  <span className="font-medium text-[#2b2522]">{value}</span>
                </li>
              ))}
            </ul>
          ) : <PopRows rows={rows.map(([label, value]) => ({ label, value }))} />)}
          {feature.link && (
            <Link data-pop-link href={feature.link.href}
              className="group/link mt-1 inline-flex items-center gap-1.5 self-start text-[13px] leading-5 font-semibold text-maple no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple">
              {feature.link.label}
              <ArrowUpRight aria-hidden="true" className="size-3.5 transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 motion-reduce:transition-none" />
            </Link>
          )}
        </div>
      </div>
    </>
  );
}

/** Pill rows: one rounded row per fact, its label set apart by a dot ("Frame & Legs · Solid wood…"). */
function PopRows({ rows }: { rows: { label?: string; value: string }[] }) {
  return (
    <ul data-pop-rows className="m-0 flex list-none flex-col gap-2 p-0">
      {rows.map((row, index) => (
        <li key={`${row.label ?? ""}${row.value}`} data-pop-row style={{ "--i": index } as CSSProperties}
          className="rounded-[18px] border border-solid border-maple/10 bg-[#faf6f3] px-4 py-2.5 text-[13.5px] leading-[20px] text-[#5f5650]">
          {row.label && <span data-pop-label className="font-semibold text-[#2b2522]">{row.label}</span>}
          <span data-pop-value>{row.value}</span>
        </li>
      ))}
    </ul>
  );
}
