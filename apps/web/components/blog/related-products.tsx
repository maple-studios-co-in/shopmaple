import Link from "next/link";
import type { Product } from "@shopmaple/contracts";
import { ProductImage } from "@/components/store/product-image";
import { getProduct } from "@/lib/catalog";
import { shopMoney } from "@/lib/format";
import { pricedVariants } from "@/lib/product-availability";
import { BlogAddToCart } from "./add-to-cart";

/**
 * Related Products in the article's sidebar (Figma 268:4904): the design's pieces as the catalogue has them now, each
 * with its photo, name, price and Add to cart. A piece with no price links to its page; one the catalogue cannot find
 * is left out, and so is the whole list when none can be read.
 */
export async function BlogRelatedProducts({ handles }: { handles: readonly string[] }) {
  const products = (await Promise.all(handles.map((handle) => getProduct(handle).catch(() => null))))
    .filter((product): product is Product => Boolean(product?.published));
  if (!products.length) return null;
  return (
    <section data-sidebar-related className="blog-sidebar-section" aria-labelledby="blog-related-title">
      <h2 id="blog-related-title">Related Products</h2>
      <ul className="blog-sidebar-list">
        {products.map((product) => {
          const href = `/products/${product.handle}`;
          const priced = pricedVariants(product).sort((a, b) => a.pricePaise - b.pricePaise);
          const variant = priced[0];
          const from = new Set(priced.map((option) => option.pricePaise)).size > 1;
          return (
            <li key={product.handle} data-related-product className="blog-sidebar-item blog-related-item">
              <Link href={href} className="blog-sidebar-thumb" tabIndex={-1} aria-hidden="true">
                <ProductImage src={product.images[0]} alt="" fill sizes="120px" className="object-cover" />
              </Link>
              <div className="blog-sidebar-copy">
                <Link data-related-title href={href} className="blog-related-name">{product.title}</Link>
                <p data-related-price className="blog-related-price">{from ? "From " : ""}{shopMoney(variant?.pricePaise ?? null)}</p>
                {variant ? (
                  <BlogAddToCart title={product.title} href={href}
                    variant={{ id: variant.id, pricePaise: variant.pricePaise, published: product.published, available: variant.available }} />
                ) : (
                  <Link data-related-view href={href} className="blog-related-button">View</Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
