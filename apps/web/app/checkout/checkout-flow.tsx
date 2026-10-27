"use client";
import { checkoutInputSchema, type CheckoutInput } from "@shopmaple/contracts";
import Link from "next/link";
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useShop } from "@/components/shop-provider";
import { money } from "@/lib/format";
import { CheckoutClosed } from "./checkout-closed";
import {
  CheckoutClientError,
  createCheckoutClient,
  type CheckoutAttempt,
  type CheckoutOptions,
} from "./checkout-client";
import { indiaStates } from "./india-states";
import { openHostedPayment } from "./razorpay";

type Stage =
  | { kind: "details" }
  | { kind: "quote"; attempt: CheckoutAttempt }
  | { kind: "paying"; attempt: CheckoutAttempt }
  | { kind: "confirming"; attempt: CheckoutAttempt }
  | { kind: "confirmed"; attempt: CheckoutAttempt }
  | { kind: "review"; attempt: CheckoutAttempt; reason: "review" | "timeout" }
  | { kind: "closed" };
const fieldLabels: Record<string, string> = {
  "customer.name": "Name",
  "customer.email": "Email",
  "customer.phone": "Mobile number",
  "shippingAddress.line1": "Delivery address",
  "shippingAddress.line2": "Delivery address line 2",
  "shippingAddress.city": "Delivery city",
  "shippingAddress.stateCode": "Delivery state",
  "shippingAddress.pincode": "Delivery pincode",
  "billingAddress.line1": "Billing address",
  "billingAddress.line2": "Billing address line 2",
  "billingAddress.city": "Billing city",
  "billingAddress.stateCode": "Billing state",
  "billingAddress.pincode": "Billing pincode",
  deliveryMethodId: "Delivery method",
};
const confirmationWindowMs = 150_000;
function readForm(form: HTMLFormElement, sameBilling: boolean) {
  // Read named controls directly so the same code runs in browsers and DOM test runners.
  const read = (key: string) => {
    // A radio group resolves to a RadioNodeList whose value is the checked option.
    const control = form.elements.namedItem(key) as { value?: unknown } | null;
    return typeof control?.value === "string" ? control.value.trim() : "";
  };
  const address = (prefix: string) => ({
    line1: read(`${prefix}.line1`),
    line2: read(`${prefix}.line2`),
    city: read(`${prefix}.city`),
    stateCode: read(`${prefix}.stateCode`),
    pincode: read(`${prefix}.pincode`),
    country: "IN" as const,
  });
  const shipping = address("shipping");
  return {
    customer: { name: read("name"), email: read("email"), phone: read("phone").replace(/[\s-]/g, "") },
    shippingAddress: shipping,
    billingAddress: sameBilling ? shipping : address("billing"),
    deliveryMethodId: read("deliveryMethodId"),
  };
}
function AddressFields({ prefix, id, defaults }: { prefix: "shipping" | "billing"; id: string; defaults?: CheckoutInput["shippingAddress"] }) {
  return (
    <>
      <label className="checkout-field">
        <span>Address</span>
        <input name={`${prefix}.line1`} autoComplete={`${prefix} address-line1`} required maxLength={200} defaultValue={defaults?.line1} id={`${id}-${prefix}-line1`} />
      </label>
      <label className="checkout-field">
        <span>Address line 2 (optional)</span>
        <input name={`${prefix}.line2`} autoComplete={`${prefix} address-line2`} maxLength={200} defaultValue={defaults?.line2} />
      </label>
      <div className="checkout-field-row">
        <label className="checkout-field">
          <span>City</span>
          <input name={`${prefix}.city`} autoComplete={`${prefix} address-level2`} required maxLength={100} defaultValue={defaults?.city} />
        </label>
        <label className="checkout-field">
          <span>State</span>
          <select name={`${prefix}.stateCode`} autoComplete={`${prefix} address-level1`} required defaultValue={defaults?.stateCode ?? ""}>
            <option value="" disabled>
              Select a state
            </option>
            {indiaStates.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="checkout-field">
          <span>Pincode</span>
          <input name={`${prefix}.pincode`} autoComplete={`${prefix} postal-code`} inputMode="numeric" required pattern="[1-9][0-9]{5}" maxLength={6} defaultValue={defaults?.pincode} />
        </label>
      </div>
    </>
  );
}

export function CheckoutFlow({ options, pollIntervalMs = 2500 }: { options: CheckoutOptions; pollIntervalMs?: number }) {
  const id = useId();
  const { cart, cartReady } = useShop();
  const client = useMemo(() => createCheckoutClient(), []);
  const [stage, setStage] = useState<Stage>({ kind: "details" });
  const [input, setInput] = useState<CheckoutInput | null>(null);
  const [sameBilling, setSameBilling] = useState(true);
  const [deliveryMethodId, setDeliveryMethodId] = useState(options.deliveryMethods[0]?.id ?? "");
  const [problems, setProblems] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const confirmingId = stage.kind === "confirming" ? stage.attempt.id : null;
  const quoteExpiry = stage.kind === "quote" && stage.attempt.quote ? Date.parse(stage.attempt.quote.expiresAt) : null;
  const expired = quoteExpiry !== null && quoteExpiry <= now;

  function fail(error: unknown) {
    if (error instanceof CheckoutClientError && error.kind === "closed") {
      setStage({ kind: "closed" });
      return;
    }
    setNotice(
      error instanceof CheckoutClientError
        ? error.message
        : "We couldn't complete that step. Please try again. No payment has been taken.",
    );
  }
  async function requestQuote(data: CheckoutInput, fresh: boolean) {
    setBusy(true);
    setNotice("");
    try {
      const attempt = await client.quote(data, fresh);
      setNow(Date.now());
      setStage({ kind: "quote", attempt });
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = checkoutInputSchema.safeParse(readForm(event.currentTarget, sameBilling));
    if (!parsed.success) {
      setProblems([...new Set(parsed.error.issues.map((issue) => fieldLabels[issue.path.join(".")] ?? "Your details"))]);
      return;
    }
    setProblems([]);
    setInput(parsed.data);
    await requestQuote(parsed.data, false);
  }
  async function pay(attempt: CheckoutAttempt) {
    if (!input) return;
    setBusy(true);
    setNotice("");
    try {
      const ready = await client.paymentOrder(attempt.id);
      if (!ready.providerOrderId)
        throw new CheckoutClientError("blocked", "This checkout requires review. Check your order status before trying another payment.");
      setStage({ kind: "paying", attempt: ready });
      await openHostedPayment({
        key: options.paymentKeyId,
        order_id: ready.providerOrderId,
        amount: ready.amountPaise,
        currency: "INR",
        name: "Maple Furnishers",
        description: `${cart.itemCount} ${cart.itemCount === 1 ? "item" : "items"}`,
        prefill: { name: input.customer.name, email: input.customer.email, contact: input.customer.phone },
        theme: { color: "#6b1d14" },
        handler: () => {
          setPaid(false);
          setStage({ kind: "confirming", attempt: ready });
        },
        modal: {
          ondismiss: () => {
            setStage((current) => (current.kind === "paying" ? { kind: "quote", attempt: ready } : current));
            setNotice("Payment was not completed. You can try again when you're ready. No payment has been taken.");
          },
        },
      });
    } catch (error) {
      setStage((current) => (current.kind === "paying" ? { kind: "quote", attempt } : current));
      if (error instanceof CheckoutClientError) fail(error);
      else setNotice("The payment window couldn't be opened. Please try again. No payment has been taken.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (quoteExpiry === null || quoteExpiry <= now) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(quoteExpiry - now + 50, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [quoteExpiry, now]);
  useEffect(() => {
    if (!confirmingId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + confirmationWindowMs;
    const tick = async () => {
      if (cancelled) return;
      try {
        const current = await client.status(confirmingId);
        if (cancelled) return;
        if (current.paid) setPaid(true);
        if (current.fulfillmentStatus === "confirmed" && current.orderReference) {
          setStage({ kind: "confirmed", attempt: current });
          return;
        }
        if (current.fulfillmentStatus === "review_required" || current.state === "reconciliation_required") {
          setStage({ kind: "review", attempt: current, reason: "review" });
          return;
        }
      } catch (error) {
        if (error instanceof CheckoutClientError && error.kind === "closed") {
          setStage({ kind: "closed" });
          return;
        }
        // Transient status failures keep polling until the confirmation window closes.
      }
      if (Date.now() >= deadline) {
        setStage((stage) => (stage.kind === "confirming" ? { kind: "review", attempt: stage.attempt, reason: "timeout" } : stage));
        return;
      }
      timer = setTimeout(() => void tick(), pollIntervalMs);
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [confirmingId, client, pollIntervalMs]);

  if (stage.kind === "closed") return <CheckoutClosed />;
  if (stage.kind === "confirmed") {
    return (
      <section className="empty-state checkout-state" aria-live="polite">
        <h2>Order confirmed</h2>
        <p>
          Thank you. Your payment has been received and your order is confirmed. Your order reference is{" "}
          <strong>{stage.attempt.orderReference}</strong>.
        </p>
        <p>Keep this reference for any questions about delivery.</p>
        <div className="button-row">
          <Link className="button" href="/collections/all">
            Continue shopping
          </Link>
          <Link className="button secondary" href="/pages/contact">
            Contact our team
          </Link>
        </div>
      </section>
    );
  }
  if (stage.kind === "review") {
    return (
      <section className="empty-state checkout-state" aria-live="polite">
        <h2>{paid || stage.attempt.paid ? "Your payment has been received" : "This checkout needs a check"}</h2>
        <p>
          {paid || stage.attempt.paid
            ? stage.reason === "timeout"
              ? "We're still confirming your order with our team. This can take a few minutes; you don't need to pay again."
              : "Our team is reviewing this order before confirming it. You don't need to pay again."
            : "Our team needs to review this checkout before payment can continue. No payment has been taken."}
        </p>
        <p>
          Your checkout reference is <strong>{stage.attempt.id}</strong>. Quote it if you contact us.
        </p>
        <div className="button-row">
          <Link className="button" href="/pages/contact">
            Contact our team
          </Link>
          <Link className="button secondary" href="/cart">
            Return to cart
          </Link>
        </div>
      </section>
    );
  }
  if (stage.kind === "confirming" || stage.kind === "paying") {
    return (
      <section className="empty-state checkout-state" aria-live="polite">
        <h2>{stage.kind === "paying" ? "Complete your payment" : paid ? "Payment received" : "Confirming your payment"}</h2>
        <p role="status">
          {stage.kind === "paying"
            ? "Finish the payment in the secure window. Close it to return here without paying."
            : paid
              ? "Confirming your order with our team. This usually takes a moment."
              : "Waiting for the payment provider to confirm your payment. Please keep this page open."}
        </p>
      </section>
    );
  }
  if (stage.kind === "quote") {
    const quote = stage.attempt.quote;
    const method = options.deliveryMethods.find((m) => m.id === input?.deliveryMethodId);
    return (
      <div className="checkout-layout">
        <section className="checkout-quote" aria-labelledby={`${id}-review`}>
          <h2 id={`${id}-review`}>Review your order</h2>
          {quote ? (
            <>
              <ul className="checkout-lines">
                {quote.items.map((item) => (
                  <li key={item.variantId}>
                    <span>
                      <strong>{item.title}</strong>
                      <span className="muted">
                        {item.variantTitle} × {item.quantity}
                      </span>
                    </span>
                    <span>{money(item.lineTotalPaise)}</span>
                  </li>
                ))}
              </ul>
              <dl className="checkout-totals">
                <div>
                  <dt>Subtotal</dt>
                  <dd>{money(quote.subtotalPaise)}</dd>
                </div>
                <div>
                  <dt>Delivery{method ? ` (${method.label})` : ""}</dt>
                  <dd>{money(quote.shippingPaise)}</dd>
                </div>
                {quote.gstMode === "excluded" ? (
                  <div>
                    <dt>GST</dt>
                    <dd>{money(quote.taxPaise)}</dd>
                  </div>
                ) : (
                  <div className="muted">
                    <dt>Includes GST</dt>
                    <dd>{money(quote.taxPaise)}</dd>
                  </div>
                )}
                <div className="checkout-total">
                  <dt>Total</dt>
                  <dd>{money(stage.attempt.amountPaise)}</dd>
                </div>
              </dl>
              <p className="muted">
                {expired
                  ? "This quote has expired. Get a new quote to continue; prices and delivery will be confirmed again."
                  : `This quote is valid until ${new Date(quote.expiresAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.`}
              </p>
            </>
          ) : (
            <p className="muted">Your order total is {money(stage.attempt.amountPaise)}.</p>
          )}
          {notice && (
            <p className="error-text" role="alert">
              {notice}
            </p>
          )}
          <div className="button-row">
            {expired ? (
              <button className="button" type="button" disabled={busy} onClick={() => input && void requestQuote(input, true)}>
                Get a new quote
              </button>
            ) : (
              <button className="button" type="button" disabled={busy} onClick={() => void pay(stage.attempt)}>
                Pay {money(stage.attempt.amountPaise)}
              </button>
            )}
            <button className="button secondary" type="button" disabled={busy} onClick={() => { setNotice(""); setStage({ kind: "details" }); }}>
              Edit details
            </button>
          </div>
          <p className="muted">Payment is taken by Razorpay in a secure window. Your card details never reach Maple.</p>
        </section>
        {input && (
          <aside className="checkout-summary">
            <h3>Delivering to</h3>
            <p>
              {input.customer.name}
              <br />
              {input.shippingAddress.line1}
              {input.shippingAddress.line2 ? <><br />{input.shippingAddress.line2}</> : null}
              <br />
              {input.shippingAddress.city} {input.shippingAddress.pincode}
            </p>
            <p className="muted">
              {input.customer.email}
              <br />
              {input.customer.phone}
            </p>
          </aside>
        )}
      </div>
    );
  }
  if (cartReady && cart.items.length === 0)
    return (
      <div className="empty-state">
        <h2>Your cart is empty</h2>
        <p>Add a piece to your cart before checking out.</p>
        <Link href="/collections/all" className="button">
          Explore furniture
        </Link>
      </div>
    );
  const purchasable = !cartReady || (cart.subtotalPaise !== null && cart.items.every((item) => item.cartable));
  if (!purchasable)
    return (
      <div className="empty-state">
        <h2>Some items need confirmation first</h2>
        <p>One or more items in your cart need a price or availability check before online payment.</p>
        <div className="button-row">
          <Link href="/cart" className="button">
            Review your cart
          </Link>
          <Link href="/pages/contact" className="button secondary">
            Ask about these items
          </Link>
        </div>
      </div>
    );
  return (
    <div className="checkout-layout">
      <form className="checkout-form" onSubmit={(event) => void submit(event)} noValidate aria-describedby={`${id}-note`}>
        <fieldset>
          <legend>Contact details</legend>
          <label className="checkout-field">
            <span>Name</span>
            <input name="name" autoComplete="name" required maxLength={120} defaultValue={input?.customer.name} />
          </label>
          <div className="checkout-field-row">
            <label className="checkout-field">
              <span>Email</span>
              <input name="email" type="email" autoComplete="email" autoCapitalize="off" spellCheck={false} required maxLength={254} defaultValue={input?.customer.email} />
            </label>
            <label className="checkout-field">
              <span>Mobile number</span>
              <input name="phone" type="tel" autoComplete="tel" inputMode="tel" required maxLength={16} placeholder="10-digit mobile" defaultValue={input?.customer.phone} />
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Delivery address</legend>
          <AddressFields prefix="shipping" id={id} defaults={input?.shippingAddress} />
        </fieldset>
        <fieldset>
          <legend>Delivery method</legend>
          {options.deliveryMethods.map((method) => (
            <label key={method.id} className="checkout-choice">
              <input type="radio" name="deliveryMethodId" value={method.id} checked={deliveryMethodId === method.id} onChange={() => setDeliveryMethodId(method.id)} />
              <span>{method.label}</span>
            </label>
          ))}
          <p className="muted">Delivery charges and GST are confirmed on the next step before you pay.</p>
        </fieldset>
        <fieldset>
          <legend>Billing address</legend>
          <label className="checkout-choice">
            <input type="checkbox" name="sameBilling" checked={sameBilling} onChange={(event) => setSameBilling(event.currentTarget.checked)} />
            <span>Same as delivery address</span>
          </label>
          {!sameBilling && <AddressFields prefix="billing" id={id} defaults={input?.billingAddress} />}
        </fieldset>
        {problems.length > 0 && (
          <p className="error-text" role="alert">
            Please check: {problems.join(", ")}.
          </p>
        )}
        {notice && (
          <p className="error-text" role="alert">
            {notice}
          </p>
        )}
        <div className="button-row">
          <button className="button" type="submit" disabled={busy || !cartReady}>
            {busy ? "Confirming prices…" : "Continue to review"}
          </button>
          <Link className="button secondary" href="/cart">
            Return to cart
          </Link>
        </div>
        <p id={`${id}-note`} className="muted">
          Your details are used only to quote delivery, raise your order and contact you about it. No payment is taken on this step.
        </p>
      </form>
      <aside className="checkout-summary" aria-live="polite">
        <h3>Your cart</h3>
        {cartReady ? (
          <>
            <p>
              {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"} in your cart
            </p>
            <ul className="checkout-lines">
              {cart.items.map((item) => (
                <li key={item.variantId}>
                  <span>
                    <strong>{item.title}</strong>
                    <span className="muted">
                      {item.variantTitle} × {item.quantity}
                    </span>
                  </span>
                  <span>{money(item.lineTotalPaise)}</span>
                </li>
              ))}
            </ul>
            <dl className="checkout-totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{money(cart.subtotalPaise)}</dd>
              </div>
            </dl>
            <p className="muted">Delivery and GST are confirmed in the next step.</p>
          </>
        ) : (
          <p className="muted">Loading your saved cart…</p>
        )}
      </aside>
    </div>
  );
}
