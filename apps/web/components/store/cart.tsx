"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { ProductImage } from "../product-image";
import Link from "next/link";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { useShop } from "../shop-provider";
import { Modal } from "./modal";
import { money } from "@/lib/format";
import { button, emptyCopy, emptyState, iconButton, panelTitle, textLink } from "./current-look";

const muted = "text-[13px] text-ink-soft";
const errorText = "text-[13px] text-[#a22b1f]";
const summaryNote = "my-4 text-[12px] text-ink-soft";
const stepper = "grid h-[38px] w-9 place-items-center border-0 bg-transparent";

/** The saved cart, on /cart and in the drawer; in the drawer its free-standing messages sit 12 px over 24 px instead of 10 px each side. */
export function CartContents({ drawer = false }: { drawer?: boolean }) {
  const { cart, busy, cartReady, error, setQuantity, setCartOpen, cartRecovery, checkingCart, recoverCart } = useShop();
  const region = useRef<HTMLElement>(null);
  const restoreFocus = useRef(false);
  const removalFocus = useRef<{ control: HTMLButtonElement; index: number; succeeded: boolean } | null>(null);
  const [removalCompleted, setRemovalCompleted] = useState(0);
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
    (next ?? container.querySelector<HTMLAnchorElement>("[data-cart-empty] a") ?? container).focus();
  }, [cart, removalCompleted]);
  async function updateQuantity(id: string, quantity: number, control: HTMLButtonElement) {
    const removal = quantity === 0 && document.activeElement === control
      ? {
          control,
          index: [...(region.current?.querySelectorAll("[data-cart-line]") ?? [])].indexOf(control.closest("[data-cart-line]")!),
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
  const message = drawer ? "mt-3 mb-6" : "my-2.5";
  const recovery = (className = "") => cartRecovery && (
    <button className={`${button} ${className}`} disabled={checkingCart} onClick={(event) => {
      restoreFocus.current = document.activeElement === event.currentTarget;
      void recoverCart();
    }}>
      {checkingCart ? "Checking your cart…" : cartRecovery === "mutation" ? "Check cart update" : "Try again"}
    </button>
  );
  if (!cartReady)
    return (
      <section data-store data-cart ref={region} aria-label="Your saved cart" tabIndex={-1}><p role={error ? "alert" : "status"} className={message}>
        {error || "Loading your saved cart…"}
      </p>{recovery()}</section>
    );
  if (!cart.items.length)
    return (
      <section data-store data-cart ref={region} aria-label="Your saved cart" tabIndex={-1}><div data-cart-empty className={emptyState}>
        <ShoppingBag size={38} />
        <h2 className={panelTitle}>Your cart is empty</h2>
        <p className={`${emptyCopy} ${message}`}>Find a piece that feels like home.</p>
        {error && <p role="alert" className={`${emptyCopy} ${message}`}>{error}</p>}
        {recovery("mt-3")}
        <Link
          href="/collections/all"
          className={`${button} mt-3`}
          onClick={() => setCartOpen(false)}
        >
          Explore furniture
        </Link>
      </div></section>
    );
  return (
    <section data-store data-cart ref={region} aria-label="Your saved cart" tabIndex={-1}>
      <div data-cart-lines>
        {cart.items.map((item) => (
          <article key={item.variantId} data-cart-line className="grid grid-cols-[90px_1fr_auto] gap-4 border-b border-rule py-5 text-[13px] max-[701px]:grid-cols-[70px_minmax(0,1fr)] max-[701px]:gap-3 max-[701px]:text-[12px]">
            <Link
              href={"/products/" + item.handle}
              onClick={() => setCartOpen(false)}
              data-cart-image
              className="relative aspect-square self-start overflow-hidden rounded-[6px] [&_img]:object-cover"
            >
              <ProductImage src={item.image} alt={item.title} fill sizes="100px" />
            </Link>
            <div>
              <Link
                href={"/products/" + item.handle}
                onClick={() => setCartOpen(false)}
                className={textLink}
              >
                {item.title}
              </Link>
              <p className={`my-[5px] ${muted}`}>{item.variantTitle}</p>
              <p className="my-[5px]">{money(item.pricePaise)}</p>
              {item.stockPolicy === "made_to_order" && <p className={`my-[5px] ${muted}`}>Made to order</p>}
              {!item.cartable && (
                <p className={`my-[5px] ${errorText}`}>
                  Please contact us to confirm price and availability.
                </p>
              )}
              <div className="mt-2.5 flex items-center gap-3">
                <div data-cart-quantity className="inline-flex min-h-10 items-center border border-[#b9b8b0] bg-transparent">
                  <button
                    className={stepper}
                    disabled={busy}
                    onClick={(event) =>
                      void updateQuantity(item.variantId, item.quantity - 1, event.currentTarget)
                    }
                    aria-label={"Decrease quantity of " + item.title}
                  >
                    <Minus size={14} />
                  </button>
                  <span className="inline-block min-w-7 text-center tabular-nums">{item.quantity}</span>
                  <button
                    className={stepper}
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
                  className={iconButton}
                  data-cart-remove
                  disabled={busy}
                  onClick={(event) => void updateQuantity(item.variantId, 0, event.currentTarget)}
                  aria-label={"Remove " + item.title}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
            <strong className="whitespace-nowrap font-medium max-[701px]:col-[2] max-[701px]:justify-self-start">{money(item.lineTotalPaise)}</strong>
          </article>
        ))}
      </div>
      {error && (
        <p className={`${errorText} ${message}`} role="alert">
          {error}
        </p>
      )}
      {recovery()}
      <div data-cart-summary className="mt-[30px]">
        <div className="flex justify-between gap-4 text-[18px] max-[701px]:text-[17px]">
          <span>Subtotal</span>
          <strong>{money(cart.subtotalPaise)}</strong>
        </div>
        <p className={summaryNote}>Shipping and availability will be confirmed before payment.</p>
        <Link
          className={`${button} w-full`}
          href={cart.items.every(item => item.cartable) && cart.subtotalPaise !== null ? "/checkout" : "/pages/contact"}
          onClick={() => setCartOpen(false)}
        >
          {cart.items.every(item => item.cartable) && cart.subtotalPaise !== null ? "Continue to checkout" : "Ask about these items"}
        </Link>
        {!cart.checkoutEnabled && (
          <p data-cart-disclosure className={`${summaryNote} leading-[1.6]`}>
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
      <CartContents drawer />
    </Modal>
  );
}
