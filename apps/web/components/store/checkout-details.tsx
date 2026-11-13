"use client";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { linePhoto, type CheckoutAccount, type CheckoutAttempt, type CheckoutOptions } from "@/app/checkout/checkout-client";
import { estimatedArrival } from "@/app/checkout/delivery-estimate";
import { indiaStates } from "@/app/checkout/india-states";
import { money } from "@/lib/format";
import { formatDayRange } from "@/lib/account/format";
import { useShop } from "../shop-provider";
import { ProductImage } from "./product-image";
import { makingTime } from "./checkout-parts";

export type CheckoutPhase = "details" | "quote" | "paying";
type Address = { line1: string; line2: string; city: string; stateCode: string; pincode: string };
/** What the form starts with: the details already entered, or a signed-in customer's. */
export type CheckoutDefaults = { email: string; firstName: string; lastName: string; phone: string; shipping: Address | null; billing: Address | null };

const pickup = (methodLabel: string) => /pick ?up|store|showroom/i.test(methodLabel);
type Quote = NonNullable<CheckoutAttempt["quote"]>;
/** The delivery option's charge: the courier's rate, or "Free delivery" where Keeri's free-delivery rule covers the whole order. */
const deliveryCharge = (quote: Quote) =>
  quote.delivery?.freeDelivery?.all ? "Free delivery" : quote.shippingPaise ? money(quote.shippingPaise) : "Free";
/** The pieces that ship free in an order that still pays for the rest, by name; null when none or all do. */
function partFreeDelivery(quote: Quote | null) {
  const free = quote?.delivery?.freeDelivery;
  return free && !free.all && free.titles.length ? free.titles.join(", ") : null;
}

/** A labelled field, its problem tied to it through aria-describedby (Figma's "Maple / Forms / Input"). */
function Field({ id, name, label, error, hint, wide, children }: {
  id: string; name: string; label: string; error?: string; hint?: string; wide?: boolean; children: (props: { id: string; name: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
}) {
  const fieldId = `${id}-${name.replace(".", "-")}`;
  const describedBy = [hint ? `${fieldId}-hint` : "", error ? `${fieldId}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="checkout-field-group" data-wide={wide ? "" : undefined}>
      <label className="account-label" htmlFor={fieldId}>{label}</label>
      {children({ id: fieldId, name, ...(error ? { "aria-invalid": true as const } : {}), ...(describedBy ? { "aria-describedby": describedBy } : {}) })}
      {hint ? <p id={`${fieldId}-hint`} className="account-hint">{hint}</p> : null}
      {error ? <p id={`${fieldId}-error`} className="account-field-error">{error}</p> : null}
    </div>
  );
}

function AddressFields({ id, prefix, defaults, errors, locked }: { id: string; prefix: "shipping" | "billing"; defaults: Address | null; errors: Record<string, string>; locked: boolean }) {
  const name = (field: string) => `${prefix}.${field}`;
  return (
    <>
      <Field id={id} name={name("line1")} label="Street address" error={errors[name("line1")]} wide>
        {(props) => <input className="account-input" {...props} autoComplete={`${prefix} address-line1`} required maxLength={200} disabled={locked}
          placeholder="House number, building and street" defaultValue={defaults?.line1} />}
      </Field>
      <Field id={id} name={name("line2")} label="Apartment / landmark (optional)" error={errors[name("line2")]} wide>
        {(props) => <input className="account-input" {...props} autoComplete={`${prefix} address-line2`} maxLength={200} disabled={locked} defaultValue={defaults?.line2} />}
      </Field>
      <Field id={id} name={name("city")} label="City" error={errors[name("city")]}>
        {(props) => <input className="account-input" {...props} autoComplete={`${prefix} address-level2`} required maxLength={100} disabled={locked} defaultValue={defaults?.city} />}
      </Field>
      <Field id={id} name={name("pincode")} label="PIN code" error={errors[name("pincode")]}>
        {(props) => <input className="account-input" {...props} autoComplete={`${prefix} postal-code`} inputMode="numeric" required pattern="[1-9][0-9]{5}" maxLength={6}
          disabled={locked} placeholder="6-digit PIN" defaultValue={defaults?.pincode} />}
      </Field>
      <Field id={id} name={name("stateCode")} label="State" error={errors[name("stateCode")]}>
        {(props) => (
          <select className="account-input account-select" {...props} autoComplete={`${prefix} address-level1`} required disabled={locked} defaultValue={defaults?.stateCode ?? ""}>
            <option value="" disabled>Select state</option>
            {indiaStates.map(([code, state]) => <option key={code} value={code}>{state}</option>)}
          </select>
        )}
      </Field>
      <div className="checkout-field-group">
        <label className="account-label" htmlFor={`${id}-${prefix}-country`}>Country</label>
        <input id={`${id}-${prefix}-country`} className="account-input" value="India" readOnly aria-readonly="true" tabIndex={-1} />
      </div>
    </>
  );
}

/**
 * The checkout as one page (Figma 394:1310): 01 contact, 02 the delivery address, 03 delivery and payment, with the order
 * beside them. The first press asks the store for the quote (Keeri prices it and fixes delivery by PIN); the delivery
 * charge, the estimate and the total then appear in place, the quoted details lock, and the button pays that total in
 * Razorpay's window. "Edit details" lets the quote go and unlocks the form. A promo code (main's #120) sits in the order: Keeri
 * checks it with the quote, which takes it off as one line; removing it quotes again without it.
 */
export function CheckoutDetails({
  id, phase, defaults, options, deliveryMethodId, onDeliveryMethod, sameBilling, onSameBilling, whatsappUpdates = false, onWhatsappUpdates,
  fieldErrors, problems, notice, busy,
  enquiryHref, account, attempt, expired = false, photos, promoCode, onPromoCode, promoError, onRemoveCode, onSubmit, onPay, onEdit, onRequote,
}: {
  id: string;
  phase: CheckoutPhase;
  defaults: CheckoutDefaults | null;
  options: CheckoutOptions;
  deliveryMethodId: string;
  onDeliveryMethod: (id: string) => void;
  sameBilling: boolean;
  onSameBilling: (value: boolean) => void;
  /** "Send my order updates on WhatsApp", shown when the store offers them (`options.whatsappOrderUpdates`). */
  whatsappUpdates?: boolean;
  onWhatsappUpdates?: (value: boolean) => void;
  /** Problems by field name ("email", "shipping.pincode"), each shown on its field. */
  fieldErrors: Record<string, string>;
  /** The same problems by label, for the summary line by the button. */
  problems: string[];
  notice: string;
  busy: boolean;
  /** Set when the courier could not price this pincode: the buyer may ask for a quote or try another address. */
  enquiryHref?: string | null;
  account?: CheckoutAccount;
  /** The quoted attempt, once there is one. */
  attempt?: CheckoutAttempt | null;
  expired?: boolean;
  /** Photos by the cart's variant ids for lines the cart cannot picture (the design preview's sample order). */
  photos?: Record<string, string>;
  /** The code as typed, and Keeri's refusal of it (or the shape it must have) to show beside it. */
  promoCode: string;
  onPromoCode: (code: string) => void;
  promoError: string;
  /** Quote again without the applied code. */
  onRemoveCode?: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onPay?: () => void;
  onEdit?: () => void;
  onRequote?: () => void;
}) {
  const { cart, cartReady } = useShop();
  const quote = phase === "details" ? null : attempt?.quote ?? null;
  const locked = phase !== "details";
  const method = options.deliveryMethods.find((m) => m.id === deliveryMethodId) ?? options.deliveryMethods[0];
  const signedIn = account?.prefill ?? null;
  const arrival = quote ? estimatedArrival(quote, new Date()) : null;
  const partFree = partFreeDelivery(quote);
  const images = new Map(cart.items.map((item) => [item.variantId, item.image]));
  const lines = quote
    ? quote.items.map((item) => ({ key: item.variantId, title: item.title, variant: item.variantTitle, quantity: item.quantity, pricePaise: item.lineTotalPaise + (item.discountPaise ?? 0),
      image: linePhoto(item, (id) => photos?.[id] ?? images.get(id)) ?? null, making: makingTime(item) }))
    : cart.items.map((item) => ({ key: item.variantId, title: item.title, variant: item.variantTitle, quantity: item.quantity, pricePaise: item.lineTotalPaise ?? item.pricePaise, image: item.image || null,
      making: item.stockPolicy === "made_to_order" && item.leadTimeDays ? `Made to order: allow ${item.leadTimeDays} days for making` : null }));
  const count = quote ? quote.items.reduce((sum, item) => sum + item.quantity, 0) : cart.itemCount;
  const variantOf = (variant: string) => (variant && variant !== "Default Title" ? variant : "");
  const amount = attempt?.amountPaise ?? quote?.totalPaise ?? 0;

  return (
    <div className="checkout-single" data-checkout-phase={phase}>
      <div className="checkout-heading">
        <nav className="checkout-steps" aria-label="Checkout steps">
          <ol>
            <li><Link href="/cart">Bag</Link></li>
            <li aria-current="step">Checkout</li>
            <li>Confirmation</li>
          </ol>
        </nav>
        <h1 className="checkout-title">Make room for something beautiful.</h1>
        <p className="checkout-lead">{signedIn ? `Signed in as ${signedIn.email}.` : "Checkout as a guest. No account needed."}</p>
      </div>
      <div className="checkout-columns" data-checkout-review={quote ? "" : undefined}>
        <form className="checkout-form" onSubmit={onSubmit} noValidate aria-describedby={`${id}-note`}>
          <fieldset className="checkout-section" disabled={locked}>
            <legend className="checkout-section-title"><span className="checkout-step-number">01</span> Contact details</legend>
            <Field id={id} name="email" label="Email address" error={fieldErrors.email} wide hint={signedIn ? "Orders placed with this email appear in your account." : undefined}>
              {(props) => <input className="account-input" {...props} type="email" autoComplete="email" autoCapitalize="off" spellCheck={false} required maxLength={254}
                disabled={locked} placeholder="you@example.com" defaultValue={defaults?.email} />}
            </Field>
            {account?.enabled && !signedIn ? (
              <p className="checkout-account-note">Already have an account? <Link className="account-text-link" href="/account/login?next=%2Fcheckout">Sign in</Link></p>
            ) : null}
          </fieldset>
          <hr className="checkout-rule" />
          <fieldset className="checkout-section" disabled={locked}>
            <legend className="checkout-section-title"><span className="checkout-step-number">02</span> Delivery address</legend>
            <div className="checkout-fields">
              <Field id={id} name="firstName" label="First name" error={fieldErrors.firstName}>
                {(props) => <input className="account-input" {...props} autoComplete="given-name" required maxLength={60} disabled={locked} defaultValue={defaults?.firstName} />}
              </Field>
              <Field id={id} name="lastName" label="Last name">
                {(props) => <input className="account-input" {...props} autoComplete="family-name" maxLength={60} disabled={locked} defaultValue={defaults?.lastName} />}
              </Field>
              <AddressFields id={id} prefix="shipping" defaults={defaults?.shipping ?? null} errors={fieldErrors} locked={locked} />
              <Field id={id} name="phone" label="Mobile number" error={fieldErrors.phone} hint="For delivery coordination and order updates." wide>
                {(props) => (
                  <span className="checkout-phone">
                    <span aria-hidden="true" className="checkout-phone-prefix">+91</span>
                    <input className="account-input" {...props} type="tel" autoComplete="tel-national" inputMode="tel" required maxLength={16} disabled={locked}
                      placeholder="Mobile number" defaultValue={defaults?.phone} />
                  </span>
                )}
              </Field>
            </div>
            {/* The buyer's consent to WhatsApp messages about this order (owner, 13 Nov 2026): theirs to tick. */}
            {options.whatsappOrderUpdates ? (
              <label className="account-check" data-checkout-whatsapp="">
                <input type="checkbox" name="whatsappOrderUpdates" checked={whatsappUpdates} disabled={locked}
                  onChange={(event) => onWhatsappUpdates?.(event.currentTarget.checked)} />
                Send my order updates on WhatsApp
              </label>
            ) : null}
            <label className="account-check">
              <input type="checkbox" name="sameBilling" checked={sameBilling} disabled={locked} onChange={(event) => onSameBilling(event.currentTarget.checked)} />
              Billing address is the same as delivery address
            </label>
            {!sameBilling && (
              <fieldset className="checkout-billing" disabled={locked}>
                <legend className="account-label">Billing address</legend>
                <div className="checkout-fields">
                  <AddressFields id={id} prefix="billing" defaults={defaults?.billing ?? null} errors={fieldErrors} locked={locked} />
                </div>
              </fieldset>
            )}
          </fieldset>
          <hr className="checkout-rule" />
          <section className="checkout-section" aria-labelledby={`${id}-pay-title`}>
            <h2 id={`${id}-pay-title`} className="checkout-section-title"><span className="checkout-step-number">03</span> Delivery &amp; payment</h2>
            <div data-checkout-delivery="" aria-live="polite">
              {quote && method ? (
                <div className="checkout-option">
                  <p className="checkout-option-title">{`${method.label} · ${deliveryCharge(quote)}`}</p>
                  {arrival ? <p className="checkout-option-note">{`Estimated arrival · ${formatDayRange(arrival.from, arrival.to, { month: "long" })}`}</p> : (
                    <p className="checkout-option-note">We’ll confirm the delivery date with you.</p>
                  )}
                  {partFree ? (
                    <p className="checkout-option-note" data-free-delivery="">{`Free delivery on ${partFree}. The delivery charge is for the rest of your order.`}</p>
                  ) : null}
                  {quote.delivery ? (
                    <p className="checkout-option-meta" data-courier="">
                      {quote.delivery.courierName}
                      {quote.delivery.estimatedDays ? `, about ${quote.delivery.estimatedDays} days in transit` : ""}
                    </p>
                  ) : null}
                </div>
              ) : options.deliveryMethods.length > 1 ? (
                <fieldset className="checkout-options" disabled={locked}>
                  <legend className="sr-only">How would you like to receive your order?</legend>
                  {options.deliveryMethods.map((option) => (
                    <label key={option.id} className="checkout-option" data-chosen={deliveryMethodId === option.id ? "" : undefined}>
                      <input type="radio" name="deliveryMethodId" value={option.id} checked={deliveryMethodId === option.id} disabled={locked}
                        onChange={() => onDeliveryMethod(option.id)} />
                      <span className="checkout-option-title">{option.label}</span>
                      <span className="checkout-option-note">
                        {pickup(option.label) ? "Maple Furnishers showroom, Kirti Nagar, New Delhi" : "The charge and arrival are worked out from your PIN code."}
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : method ? (
                <div className="checkout-option">
                  <input type="hidden" name="deliveryMethodId" value={method.id} />
                  <p className="checkout-option-title">{method.label}</p>
                  <p className="checkout-option-note">{pickup(method.label) ? "Maple Furnishers showroom, Kirti Nagar, New Delhi" : "The charge and arrival are worked out from your PIN code."}</p>
                </div>
              ) : null}
            </div>
            <div className="checkout-payment" data-checkout-payment="">
              {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
              <img src="/account/lock-large.svg" alt="" width={28} height={28} />
              <p className="checkout-payment-title">Pay securely online</p>
              <p className="checkout-payment-ways">UPI  ·  Credit / debit card  ·  Net banking</p>
              <p className="account-hint">Payment is taken by Razorpay in a secure window. Your card details never reach Maple.</p>
            </div>
            {problems.length > 0 && <p className="account-field-error" role="alert">Please check: {problems.join(", ")}.</p>}
            {notice && <p className="account-field-error" role="alert">{notice}</p>}
            {phase === "details" ? (
              <>
                {enquiryHref && (
                  <Link data-checkout-enquiry href={enquiryHref} className="account-cta" data-fill-button="" data-width="full">Ask for a delivery quote</Link>
                )}
                <button type="submit" className="account-cta" data-fill-button={enquiryHref ? "outline" : ""} data-width="full" data-variant={enquiryHref ? "quiet" : undefined} data-checkout-primary="" disabled={busy || !cartReady}>
                  {busy ? "Calculating…" : enquiryHref ? "Try another address" : "Calculate delivery and total"}
                </button>
              </>
            ) : (
              <div className="checkout-quote-actions">
                {phase === "paying" ? (
                  <button type="button" className="account-cta" data-fill-button="" data-width="full" data-checkout-primary="" disabled>Complete your payment in the secure window</button>
                ) : expired ? (
                  <button type="button" className="account-cta" data-fill-button="" data-width="full" data-checkout-primary="" disabled={busy} onClick={onRequote}>Get a new quote</button>
                ) : (
                  <button type="button" className="account-cta" data-fill-button="" data-width="full" data-checkout-primary="" disabled={busy} onClick={onPay}>{`Continue to payment · ${money(amount)}`}</button>
                )}
                <button type="button" className="account-text-link" disabled={busy || phase === "paying"} onClick={onEdit}>Edit details</button>
              </div>
            )}
            <p className="account-fineprint">
              By continuing, you agree to our <Link className="account-text-link" href="/policies/terms-of-service">Terms of Service</Link> and{" "}
              <Link className="account-text-link" href="/policies/privacy-policy">Privacy Policy</Link>.
            </p>
            <p id={`${id}-note`} className="account-fineprint">
              {quote
                ? expired
                  ? "This quote has expired. Get a new quote to continue; prices and delivery will be confirmed again."
                  : `This total is held until ${new Date(quote.expiresAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}. No payment is taken until you pay in the secure window.`
                : "Delivery and your total are worked out before you pay. No payment is taken until you pay in the secure window."}
            </p>
            {attempt?.state === "awaiting_payment" && phase !== "details" ? (
              <p className="account-fineprint" role="status">If you already completed the payment, keep this page open: it checks for confirmation automatically.</p>
            ) : null}
          </section>
        </form>
        <aside className="checkout-summary" data-checkout-summary="" aria-live="polite" aria-labelledby={`${id}-summary`}>
          <div className="checkout-summary-head">
            <h2 id={`${id}-summary`} className="checkout-summary-title">Your order</h2>
            <p className="account-hint">{cartReady || quote ? `${count} ${count === 1 ? "item" : "items"}` : "Loading…"}</p>
          </div>
          {cartReady || quote ? (
            <>
              <ul className="checkout-lines" data-count={lines.length > 1 ? "many" : "one"}>
                {lines.map((line) => (
                  <li key={line.key} className="checkout-line">
                    <span className="checkout-line-photo">
                      <ProductImage src={line.image || undefined} alt="" fill sizes={lines.length > 1 ? "(max-width: 1440px) 68px, 5vw" : "(max-width: 999px) 92vw, 30vw"}
                        // One piece's photo is the summary's largest picture, at the top beside the form, so it loads at once
                        // (Next.js reports a lazy one as the page's largest paint). Several pieces are small thumbnails and stay lazy.
                        loading={lines.length === 1 ? "eager" : undefined} fetchPriority={lines.length === 1 ? "high" : undefined} />
                    </span>
                    <span className="checkout-line-text">
                      <span className="checkout-line-title">{line.title}</span>
                      <span className="account-hint">{[variantOf(line.variant), `Quantity ${line.quantity}`].filter(Boolean).join(" · ")}</span>
                      {line.making ? <span data-lead-time="" className="account-hint">{line.making}</span> : null}
                    </span>
                    {lines.length > 1 && line.pricePaise !== null ? <span className="checkout-line-price">{money(line.pricePaise)}</span> : null}
                  </li>
                ))}
              </ul>
              <hr className="checkout-rule" />
              {phase === "details" ? (
                <div className="account-field checkout-promo" data-promo="">
                  <label className="account-label" htmlFor={`${id}-promo`}>Have a code?</label>
                  <div className="checkout-promo-row">
                    <input id={`${id}-promo`} name="promoCode" className="account-input checkout-promo-input" autoComplete="off" autoCapitalize="characters"
                      spellCheck={false} maxLength={30} placeholder="Promo code" value={promoCode} onChange={(event) => onPromoCode(event.currentTarget.value)}
                      aria-invalid={promoError ? true : undefined} aria-describedby={`${id}-promo-note`} />
                    {promoCode ? (
                      <button type="button" className="account-text-link" onClick={() => onPromoCode("")}>Remove code</button>
                    ) : null}
                  </div>
                  {promoError ? (
                    <p id={`${id}-promo-note`} className="account-field-error" role="alert" data-promo-error="">{promoError}</p>
                  ) : (
                    <p id={`${id}-promo-note`} className="account-hint">Your discount is taken off with the total.</p>
                  )}
                </div>
              ) : quote?.promotion ? (
                <p className="account-hint checkout-promo-applied" data-promo-applied="">
                  <span>Code <strong>{quote.promotion.code}</strong> applied: {quote.promotion.label}.</span>{" "}
                  <button type="button" className="account-text-link" disabled={busy} onClick={onRemoveCode}>Remove code</button>
                </p>
              ) : null}
              {quote ? (
                <dl className="account-totals">
                  <div><dt>Subtotal</dt><dd>{money(quote.subtotalPaise + (quote.promotion?.discountPaise ?? 0))}</dd></div>
                  {quote.promotion ? (
                    <div data-discount-line=""><dt>Discount ({quote.promotion.code})</dt><dd className="checkout-discount">−{money(quote.promotion.discountPaise)}</dd></div>
                  ) : null}
                  <div><dt>Delivery</dt><dd>{quote.shippingPaise ? money(quote.shippingPaise) : "Free"}</dd></div>
                  {quote.gstMode === "excluded" ? <div><dt>GST</dt><dd>{money(quote.taxPaise)}</dd></div> : null}
                  <div className="account-totals-total"><dt>Total to pay</dt><dd>{money(amount)}</dd></div>
                </dl>
              ) : (
                <dl className="account-totals">
                  <div><dt>Subtotal</dt><dd>{money(cart.subtotalPaise)}</dd></div>
                  <div><dt>Delivery</dt><dd>From your PIN code</dd></div>
                  <div className="account-totals-total"><dt>Total so far</dt><dd>{money(cart.subtotalPaise)}</dd></div>
                </dl>
              )}
              <p className="account-fineprint">
                {quote ? (quote.gstMode === "included" ? "Inclusive of applicable taxes" : "GST is added as shown") : "Delivery and any GST are added before you pay."}
              </p>
              {phase === "details" ? <Link href="/cart" className="account-text-link checkout-edit-bag">Edit bag</Link> : null}
            </>
          ) : (
            <p className="account-hint">Loading your saved cart…</p>
          )}
          <p className="checkout-help">Need a hand? <Link className="account-text-link" href="/contact">Speak with Maple.</Link></p>
        </aside>
      </div>
    </div>
  );
}
