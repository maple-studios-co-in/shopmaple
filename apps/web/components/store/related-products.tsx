import type { ProductCardModel } from "@/lib/product-card-model";
import { ProductCard } from "./product-card-figma";

/** Up to four cards from the same category under the reviews ("You may also like" in frame 999:3). */
export function RelatedProducts({ products }: { products: ProductCardModel[] }) {
  if (!products.length) return null;
  return (
    <section data-store data-related aria-labelledby="related-title" className="bg-linen font-manrope text-espresso">
      <div className="mx-auto flex max-w-[1432px] flex-col gap-10 px-4 pt-14 pb-14 md:px-12 md:pt-[85px] md:pb-[90px]">
        <h2 id="related-title" className="m-0 text-[36px] leading-[1.1] font-medium text-maple md:text-[48px]">You may also like</h2>
        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4 lg:gap-7">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} surface="plain" imageSizes="(max-width:1023px) calc((100vw - 44px) / 2), (min-width:1440px) 316px, calc((100vw - 176px) / 4)" />
          ))}
        </div>
      </div>
    </section>
  );
}
