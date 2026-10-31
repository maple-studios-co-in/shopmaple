import Link from "next/link";
import { PencilRuler } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProductImage } from "../product-image";

/**
 * What a variant tile needs. The product page builds these from the catalogue; `slug` is for the
 * variant's URL and `image` for its own photo, both optional so today's data and richer data fit.
 */
export type SelectorVariant = {
  id: string;
  name: string;
  slug?: string;
  image?: string;
  priceLabel: string;
  /** Shown only when two variants share a name, so shoppers can tell them apart. */
  code?: string;
};

/** The product page's option tiles: photo tiles, or plain text tiles when the product has no per-option photos. */
export function VariantSelector({ variants, selectedId, onSelect, enquiryHref, layout = "photo" }: {
  variants: SelectorVariant[];
  selectedId: string;
  onSelect: (id: string) => void;
  enquiryHref: string;
  layout?: "photo" | "text";
}) {
  const selected = variants.find((variant) => variant.id === selectedId);
  return (
    <fieldset data-variants={layout} className="grid gap-3">
      <legend className="mb-3 flex w-full flex-wrap items-center justify-between gap-2 text-ui">
        <span>Option: <strong className="font-semibold">{selected?.name}</strong></span>
        <Link data-customization href={enquiryHref} className="inline-flex items-center gap-1 text-label font-medium text-brand no-underline hover:underline">
          <PencilRuler aria-hidden="true" className="size-3.5" /> Customization available
        </Link>
      </legend>
      <div className={cn("grid gap-3", layout === "text" ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-3")}>
        {variants.map((variant) => (
          <label key={variant.id}
            className={cn("relative grid cursor-pointer content-start gap-1 rounded-[7px] p-2 text-label text-espresso shadow-[0_0_0_2px] transition-shadow has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
              variant.id === selectedId ? "shadow-espresso" : "shadow-espresso/12 hover:shadow-espresso/40")}>
            <input type="radio" name="variant" value={variant.id} checked={variant.id === selectedId} onChange={() => onSelect(variant.id)} className="sr-only" />
            {layout === "photo" && (
              <span data-variant-image className="relative block aspect-[11/10] overflow-hidden rounded-[5px] bg-cream [&_img]:object-cover">
                {variant.image ? <ProductImage src={variant.image} alt="" fill sizes="130px" />
                  : <span data-variant-placeholder className="grid size-full place-items-center p-1 text-center text-label text-taupe">Photo unavailable</span>}
              </span>
            )}
            <span className="font-semibold">{variant.name}</span>
            {variant.code && <small data-variant-code className="text-label text-taupe">Item code: {variant.code}</small>}
            <small className="text-label text-taupe">{variant.priceLabel}</small>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
