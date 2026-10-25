"use client";
import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { useShop } from "./shop-provider";
import { Modal } from "./modal";
import { money } from "@/lib/format";
export function CartContents() {
  const { cart, busy, error, setQuantity, setCartOpen } = useShop();
  if (!cart.items.length)
    return (
      <div className="empty-state">
        <ShoppingBag size={38} />
        <h2>Your cart is empty</h2>
        <p>Find a piece that feels like home.</p>
        {error && <p role="alert">{error}</p>}
        <Link
          href="/collections/all"
          className="button"
          onClick={() => setCartOpen(false)}
        >
          Explore furniture
        </Link>
      </div>
    );
  return (
    <>
      <div className="cart-lines">
        {cart.items.map((item) => (
          <article key={item.variantId} className="cart-line">
            <Link
              href={"/products/" + item.handle}
              onClick={() => setCartOpen(false)}
              className="cart-image"
            >
              <Image src={item.image} alt={item.title} fill sizes="100px" />
            </Link>
            <div>
              <Link
                href={"/products/" + item.handle}
                onClick={() => setCartOpen(false)}
              >
                {item.title}
              </Link>
              <p className="muted">{item.variantTitle}</p>
              <p>{money(item.pricePaise)}</p>
              {!item.available && (
                <p className="error-text">
                  Currently unavailable. Please remove this item or contact us.
                </p>
              )}
              <div className="quantity-row">
                <div className="quantity-control">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void setQuantity(item.variantId, item.quantity - 1)
                    }
                    aria-label={"Decrease quantity of " + item.title}
                  >
                    <Minus size={14} />
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    disabled={busy || item.quantity >= 20 || !item.available}
                    onClick={() =>
                      void setQuantity(item.variantId, item.quantity + 1)
                    }
                    aria-label={"Increase quantity of " + item.title}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <button
                  className="icon-button"
                  disabled={busy}
                  onClick={() => void setQuantity(item.variantId, 0)}
                  aria-label={"Remove " + item.title}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
            <strong>{money(item.lineTotalPaise)}</strong>
          </article>
        ))}
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="cart-summary">
        <div>
          <span>Subtotal</span>
          <strong>{money(cart.subtotalPaise)}</strong>
        </div>
        <p>Shipping and availability will be confirmed before payment.</p>
        <Link
          className="button full-width"
          href="/checkout"
          onClick={() => setCartOpen(false)}
        >
          Continue to checkout
        </Link>
        <p className="preview-disclosure">
          Preview only. Online payment is not available yet.
        </p>
      </div>
    </>
  );
}
export function CartDrawer() {
  const { cartOpen, setCartOpen, cart } = useShop();
  return (
    <Modal
      drawer
      open={cartOpen}
      onClose={() => setCartOpen(false)}
      title={"Your cart (" + cart.itemCount + ")"}
    >
      <CartContents />
    </Modal>
  );
}
