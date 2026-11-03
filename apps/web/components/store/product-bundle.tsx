"use client";
import { useState } from "react";
import Link from "next/link";
import type { Product, Variant } from "@shopmaple/contracts";
import { canAddToCart } from "@/lib/product-availability";
import { shopMoney } from "@/lib/format";
import { useShop } from "../shop-provider";
import { ProductImage } from "./product-image";

type Piece = { product: Product; variant: Variant & { pricePaise: number }; current: boolean };
const priced = (variant: Variant | undefined): variant is Variant & { pricePaise: number } => Boolean(variant && variant.pricePaise !== null && canAddToCart(variant));

/**
 * Frame 100:476 ("Buy in Bundle"): the piece with two it is styled with, each at its own price, totalled and added to
 * the cart together. A pairing without a price is left out, and with no priced pairing the section is not shown.
 * A piece that cannot go in the cart makes the bundle an enquiry instead.
 */
export function ProductBundle({ product, variant, paired }: { product: Product; variant: Variant | undefined; paired: Product[] }) {
  const { cart, setQuantity, setCartOpen, busy } = useShop();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const pieces: Piece[] = [];
  if (priced(variant)) pieces.push({ product, variant, current: true });
  for (const other of paired) {
    const option = other.variants.find(priced);
    if (pieces.length && option) pieces.push({ product: other, variant: option, current: false });
  }
  if (pieces.length < 2) return null;
  const total = pieces.reduce((sum, piece) => sum + piece.variant.pricePaise, 0);
  const cartable = product.published && pieces.every((piece) => piece.product.published);
  const names = pieces.map((piece) => piece.product.title);
  async function addBundle() {
    setError("");
    setAdding(true);
    for (const piece of pieces) {
      const held = cart.items.find((item) => item.variantId === piece.variant.id)?.quantity ?? 0;
      if (!(await setQuantity(piece.variant.id, Math.min(20, held + 1)))) {
        setAdding(false);
        setError("We couldn’t add every piece. Please try again.");
        return;
      }
    }
    setAdding(false);
    setCartOpen(true);
  }
  return (
    <section data-store data-bundle aria-labelledby="product-bundle-title" className="bg-white px-4 py-12 font-product md:px-12 md:py-16">
      <div className="mx-auto flex max-w-[1336px] flex-col gap-7">
        <div className="flex flex-col gap-2.5">
          <h2 id="product-bundle-title" className="m-0 text-[34px] leading-[1.35] font-semibold text-maple md:text-[48px]">Buy in Bundle</h2>
          <p data-bundle-lede className="m-0 text-[16px] leading-[1.35] text-[#756d68] md:text-[18px]">Thoughtfully paired. Beautifully together.</p>
        </div>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <ol className="m-0 flex list-none snap-x items-center gap-3 overflow-x-auto p-0 pb-1 [scrollbar-width:none] md:gap-4 [&::-webkit-scrollbar]:hidden">
            {pieces.map((piece, i) => {
              const photo = piece.variant.images?.[0] ?? piece.product.images[0];
              return (
                <li key={piece.product.id} className="flex shrink-0 snap-start items-center gap-3 md:gap-4">
                  {i > 0 && <span data-bundle-plus aria-hidden="true" className="w-6 text-center text-[30px] leading-[1.35] text-maple">+</span>}
                  <article data-bundle-piece className="flex w-[240px] flex-col gap-3 rounded-[12px] bg-[#f9f7f3] p-4 md:w-[280px]">
                    <Link href={`/products/${piece.product.handle}`} className="relative block aspect-[248/242] overflow-hidden rounded-[8px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple [&_img]:object-contain">
                      <ProductImage src={photo} alt={piece.product.title} fill sizes="(max-width:767px) 208px, 248px" />
                    </Link>
                    <h3 className="m-0 line-clamp-2 min-h-[2.7em] text-[18px] leading-[1.35] font-medium text-[#1c1c1c] md:text-[20px]">{piece.product.title}</h3>
                    <p data-bundle-role className="m-0 text-[13px] leading-[1.35] text-[#756d68]">{piece.current ? "Current product" : "Paired product"} · Quantity 1</p>
                    <p data-bundle-price className="m-0 text-[18px] leading-[1.35] font-medium text-maple">{shopMoney(piece.variant.pricePaise)}</p>
                  </article>
                </li>
              );
            })}
          </ol>
          <aside data-bundle-summary aria-label="Your paired selection" className="flex flex-col gap-5 rounded-[12px] bg-[#f9f7f3] p-6 md:p-8 xl:w-[368px] xl:shrink-0">
            <h3 className="m-0 text-[24px] leading-[1.35] font-medium text-maple">Your paired selection</h3>
            <p data-bundle-count className="m-0 text-[15px] leading-[1.35] text-[#756d68]">{pieces.length} pieces · 1 considered space</p>
            <div className="flex flex-col gap-1.5">
              <p className="m-0 text-[14px] leading-[1.35] text-[#756d68]">Bundle total</p>
              <p data-bundle-total className="m-0 text-[30px] leading-[1.35] font-semibold text-maple">{shopMoney(total)}</p>
            </div>
            <ul className="m-0 list-none p-0 text-[14px] leading-[1.35] text-[#756d68]">
              {names.map((name) => <li key={name}>1 {name}</li>)}
            </ul>
            {cartable ? (
              <button type="button" data-bundle-add data-fill-button="" disabled={adding || busy} onClick={() => void addBundle()}
                className="w-full cursor-pointer rounded-[30px] border-0 bg-maple p-4 text-[16px] leading-[1.35] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple">
                {adding ? "Adding to cart…" : "Add bundle to cart"}
              </button>
            ) : (
              <Link data-bundle-enquire data-fill-button="" href={"/pages/contact?" + new URLSearchParams({ product: names.join(" + ") })}
                className="w-full rounded-[30px] bg-maple p-4 text-center text-[16px] leading-[1.35] font-semibold text-white no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple">
                Enquire about this bundle
              </Link>
            )}
            {error && <p role="alert" className="m-0 text-[13px] text-maple">{error}</p>}
            <p className="m-0 text-[12px] leading-[1.35] text-[#756d68]">
              {cart.checkoutEnabled ? "Review finishes and delivery at checkout." : "We confirm finishes and delivery with you before you order."}
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
