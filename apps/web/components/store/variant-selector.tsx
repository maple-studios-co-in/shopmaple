import { cx } from "@/lib/cx";
import { ProductImage } from "./product-image";

/**
 * What a variant tile needs. The product page builds these from the catalogue; `slug` is for the
 * variant's URL, `image` for its own photo and `swatch` for a staff-entered colour, all optional so
 * today's data and richer data fit.
 */
export type SelectorVariant = {
  id: string;
  name: string;
  slug?: string;
  image?: string;
  swatch?: string;
  /** Shown only when two variants share a name, so shoppers can tell them apart. */
  code?: string;
};

/**
 * The product page's finishes ("Personalise your finish" in "Maple / PDF Review / Product Detail"):
 * a 34 px circle and the name per option. `photo` circles show the option's photo (or its colour);
 * `swatch` circles show staff-entered colours; `text` options have neither and show the name alone.
 */
export function VariantSelector({ variants, selectedId, onSelect, layout = "photo" }: {
  variants: SelectorVariant[];
  selectedId: string;
  onSelect: (id: string) => void;
  layout?: "photo" | "swatch" | "text";
}) {
  return (
    <fieldset data-variants={layout} className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-5 p-0 text-[18px] leading-[1.45] font-bold text-espresso">Personalise your finish</legend>
      <div className="flex flex-wrap gap-x-3 gap-y-4">
        {variants.map((variant) => {
          const selected = variant.id === selectedId;
          return (
            <label key={variant.id}
              className={cx("group/option relative flex cursor-pointer flex-col items-start gap-2 text-meta text-espresso has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-brand",
                layout === "text" ? "rounded-[6px] border border-solid px-3.5 py-2.5" : "w-[100px] sm:w-[130px]",
                layout === "text" && (selected ? "border-espresso" : "border-sand hover:border-taupe"))}>
              <input type="radio" name="variant" value={variant.id} checked={selected} onChange={() => onSelect(variant.id)} className="sr-only" />
              {layout !== "text" && (
                <span aria-hidden="true"
                  className={cx("relative block size-[34px] shrink-0 overflow-hidden rounded-full bg-cream shadow-[0_0_0_1px_rgb(41_37_31/0.12)] transition-shadow [&_img]:object-cover",
                    selected ? "outline-2 outline-offset-2 outline-espresso outline-solid" : "group-hover/option:outline-1 group-hover/option:outline-offset-2 group-hover/option:outline-sand group-hover/option:outline-solid")}>
                  {layout === "photo" && variant.image
                    ? <span data-variant-image className="absolute inset-0"><ProductImage src={variant.image} alt="" fill sizes="34px" /></span>
                    : variant.swatch
                      ? <span data-variant-swatch className="absolute inset-0" style={{ backgroundColor: variant.swatch }} />
                      : <span data-variant-placeholder className="absolute inset-0" />}
                </span>
              )}
              <span className={cx("grid gap-0.5", selected && "font-semibold")}>
                {variant.name}
                {variant.code && <small data-variant-code className="text-label font-normal text-taupe">Item code: {variant.code}</small>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
