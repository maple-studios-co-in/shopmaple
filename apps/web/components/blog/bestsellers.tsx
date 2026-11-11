import Link from "next/link";
import { ContentImage } from "@/components/content-image";
import { ProductCard } from "@/components/store/product-card-figma";
import { getProductCards } from "@/lib/catalog";
import { BlogProductRail } from "./product-rail";
import type { TemplateMedia } from "@shopmaple/contracts";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";

/** Cards for the given handles; one broken card never takes its healthy neighbours down with it. */
export async function blogProductCards(handles: readonly string[]) {
  return getProductCards([...handles]).catch(async () =>
    (await Promise.all(handles.map((handle) => getProductCards([handle]).catch(() => [])))).flat());
}

/**
 * Shop Bestsellers under the listing (Figma 268:4368): a Maple picture tile (staff choose its photo) leading to the bestsellers, then the
 * homepage's bestseller cards in a row that swipes, with a dot for each place the row can start from.
 */
export async function BlogBestsellers({ handles, media }: { handles: string[]; media?: TemplateMedia }) {
  const products = await blogProductCards(handles);
  // The tile's photo is template artwork (blog-bestsellers-promo); the link's own name speaks for it.
  const promo = resolveTemplateMedia("blog-bestsellers-promo", media);
  return (
    <section data-blog-bestsellers className="blog-bestsellers" aria-labelledby="blog-bestsellers-title">
      <h2 id="blog-bestsellers-title" className="blog-section-title">Shop Bestsellers</h2>
      <div className="blog-bestsellers-row">
        <Link data-bestsellers-promo href="/collections/bestsellers" className="blog-bestsellers-promo" aria-label="Maple bestsellers">
          <ContentImage src={promo.image} alt={promo.alt} fill sizes="(max-width: 749px) calc(100vw - 32px), 266px" />
          <span>Maple</span>
        </Link>
        {products.length ? (
          <BlogProductRail label="Bestsellers">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} surface="plain" imageSizes="(max-width: 749px) 64vw, (max-width: 1279px) 30vw, 266px" />
            ))}
          </BlogProductRail>
        ) : (
          <p className="blog-rail-unavailable">
            Bestsellers are unavailable for a moment. <Link href="/collections/all">Browse all furniture</Link>
          </p>
        )}
      </div>
    </section>
  );
}
