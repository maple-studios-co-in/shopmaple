import type { CSSProperties } from "react";
import Link from "next/link";
import { ContentImage as Image } from "@/components/content-image";
import { CompareIsland } from "@/components/compare-island";
import { currentHandle } from "@/lib/retired-products";
import { getProductCards } from "@/lib/catalog";
import type { ResolvedHomeDetails } from "@/lib/home-details-defaults";
import type { TemplateMedia } from "@shopmaple/contracts";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";

const flipKeys = ["home-editorial-flip-1", "home-editorial-flip-2", "home-editorial-flip-3", "home-editorial-flip-4"] as const;

/**
 * Maple's dining pieces the square photo cuts through, after the staff's own photo: a hard cut every 800 ms,
 * on and on while it is in view, as in the owner's reference recording. Seating and tables only: the owner took the
 * Arden sideboard out (4 Nov 2026), as it is no place to pull up a chair. These are the originals; each frame is
 * template artwork that staff can replace (12 Nov 2026).
 */
export const editorialFlipFrames = flipKeys.map((key) => resolveTemplateMedia(key).image);

/** "Pull up a chair": a square photo with its caption beside one large photo. */
export function HomeEditorial({ content, media }: { content: ResolvedHomeDetails["editorial"]; media?: TemplateMedia }) {
  // The staff's own photo leads; a frame showing the same picture is not repeated.
  const frames = [...new Set([content.leftImage, ...flipKeys.map((key) => resolveTemplateMedia(key, media).image)])];
  return (
    <section className="home-editorial home-container" aria-label={content.title} data-editorial>
      <div data-editorial-left>
        <div data-editorial-photo="square" data-flipbook>
          {frames.map((src, i) => (
            <div key={src} data-flip-frame data-active={i === 0 ? "" : undefined} aria-hidden={i === 0 ? undefined : true}>
              <Image src={src} alt={i === 0 ? content.leftAlt : ""} fill sizes="(max-width:749px) calc(100vw - 32px), (min-width:1265px) 386px, 32vw" />
            </div>
          ))}
        </div>
        <div data-editorial-caption>
          <h2 data-editorial-title>{content.title}</h2>
          <p data-editorial-text>{content.text}</p>
          <Link href={content.href} data-editorial-cta>{content.cta}</Link>
        </div>
      </div>
      <div data-editorial-right>
        <div data-editorial-photo="wide">
          <Image src={content.rightImage} alt={content.rightAlt} fill sizes="(max-width:749px) calc(100vw - 32px), (min-width:1265px) 720px, 60vw" />
        </div>
      </div>
    </section>
  );
}

/** Where the divider rests: a quarter of the old piece, the rest the new one, until the shopper drags it. */
export const compareStart = 25;

/**
 * "Find your feel": two catalogue photos either side of a divider. Everything is server HTML, with
 * the divider a quarter of the way across by a CSS variable; the drag script loads later (CompareIsland).
 * Without both products and both photos there is nothing to compare, so the section draws nothing.
 */
export async function HomeCompare({ content }: { content: ResolvedHomeDetails["compare"] }) {
  // A product that left the store with Shopify is compared through its Keeri replacement, labelled with that product's
  // own name; one without a replacement leaves the section out (lib/retired-products.ts).
  const current = [content.left, content.right].map((side) => ({ handle: currentHandle(side.handle), label: currentHandle(side.handle) === side.handle ? side.label : null }));
  if (current.some((side) => !side.handle)) return null;
  const handles = current.map((side) => side.handle!);
  const unique = [...new Set(handles)];
  const cards = await getProductCards(handles).catch(() => []);
  // A renamed product answers under its new handle, in the order it was asked for.
  const pick = (handle: string) => cards.find((card) => card.handle === handle) ?? (cards.length === unique.length ? cards[unique.indexOf(handle)] : undefined);
  const sides = (["left", "right"] as const).map((side, index) => {
    const product = pick(handles[index]!);
    return { side, label: current[index]!.label ?? product?.title ?? "", product };
  });
  if (sides.some(({ product }) => !product?.image)) return null;
  return (
    <section className="home-compare home-container" aria-label={content.heading} data-compare>
      <header data-compare-header>
        <p data-compare-eyebrow>{content.eyebrow}</p>
        <h2>{content.heading}</h2>
        <p data-compare-lede>{content.lede}</p>
      </header>
      <div data-compare-card style={{ "--compare-pos": `${compareStart}%` } as CSSProperties}>
        {sides.map(({ side, label, product }) => (
          <div key={side} data-compare-pane={side}>
            <Image src={product!.image!} alt={product!.title} fill sizes="(max-width:749px) calc(100vw - 32px), 779px" />
            <span data-compare-label>{label}</span>
          </div>
        ))}
        <div data-compare-divider>
          <span role="slider" aria-label={`Compare ${sides[0]!.label} and ${sides[1]!.label}`} aria-orientation="horizontal"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={compareStart} data-compare-grip>
            <i data-compare-bar /><i data-compare-bar /><i data-compare-bar />
          </span>
        </div>
        <CompareIsland />
      </div>
    </section>
  );
}
