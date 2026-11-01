import type { ProductCardModel } from "@/lib/product-card-model";
import { categoryNames } from "@/lib/format";
import { ProductCard } from "./product-card";
import { SectionHeading } from "./section-heading";

/** Up to four cards from the same category under the product page ("More chairs to explore"). */
export function RelatedProducts({ products, category }: { products: ProductCardModel[]; category?: string | null }) {
  if (!products.length) return null;
  const name = category && categoryNames[category] ? categoryNames[category].toLowerCase() : "pieces";
  return (
    <section data-store data-related aria-labelledby="related-title" className="bg-linen font-body text-espresso">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 pb-12 md:px-8 xl:px-16 xl:pb-16">
        <SectionHeading eyebrow="You may also like" title={`More ${name} to explore`} id="related-title" />
        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} imageSizes="(max-width:1023px) calc((100vw - 44px) / 2), (min-width:1440px) 316px, calc((100vw - 176px) / 4)" />
          ))}
        </div>
      </div>
    </section>
  );
}
