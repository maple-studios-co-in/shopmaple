"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { ProductImage } from "./product-image";
import Link from "next/link";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { useShop } from "./shop-provider";
import { Modal } from "./modal";
import { money } from "@/lib/format";
import { minimumOrderShortfalls } from "@shopmaple/contracts/minimum-order";
export function CartContents() {
  const { cart, busy, cartReady, error, setQuantity, setCartOpen, cartRecovery, checkingCart, recoverCart } = useShop();
  const region = useRef<HTMLElement>(null);
  const restoreFocus = useRef(false);
  const removalFocus = useRef<{ control: HTMLButtonElement; index: number; succeeded: boolean } | null>(null);
  const [removalCompleted, setRemovalCompleted] = useState(0);
  // Designs short of their minimum order, each said once, under its first line in the bag.
  const shortfalls = minimumOrderShortfalls(cart.items).map((short) => ({ ...short, first: cart.items.find((item) => item.handle === short.handle)!.variantId }));
  useLayoutEffect(() => {
    const moved = (event: FocusEvent) => {
      if (removalFocus.current && event.target !== removalFocus.current.control) removalFocus.current = null;
    };
    const pointedElsewhere = (event: PointerEvent) => {
      if (removalFocus.current && !removalFocus.current.control.contains(event.target as Node)) removalFocus.current = null;
    };
    const tabbedAway = (event: KeyboardEvent) => {
      if (event.key === "Tab") removalFocus.current = null;
    };
    // A pointer departure to nonfocusable content or Tab out of the document
    // need not cause focusin. Do not cancel on blur alone: disabling a pending
    // button can blur it automatically, and that still needs restoration.
    document.addEventListener("focusin", moved);
    document.addEventListener("pointerdown", pointedElsewhere, true);
    document.addEventListener("keydown", tabbedAway, true);
    return () => {
      removalFocus.current = null;
      document.removeEventListener("focusin", moved);
      document.removeEventListener("pointerdown", pointedElsewhere, true);
      document.removeEventListener("keydown", tabbedAway, true);
    };
  }, []);
  useLayoutEffect(() => {
    const removed = removalFocus.current;
    if (!removed?.succeeded) return;
    removalFocus.current = null;
    const container = region.current;
    if (!container || removed.control.isConnected || document.activeElement !== document.body) return;
    const dialog = container.closest("dialog");
    if (dialog && !dialog.open) return;
    const controls = container.querySelectorAll<HTMLButtonElement>("[data-cart-remove]");
    const next = controls[Math.min(removed.index, controls.length - 1)];
    (next ?? container.querySelector<HTMLAnchorElement>(".empty-state a") ?? container).focus();
  }, [cart, removalCompleted]);
  async function updateQuantity(id: string, quantity: number, control: HTMLButtonElement) {
    const removal = quantity === 0 && document.activeElement === control
      ? {
          control,
          index: [...(region.current?.querySelectorAll(".cart-line") ?? [])].indexOf(control.closest(".cart-line")!),
          succeeded: false,
        }
      : null;
    if (removal) removalFocus.current = removal;
    const succeeded = await setQuantity(id, quantity);
    if (!removal || removalFocus.current !== removal) return;
    if (!succeeded) { removalFocus.current = null; return; }
    removal.succeeded = true;
    setRemovalCompleted(value => value + 1);
  }
  useLayoutEffect(() => {
    if (checkingCart || cartRecovery || !restoreFocus.current) return;
    restoreFocus.current = false;
    if (document.activeElement === document.body) region.current?.focus();
  }, [cartRecovery, checkingCart]);
  const recovery = cartRecovery && (
    <button className="button" disabled={checkingCart} onClick={(event) => {
      restoreFocus.current = document.activeElement === event.currentTarget;
      void recoverCart();
    }}>
      {checkingCart ? "Checking your cart…" : cartRecovery === "mutation" ? "Check cart update" : "Try again"}
    </button>
  );
  if (!cartReady)
    return (
      <section ref={region} aria-label="Your saved cart" tabIndex={-1}><p role={error ? "alert" : "status"}>
        {error || "Loading your saved cart…"}
      </p>{recovery}</section>
    );
  if (!cart.items.length)
    return (
      <section ref={region} aria-label="Your saved cart" tabIndex={-1}><div className="empty-state">
        <ShoppingBag size={38} />
        <h2>Your cart is empty</h2>
        <p>Find a piece that feels like home.</p>
        {error && <p role="alert">{error}</p>}
        {recovery}
        <Link
          href="/collections/all"
          className="button"
          onClick={() => setCartOpen(false)}
        >
          Explore furniture
        </Link>
      </div></section>
    );
  return (
    <section ref={region} aria-label="Your saved cart" tabIndex={-1}>
      <div className="cart-lines">
        {cart.items.map((item) => (
          <article key={item.variantId} className="cart-line">
            <Link
              href={"/products/" + item.handle}
              onClick={() => setCartOpen(false)}
              className="cart-image"
            >
              <ProductImage src={item.image} alt={item.title} fill sizes="100px" />
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
              {shortfalls.filter((short) => short.first === item.variantId).map((short) => (
                <p key={short.handle} data-minimum-shortfall className="error-text">{item.title} has a minimum order of {short.minimum}. Add {short.minimum - short.quantity} more (finishes can be mixed).</p>
              ))}
              {item.stockPolicy === "made_to_order" && <p data-lead-time className="muted">Made to order{item.leadTimeDays ? `: allow ${item.leadTimeDays} days for making` : ""}</p>}
              {!item.cartable && (
                <p className="error-text">
                  Please contact us to confirm price and availability.
                </p>
              )}
              <div className="quantity-row">
                <div className="quantity-control">
                  <button
                    disabled={busy}
                    onClick={(event) =>
                      void updateQuantity(item.variantId, item.quantity - 1, event.currentTarget)
                    }
                    aria-label={"Decrease quantity of " + item.title}
                  >
                    <Minus size={14} />
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    disabled={busy || item.quantity >= 20 || !item.cartable}
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
                  data-cart-remove
                  disabled={busy}
                  onClick={(event) => void updateQuantity(item.variantId, 0, event.currentTarget)}
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
      {recovery}
      <div className="cart-summary">
        <div>
          <span>Subtotal</span>
          <strong>{money(cart.subtotalPaise)}</strong>
        </div>
        <p>Shipping and availability will be confirmed before payment.</p>
        {shortfalls.length && cart.items.every(item => item.cartable) && cart.subtotalPaise !== null ? (
          // Keeri's quote would refuse it: the bag says what to add instead of failing at checkout.
          <button type="button" className="button full-width" disabled>Add more to check out</button>
        ) : (
          <Link
            className="button full-width"
            href={cart.items.every(item => item.cartable) && cart.subtotalPaise !== null ? "/checkout" : "/contact"}
            onClick={() => setCartOpen(false)}
          >
            {cart.items.every(item => item.cartable) && cart.subtotalPaise !== null ? "Continue to checkout" : "Ask about these items"}
          </Link>
        )}
        {!cart.checkoutEnabled && (
          <p className="preview-disclosure">
            Your cart is saved. Online payment is not available yet.
          </p>
        )}
      </div>
    </section>
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
