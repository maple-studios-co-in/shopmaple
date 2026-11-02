import Link from "next/link";
import { Fragment } from "react";
import { shopMoney } from "@/lib/format";
import type { BundlePiece } from "@/lib/product-page-data";
import { ProductImage } from "./product-image";

export type ShownBundle = { id: string; name: string; description: string | null; pieces: BundlePiece[]; totalPaise: number | null };

const piecePrice = (piece: BundlePiece) => (piece.pricePaise === null ? "Price on request" : shopMoney(piece.pricePaise));

/**
 * "Complete the look" in the buy box: the other pieces of the product's first Keeri bundle. Each piece links to its own
 * page, where the buyer chooses a finish; nothing is added to the cart from here.
 */
export function CompleteTheLook({ bundle }: { bundle: ShownBundle }) {
  const others = bundle.pieces.filter((p) => !p.current);
  if (!others.length) return null;
  return (
    <div data-complete-look className="grid gap-3">
      <h2 className="m-0 text-[20px] leading-[1.2] font-medium text-[#1c1c1c]">Complete the look</h2>
      <ul className="m-0 grid list-none gap-3 p-0">
        {others.map((piece) => (
          <li key={piece.handle} data-look-piece className="flex items-center gap-3 rounded-[10px] border border-solid border-maple/8 p-3">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-[6px] bg-[#f7f5f2]">
              {piece.image && <ProductImage src={piece.image} alt="" fill sizes="64px" className="object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-[14px] leading-[1.4] font-medium text-[#1c1c1c]">{piece.title}</p>
              <p className="m-0 text-[13px] leading-[1.4] text-[#5e574f]">{piecePrice(piece)}{piece.quantity > 1 ? ` · ×${piece.quantity}` : ""}</p>
            </div>
            <Link href={`/products/${piece.handle}`} className="inline-flex h-9 shrink-0 items-center rounded-[30px] bg-maple/8 px-4 text-[13px] font-medium text-maple no-underline hover:bg-maple/14 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple">
              View<span className="sr-only"> {piece.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * "Buy in Bundle" (frame 2:371): each piece with its quantity and price, then the selection's total. Keeri gives no
 * bundle discount, so the total is the sum of the pieces and appears only when every piece has a single price.
 */
export function ProductBundles({ bundles, enquiryHref }: { bundles: ShownBundle[]; enquiryHref: string }) {
  if (!bundles.length) return null;
  return (
    <section data-store data-bundles aria-labelledby="product-bundles-title" className="bg-white px-4 py-12 font-product text-black md:px-12 md:py-[88px]">
      <h2 id="product-bundles-title" className="m-0 text-[36px] leading-[1.2] font-medium text-maple md:text-[48px]">Buy in Bundle</h2>
      <p className="m-0 mt-3 text-[16px] leading-[1.6] text-[#5e574f]">Thoughtfully paired. Beautifully together.</p>
      {bundles.map((bundle) => (
        <div key={bundle.id} data-bundle className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-stretch">
          <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
            {bundle.pieces.map((piece, i) => (
              <Fragment key={piece.handle}>
                <li data-bundle-piece className="relative flex flex-col gap-3 rounded-[10px] bg-[#f7f5f2] p-4">
                  {i > 0 && <span aria-hidden="true" className="absolute top-1/2 -left-3 hidden -translate-y-1/2 text-[22px] text-maple sm:block">+</span>}
                  <div className="relative aspect-square overflow-hidden rounded-[6px] bg-white">
                    {piece.image && <ProductImage src={piece.image} alt="" fill sizes="(min-width: 1024px) 240px, 45vw" className="object-cover" />}
                  </div>
                  {piece.current
                    ? <p className="m-0 text-[16px] leading-[1.4] font-medium text-[#1c1c1c]">{piece.title}</p>
                    : <Link href={`/products/${piece.handle}`} className="text-[16px] leading-[1.4] font-medium text-[#1c1c1c] no-underline hover:text-maple">{piece.title}</Link>}
                  <p className="m-0 mt-auto text-[13px] leading-[1.4] text-[#5e574f]">{piece.current ? "This piece" : "Paired piece"} · Quantity {piece.quantity}</p>
                  <p className="m-0 text-[16px] leading-[1.2] font-medium text-maple">{piecePrice(piece)}</p>
                </li>
              </Fragment>
            ))}
          </ul>
          <div data-bundle-summary className="flex flex-col gap-3 rounded-[10px] bg-[#f7f5f2] p-6">
            <h3 className="m-0 text-[22px] leading-[1.2] font-medium text-maple">{bundle.name}</h3>
            {bundle.description && <p className="m-0 text-[14px] leading-[1.6] text-[#5e574f]">{bundle.description}</p>}
            <p className="m-0 text-[13px] text-[#5e574f]">{bundle.pieces.reduce((n, p) => n + p.quantity, 0)} pieces</p>
            {bundle.totalPaise !== null && (
              <div>
                <p className="m-0 text-[13px] text-[#5e574f]">Bundle total</p>
                <p data-bundle-total className="m-0 text-[28px] leading-[1.2] font-medium text-maple">{shopMoney(bundle.totalPaise)}</p>
              </div>
            )}
            <ul className="m-0 list-none p-0 text-[13px] leading-[1.6] text-[#5e574f]">
              {bundle.pieces.map((p) => <li key={p.handle}>{p.quantity} {p.title}</li>)}
            </ul>
            <Link data-bundle-enquire href={enquiryHref} className="mt-auto inline-flex h-[50px] items-center justify-center rounded-[30px] bg-maple px-6 text-[14px] font-medium text-white no-underline hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple">
              Enquire about this set
            </Link>
            <p className="m-0 text-[12px] text-[#5e574f]">Each piece is priced and confirmed on its own; finishes and delivery are agreed before you order.</p>
          </div>
        </div>
      ))}
    </section>
  );
}
