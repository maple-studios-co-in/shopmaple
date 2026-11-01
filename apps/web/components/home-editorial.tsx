import type { CSSProperties } from "react";
import Link from "next/link";
import { ContentImage as Image } from "@/components/content-image";
import { CompareIsland } from "@/components/compare-island";
import { getProductCards } from "@/lib/catalog";
import type { ResolvedHomeDetails } from "@/lib/home-details-defaults";

/** "Pull up a chair": a square photo with its caption beside one large photo. */
export function HomeEditorial({ content }: { content: ResolvedHomeDetails["editorial"] }) {
  return (
    <section className="home-editorial home-container" aria-label={content.title} data-editorial>
      <div data-editorial-left>
        <div data-editorial-photo="square">
          <Image src={content.leftImage} alt={content.leftAlt} fill sizes="(max-width:749px) calc(100vw - 32px), (min-width:1265px) 386px, 32vw" />
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

/**
 * "Find your feel": two catalogue photos either side of a divider. Everything is server HTML, with
 * the divider at the middle by a CSS variable; the drag script loads later (CompareIsland). Without
 * both products and both photos there is nothing to compare, so the section draws nothing.
 */
export async function HomeCompare({ content }: { content: ResolvedHomeDetails["compare"] }) {
  const handles = [content.left.handle, content.right.handle];
  const unique = [...new Set(handles)];
  const cards = await getProductCards(handles).catch(() => []);
  // A renamed product answers under its new handle, in the order it was asked for.
  const pick = (handle: string) => cards.find((card) => card.handle === handle) ?? (cards.length === unique.length ? cards[unique.indexOf(handle)] : undefined);
  const sides = [
    { side: "left", label: content.left.label, product: pick(content.left.handle) },
    { side: "right", label: content.right.label, product: pick(content.right.handle) },
  ] as const;
  if (sides.some(({ product }) => !product?.image)) return null;
  return (
    <section className="home-compare home-container" aria-label={content.heading} data-compare>
      <header data-compare-header>
        <p data-compare-eyebrow>{content.eyebrow}</p>
        <h2>{content.heading}</h2>
        <p data-compare-lede>{content.lede}</p>
      </header>
      <div data-compare-card style={{ "--compare-pos": "50%" } as CSSProperties}>
        {sides.map(({ side, label, product }) => (
          <div key={side} data-compare-pane={side}>
            <Image src={product!.image!} alt={product!.title} fill sizes="(max-width:749px) calc(100vw - 32px), 779px" />
            <span data-compare-label>{label}</span>
          </div>
        ))}
        <div data-compare-divider>
          <span role="slider" aria-label={`Compare ${content.left.label} and ${content.right.label}`} aria-orientation="horizontal"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={50} data-compare-grip>
            <i data-compare-bar /><i data-compare-bar /><i data-compare-bar />
          </span>
        </div>
        <CompareIsland />
      </div>
    </section>
  );
}
