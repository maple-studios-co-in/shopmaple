import type { ProductCardModel } from "@/lib/product-card-model";
import { ProductCard } from "./product-card";

/** "You may also like" under the product page: up to four cards from the same category. */
export function RelatedProducts({ products }: { products: ProductCardModel[] }) {
  if (!products.length) return null;
  return (
    <section data-store data-related aria-labelledby="related-title" className="bg-white font-body text-espresso">
      <div className="mx-auto grid max-w-[1432px] gap-6 px-4 py-12 md:px-8 lg:py-16 xl:px-12">
        <h2 id="related-title" className="font-serif text-h2 font-bold text-brand md:text-h1">You may also like</h2>
        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} imageSizes="(max-width:1023px) calc((100vw - 44px) / 2), (min-width:1432px) 323px, calc((100vw - 144px) / 4)" />
          ))}
        </div>
      </div>
    </section>
  );
}
