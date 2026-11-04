"use client";
import { useState } from "react";
import Link from "next/link";
import type { Product, Variant } from "@shopmaple/contracts";
import { canAddToCart } from "@/lib/product-availability";
import { shopMoney } from "@/lib/format";
import { useShop } from "../shop-provider";
import { ProductImage } from "./product-image";

type Piece = { product: Product; variant: Variant | undefined; price: number | null; current: boolean; quantity: number };
const priced = (variant: Variant | undefined): variant is Variant & { pricePaise: number } => Boolean(variant && variant.pricePaise !== null && canAddToCart(variant));
// A paired piece shows the option it can be bought in, else one with a price, else its first.
const optionOf = (product: Product) => product.variants.find(priced) ?? product.variants.find((option) => option.pricePaise !== null) ?? product.variants[0];

/**
 * Frame 100:476 ("Buy in Bundle"): the piece with those it is styled with, each at its own price, totalled and added to
 * the cart together. Every product has one (owner, 4 Nov 2026): a piece without an online price says "Price on
 * request", the total shows only when every piece has a price, and a bundle with a piece that cannot go in the cart is
 * an enquiry instead. `quantities` (by handle) comes from a Keeri bundle staff built, such as four chairs with one
 * table; without one each piece counts once. There is no discount.
 */
export function ProductBundle({ product, variant, paired, quantities }: { product: Product; variant: Variant | undefined; paired: Product[]; quantities?: Record<string, number> }) {
  const { cart, setQuantity, setCartOpen, busy } = useShop();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const pieces: Piece[] = [];
  const count = (handle: string) => Math.max(1, Math.min(20, quantities?.[handle] ?? 1));
  pieces.push({ product, variant, price: variant?.pricePaise ?? null, current: true, quantity: count(product.handle) });
  for (const other of paired) {
    const option = optionOf(other);
    pieces.push({ product: other, variant: option, price: option?.pricePaise ?? null, current: false, quantity: count(other.handle) });
  }
  if (pieces.length < 2) return null;
  const total = pieces.every((piece) => piece.price !== null) ? pieces.reduce((sum, piece) => sum + piece.price! * piece.quantity, 0) : null;
  const cartable = product.published && pieces.every((piece) => piece.product.published && priced(piece.variant));
  const names = pieces.map((piece) => `${piece.quantity} ${piece.product.title}`);
  async function addBundle() {
    setError("");
    setAdding(true);
    for (const piece of pieces) {
      const held = cart.items.find((item) => item.variantId === piece.variant!.id)?.quantity ?? 0;
      if (!(await setQuantity(piece.variant!.id, Math.min(20, held + piece.quantity)))) {
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
      <div className="mx-auto flex max-w-[1336px] flex-col gap-7 wide:max-w-none">
        <div className="flex flex-col gap-2.5">
          <h2 id="product-bundle-title" className="m-0 text-[34px] leading-[1.35] font-semibold text-maple md:text-[48px]">Buy in Bundle</h2>
          <p data-bundle-lede className="m-0 text-[16px] leading-[1.35] text-[#756d68] md:text-[18px]">Thoughtfully paired. Beautifully together.</p>
        </div>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <ol className="m-0 flex list-none snap-x items-center gap-3 overflow-x-auto p-0 pb-1 [scrollbar-width:none] md:gap-4 [&::-webkit-scrollbar]:hidden">
            {pieces.map((piece, i) => {
              const photo = piece.variant?.images?.[0] ?? piece.product.images[0];
              return (
                <li key={piece.product.id} className="flex shrink-0 snap-start items-center gap-3 md:gap-4">
                  {i > 0 && <span data-bundle-plus aria-hidden="true" className="w-6 text-center text-[30px] leading-[1.35] text-maple">+</span>}
                  <article data-bundle-piece className="flex w-[240px] flex-col gap-3 rounded-[12px] bg-[#f9f7f3] p-4 md:w-[280px] wide:w-[15vw]">
                    <Link href={`/products/${piece.product.handle}`} className="relative block aspect-[248/242] overflow-hidden rounded-[8px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple [&_img]:object-contain">
                      <ProductImage src={photo} alt={piece.product.title} fill sizes="(max-width:767px) 208px, (min-width:1600px) 15vw, 248px" />
                    </Link>
                    <h3 className="m-0 line-clamp-2 min-h-[2.7em] text-[18px] leading-[1.35] font-medium text-[#1c1c1c] md:text-[20px]">{piece.product.title}</h3>
                    <p data-bundle-role className="m-0 text-[13px] leading-[1.35] text-[#756d68]">{piece.current ? "Current product" : "Paired product"} · Quantity {piece.quantity}</p>
                    <p data-bundle-price className="m-0 text-[18px] leading-[1.35] font-medium text-maple">{piece.price !== null ? shopMoney(piece.price) : "Price on request"}</p>
                  </article>
                </li>
              );
            })}
          </ol>
          <aside data-bundle-summary aria-label="Your paired selection" className="flex flex-col gap-5 rounded-[12px] bg-[#f9f7f3] p-6 md:p-8 xl:w-[368px] xl:shrink-0 wide:w-[22vw]">
            <h3 className="m-0 text-[24px] leading-[1.35] font-medium text-maple">Your paired selection</h3>
            <p data-bundle-count className="m-0 text-[15px] leading-[1.35] text-[#756d68]">{pieces.reduce((n, piece) => n + piece.quantity, 0)} pieces · 1 considered space</p>
            <div className="flex flex-col gap-1.5">
              <p className="m-0 text-[14px] leading-[1.35] text-[#756d68]">Bundle total</p>
              <p data-bundle-total className="m-0 text-[30px] leading-[1.35] font-semibold text-maple">{total !== null ? shopMoney(total) : "Price on request"}</p>
            </div>
            <ul className="m-0 list-none p-0 text-[14px] leading-[1.35] text-[#756d68]">
              {names.map((name) => <li key={name}>{name}</li>)}
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
