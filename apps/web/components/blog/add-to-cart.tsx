"use client";
import { useState } from "react";
import Link from "next/link";
import { canAddToCart } from "@/lib/product-availability";
import { useShop } from "../shop-provider";

type CartVariant = { id: string; pricePaise: number | null; published: boolean; available: boolean };

/**
 * Add to cart for a related product (Figma 268:4908): one of the piece's option goes in the cart, which then opens; if the
 * cart cannot take it, the button says so in the store's own words (an add it cannot confirm locks the cart until the
 * cart is checked). When the cart cannot hold the piece at all (with checkout on, only what can be bought is held), it
 * links to the piece instead.
 */
export function BlogAddToCart({ title, variant, href }: { title: string; variant: CartVariant; href?: string }) {
  const { cart, setQuantity, setCartOpen, busy, error } = useShop();
  const [adding, setAdding] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!canAddToCart(variant, cart.checkoutEnabled))
    return href ? <Link data-related-view href={href} className="blog-related-button">View</Link> : null;
  async function add() {
    setFailed(false);
    setAdding(true);
    const held = cart.items.find((item) => item.variantId === variant.id)?.quantity ?? 0;
    const added = await setQuantity(variant.id, Math.min(20, held + 1));
    setAdding(false);
    if (added) setCartOpen(true);
    else setFailed(true);
  }
  return (
    <>
      <button type="button" data-add-to-cart data-variant={variant.id} className="blog-related-button" aria-label={`Add ${title} to cart`}
        disabled={busy || adding} onClick={add}>
        Add to cart
      </button>
      {failed && <p role="alert" className="blog-related-error">{error || `We couldn’t add ${title}. Please try again.`}</p>}
    </>
  );
}
