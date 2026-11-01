import Image from "next/image";
import Link from "next/link";
import type { ProductCardModel } from "@/lib/product-card-model";
import { CardSwatchThumb } from "./card-swatch-thumb";

const shown = 5;

/** True when the card has at least one option photo to show; otherwise the card keeps its "N options" link. */
export const hasOptionPhotos = (product: ProductCardModel) => (product.optionThumbs ?? []).some((thumb) => thumb.image !== null);

/** Small round photos of the product's options, each linking to that option on the product page. Server-rendered. */
export function CardOptionThumbs({ product }: { product: ProductCardModel }) {
  const base = "/products/" + product.handle;
  const thumbs = product.optionThumbs ?? [];
  const more = thumbs.length - shown;
  return (
    <ul data-card-option-thumbs aria-label={`Options for ${product.title}`} className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
      {thumbs.slice(0, shown).map((thumb) => {
        const href = thumb.slug ? `${base}?variant=${encodeURIComponent(thumb.slug)}` : base;
        return thumb.image ? (
          <li key={thumb.name} data-card-option-thumb>
            <Link href={href} aria-label={thumb.name} title={thumb.name} className="relative block size-7 overflow-hidden rounded-full border border-sand bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              <Image src={thumb.image} alt="" width={28} height={28} sizes="28px" className="size-full object-cover" />
            </Link>
          </li>
        ) : <CardSwatchThumb key={thumb.name} name={thumb.name} href={href} />;
      })}
      {more > 0 ? <li data-card-options-more aria-label={`${more} more options`} className="text-meta font-semibold text-taupe">+{more}</li> : null}
    </ul>
  );
}
