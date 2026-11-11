import Link from "next/link";
import { Suspense } from "react";
import { ContentImage } from "@/components/content-image";
import { ProductImage } from "@/components/store/product-image";
import { blogCollectionTiles, tileName } from "@/lib/blog";
import { blogProductCards } from "./bestsellers";
import type { TemplateMedia } from "@shopmaple/contracts";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";

/**
 * "Explore our collections" under the article (Figma 268:4925): a Maple room photo beside the invitation, Shop Now,
 * and the design's four pieces as tiles. The tiles come from the catalogue; when it cannot be read they are left out
 * and Shop Now still leads to the whole collection.
 */
export function BlogCollections({ media }: { media?: TemplateMedia } = {}) {
  // The room photo is template artwork (blog-collections-photo).
  const photo = resolveTemplateMedia("blog-collections-photo", media);
  return (
    <section data-blog-collections className="blog-collections" aria-labelledby="blog-collections-title">
      <div className="blog-collections-photo">
        <ContentImage data-collections-photo src={photo.image} alt={photo.alt} fill sizes="(max-width: 899px) calc(100vw - 32px), 50vw" />
      </div>
      <div className="blog-collections-copy">
        <p data-collections-eyebrow className="blog-collections-eyebrow">Maple Furnishers</p>
        <h2 id="blog-collections-title">Explore our collections</h2>
        <p data-collections-lede className="blog-collections-lede">Furniture designed around your space, materials and finishes.</p>
        <Link data-collections-shop href="/collections/all" className="blog-button">Shop Now</Link>
        <Suspense fallback={<div className="blog-collection-tiles" aria-hidden="true" />}>
          <CollectionTiles />
        </Suspense>
      </div>
    </section>
  );
}

async function CollectionTiles() {
  const cards = await blogProductCards(blogCollectionTiles);
  if (!cards.length) return null;
  return (
    <ul className="blog-collection-tiles">
      {cards.map((card) => (
        <li key={card.handle}>
          <Link data-collection-tile href={`/products/${card.handle}`} className="blog-collection-tile">
            <span className="blog-collection-tile-photo">
              <ProductImage src={card.image} alt="" fill sizes="135px" className="object-cover" />
            </span>
            <span data-tile-name>{tileName(card.title)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
