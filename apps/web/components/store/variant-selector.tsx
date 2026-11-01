import { Check } from "lucide-react";
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
};

/**
 * The product page's finishes (frame 999:3's "Fabric Color: Black"): a label naming the chosen finish above a
 * row of photo tiles. `photo` options show the option's own photo (a tile without one shows its name);
 * `swatch` options show a staff-entered colour as a circle with the name below; `text` options have
 * neither and show the name alone.
 */
export function VariantSelector({ variants, selectedId, onSelect, layout = "photo" }: {
  variants: SelectorVariant[];
  selectedId: string;
  onSelect: (id: string) => void;
  layout?: "photo" | "swatch" | "text";
}) {
  const chosen = variants.find((variant) => variant.id === selectedId);
  // Finishes that share a name (the same finish from two catalogue sources) are told apart by position, never by item code:
  // "Desert Taupe (option 1 of 2)". The visible caption and the legend keep the plain name.
  const named = (variant: SelectorVariant) => {
    const same = variants.filter((other) => other.name === variant.name);
    return same.length > 1 ? `${variant.name} (option ${same.indexOf(variant) + 1} of ${same.length})` : variant.name;
  };
  return (
    <fieldset data-variants={layout} className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-4 max-w-[calc(100%-10rem)] p-0 text-[14px] leading-[1.6] text-black">Finish: <span className="font-semibold">{chosen?.name}</span></legend>
      <div className={cx("flex flex-wrap", layout === "photo" ? "gap-3" : "gap-x-3 gap-y-4")}>
        {variants.map((variant) => {
          const selected = variant.id === selectedId;
          return (
            <label key={variant.id} title={named(variant)} data-selected={selected}
              className={cx("group/option relative flex cursor-pointer text-meta text-espresso has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-maple",
                layout === "photo" && "w-[calc((100%-24px)/3)] max-w-[122px] flex-col items-start gap-1.5",
                layout === "swatch" && "w-[100px] flex-col items-start gap-2 sm:w-[130px]",
                layout === "text" && cx("flex-col items-start gap-2 rounded-[6px] border border-solid px-3.5 py-2.5", selected ? "border-espresso" : "border-sand hover:border-taupe"))}>
              <input type="radio" name="variant" value={variant.id} checked={selected} onChange={() => onSelect(variant.id)} className="sr-only" />
              {layout === "photo" && (
                <span aria-hidden="true"
                  className={cx("relative block aspect-[122/83] w-full overflow-hidden rounded-[7px] bg-cream shadow-[0_0_0_1px_rgb(86_60_73/0.2)] transition-shadow motion-reduce:transition-none [&_img]:object-cover",
                    selected && "shadow-[0_0_0_3px_var(--color-maple)]")}>
                  {variant.image
                    ? <span data-variant-image className="absolute inset-0"><ProductImage src={variant.image} alt="" fill sizes="122px" /></span>
                    : variant.swatch
                      ? <span data-variant-swatch className="absolute inset-0" style={{ backgroundColor: variant.swatch }} />
                      : <span data-variant-placeholder className="absolute inset-0 grid place-items-center p-1 text-center text-label">{variant.name}</span>}
                  {selected && <span data-selected-mark className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-maple text-white"><Check aria-hidden="true" className="size-3" strokeWidth={3} /></span>}
                </span>
              )}
              {layout === "swatch" && (
                <span aria-hidden="true"
                  className={cx("relative block size-[34px] shrink-0 overflow-hidden rounded-full bg-cream shadow-[0_0_0_1px_rgb(41_37_31/0.12)] transition-shadow",
                    selected ? "outline-2 outline-offset-2 outline-[#563c49] outline-solid" : "group-hover/option:outline-1 group-hover/option:outline-offset-2 group-hover/option:outline-sand group-hover/option:outline-solid")}>
                  {variant.swatch
                    ? <span data-variant-swatch className="absolute inset-0" style={{ backgroundColor: variant.swatch }} />
                    : <span data-variant-placeholder className="absolute inset-0" />}
                </span>
              )}
              <span className={cx(layout === "photo" ? "sr-only" : "grid gap-0.5", selected && "font-semibold")}>{layout === "photo" ? named(variant) : variant.name}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
