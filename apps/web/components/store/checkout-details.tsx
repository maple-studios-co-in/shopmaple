"use client";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import type { CheckoutInput } from "@shopmaple/contracts";
import type { CheckoutOptions } from "@/app/checkout/checkout-client";
import { indiaStates } from "@/app/checkout/india-states";
import { shopMoney } from "@/lib/format";
import { cx } from "@/lib/cx";
import { useShop } from "../shop-provider";
import { ProductImage } from "./product-image";

// Frame 30:492 ("Form and order summary"): DM Sans in the frame, set in the product page's face.
const label = "flex flex-col gap-2 text-[14px] leading-5 font-medium text-[#1c1c1c]";
const control = "h-[50px] w-full rounded-[8px] border border-solid border-[#e5dfda] bg-white px-[15px] text-[14px] font-normal text-[#1c1c1c] placeholder:text-[#756d68] focus-visible:border-maple focus-visible:outline-2 focus-visible:outline-maple/20";
const muted = "m-0 text-[12px] leading-[17px] text-[#756d68]";

function Section({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
      <legend className="mb-5 flex items-center gap-3 p-0">
        <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-[#f5ece9] text-[12px] leading-[17px] font-semibold text-maple">{number}</span>
        <span className="font-heading text-[22px] leading-8 font-medium text-[#1c1c1c]">{title}</span>
      </legend>
      {children}
    </fieldset>
  );
}

function AddressFields({ prefix, defaults }: { prefix: "shipping" | "billing"; defaults?: CheckoutInput["shippingAddress"] }) {
  return (
    <>
      <label className={label}>Address
        <input className={control} name={`${prefix}.line1`} autoComplete={`${prefix} address-line1`} required maxLength={200} placeholder="House number, building and street" defaultValue={defaults?.line1} />
      </label>
      <label className={label}>Apartment, suite, etc. (optional)
        <input className={control} name={`${prefix}.line2`} autoComplete={`${prefix} address-line2`} maxLength={200} placeholder="Apartment, floor or landmark" defaultValue={defaults?.line2} />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className={label}>City
          <input className={control} name={`${prefix}.city`} autoComplete={`${prefix} address-level2`} required maxLength={100} placeholder="City" defaultValue={defaults?.city} />
        </label>
        <label className={label}>State
          <select className={cx(control, "cursor-pointer")} name={`${prefix}.stateCode`} autoComplete={`${prefix} address-level1`} required defaultValue={defaults?.stateCode ?? ""}>
            <option value="" disabled>Select state</option>
            {indiaStates.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </label>
        <label className={label}>PIN code
          <input className={control} name={`${prefix}.pincode`} autoComplete={`${prefix} postal-code`} inputMode="numeric" required pattern="[1-9][0-9]{5}" maxLength={6} placeholder="6-digit PIN" defaultValue={defaults?.pincode} />
        </label>
      </div>
    </>
  );
}

const pickup = (methodLabel: string) => /pick ?up|store|showroom/i.test(methodLabel);

/**
 * The checkout's details step after frame 30:492: contact, delivery and payment on the left, the order on the right.
 * The frame's promo code, newsletter box and account sign-in have nothing behind them on this store yet, so they are
 * left out; payment is Razorpay's hosted window, opened after the total is confirmed on the next step.
 */
export function CheckoutDetails({ id, input, options, deliveryMethodId, onDeliveryMethod, sameBilling, onSameBilling, problems, notice, busy, enquiryHref, onSubmit }: {
  id: string;
  input: CheckoutInput | null;
  options: CheckoutOptions;
  deliveryMethodId: string;
  onDeliveryMethod: (id: string) => void;
  sameBilling: boolean;
  onSameBilling: (value: boolean) => void;
  problems: string[];
  notice: string;
  busy: boolean;
  /** Set when the courier could not price this pincode: the buyer may ask for a quote or try another address. */
  enquiryHref?: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { cart, cartReady, setQuantity } = useShop();
  const [first, ...rest] = (input?.customer.name ?? "").split(" ");
  return (
    <div className="mx-auto grid max-w-[1176px] wide:max-w-[75vw] gap-12 font-text lg:grid-cols-[minmax(0,668px)_minmax(0,444px)] lg:justify-between lg:gap-16">
      <form className="checkout-form flex min-w-0 flex-col gap-8" onSubmit={onSubmit} noValidate aria-describedby={`${id}-note`}>
        <Section number="01" title="Contact details">
          <p className="m-0 text-[13px] leading-[19px] text-[#756d68]">Checkout as a guest</p>
          <label className={label}>Email address
            <input className={control} name="email" type="email" autoComplete="email" autoCapitalize="off" spellCheck={false} required maxLength={254} placeholder="you@example.com" defaultValue={input?.customer.email} />
          </label>
        </Section>
        <hr className="m-0 h-px border-0 bg-[#e5dfda]" />
        <Section number="02" title="Delivery details">
          <label className={label}>Country / Region
            <input className={cx(control, "bg-[#f8f6f2]")} value="India" readOnly aria-readonly="true" tabIndex={-1} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>First name
              <input className={control} name="firstName" autoComplete="given-name" required maxLength={60} placeholder="First name" defaultValue={first} />
            </label>
            <label className={label}>Last name
              <input className={control} name="lastName" autoComplete="family-name" maxLength={60} placeholder="Last name" defaultValue={rest.join(" ")} />
            </label>
          </div>
          <AddressFields prefix="shipping" defaults={input?.shippingAddress} />
          <div className="flex flex-col gap-2">
            <label className={label}>Mobile number
              <span className="flex h-[50px] items-center rounded-[8px] border border-solid border-[#e5dfda] bg-white pl-[15px] focus-within:border-maple">
                <span aria-hidden="true" className="text-[14px] text-[#756d68]">+91</span>
                <input className="h-full w-full rounded-[8px] border-0 bg-transparent px-2.5 text-[14px] font-normal text-[#1c1c1c] outline-none placeholder:text-[#756d68]" name="phone" type="tel" autoComplete="tel-national" inputMode="tel" required maxLength={16} placeholder="Mobile number" defaultValue={input?.customer.phone?.replace(/^\+91/, "")} />
              </span>
            </label>
            <p className={muted}>Used only for order updates and delivery coordination.</p>
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 text-[13px] leading-[19px] text-[#756d68]">
            <input type="checkbox" name="sameBilling" checked={sameBilling} onChange={(event) => onSameBilling(event.currentTarget.checked)} className="size-[18px] shrink-0 cursor-pointer accent-maple" />
            Billing address is the same as delivery address.
          </label>
          {!sameBilling && (
            <div className="flex flex-col gap-5 rounded-[10px] border border-solid border-[#e5dfda] p-4">
              <p className="m-0 text-[14px] leading-5 font-medium text-[#1c1c1c]">Billing address</p>
              <AddressFields prefix="billing" defaults={input?.billingAddress} />
            </div>
          )}
          <div role="radiogroup" aria-labelledby={`${id}-method`} className="flex flex-col gap-3">
            <p id={`${id}-method`} className="m-0 text-[14px] leading-5 font-medium text-[#1c1c1c]">How would you like to receive your order?</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {options.deliveryMethods.map((method) => {
                const chosen = deliveryMethodId === method.id;
                return (
                  <label key={method.id} className={cx("flex cursor-pointer flex-col gap-2 rounded-[10px] border border-solid p-4", chosen ? "border-maple bg-[#f5ece9]" : "border-[#e5dfda] bg-white")}>
                    <span className="flex items-center gap-3 text-[14px] leading-5 font-medium text-[#1c1c1c]">
                      <input type="radio" name="deliveryMethodId" value={method.id} checked={chosen} onChange={() => onDeliveryMethod(method.id)} className="size-[18px] shrink-0 cursor-pointer accent-maple" />
                      {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
                      <img src={pickup(method.label) ? "/checkout/pin.svg" : "/checkout/truck.svg"} alt="" width={20} height={20} className="size-5" />
                      {method.label}
                    </span>
                    <span className={muted}>{pickup(method.label) ? "Maple Furnishers showroom, Kirti Nagar, New Delhi" : "Timing and charges are confirmed with your PIN on the next step."}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </Section>
        <hr className="m-0 h-px border-0 bg-[#e5dfda]" />
        <Section number="03" title="Payment">
          <p className="m-0 text-[14px] leading-5 text-[#756d68]">Choose how you’d like to pay.</p>
          <div className="flex flex-col gap-2 rounded-[10px] border border-solid border-maple bg-[#f5ece9] p-4">
            <span className="flex items-center gap-3 text-[14px] leading-5 font-medium text-[#1c1c1c]">
              <span aria-hidden="true" className="grid size-[18px] place-items-center rounded-full border-[1.5px] border-solid border-maple"><span className="size-2.5 rounded-full bg-maple" /></span>
              {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
              <img src="/checkout/card.svg" alt="" width={20} height={20} className="size-5" />
              Pay online
            </span>
            <span className={muted}>UPI, credit / debit card or net banking</span>
            <ul aria-label="Ways to pay" className="m-0 flex list-none flex-wrap gap-2 p-0">
              {["UPI", "VISA", "Mastercard", "Net banking"].map((way) => (
                <li key={way} className="min-w-16 rounded-[5px] bg-white px-4 py-[7px] text-center text-[11px] leading-4 font-medium text-[#1c1c1c]">{way}</li>
              ))}
            </ul>
          </div>
          <p className="m-0 flex items-center gap-2 text-[12px] leading-[17px] text-[#756d68]">
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
            <img src="/checkout/lock.svg" alt="" width={16} height={16} className="size-4" />
            Your payment details are encrypted and securely processed by Razorpay.
          </p>
          {problems.length > 0 && <p className="m-0 text-[13px] font-medium text-maple" role="alert">Please check: {problems.join(", ")}.</p>}
          {notice && <p className="m-0 text-[13px] font-medium text-maple" role="alert">{notice}</p>}
          {enquiryHref && (
            <Link data-checkout-enquiry href={enquiryHref} data-fill-button=""
              className="block w-full rounded-[28px] bg-maple px-5 py-4 text-center text-[15px] leading-[22px] font-semibold text-white no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple">
              Ask for a delivery quote
            </Link>
          )}
          <button type="submit" data-fill-button={enquiryHref ? "outline" : ""} disabled={busy || !cartReady}
            className={cx("w-full cursor-pointer rounded-[28px] px-5 py-4 text-[15px] leading-[22px] font-semibold disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple",
              enquiryHref ? "border border-solid border-maple bg-white text-maple" : "border-0 bg-maple text-white")}>
            {busy ? "Confirming prices…" : enquiryHref ? "Try another address" : "Continue to secure payment →"}
          </button>
          <p className={muted}>
            By continuing, you agree to our <Link href="/policies/terms-of-service" className="text-[#756d68] underline">Terms of Service</Link> and <Link href="/policies/privacy-policy" className="text-[#756d68] underline">Privacy Policy</Link>.
          </p>
          <p id={`${id}-note`} className={muted}>Your total, delivery and GST are confirmed on the next step. No payment is taken until you pay there.</p>
        </Section>
      </form>
      <aside data-checkout-summary aria-live="polite" className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-6 lg:self-start">
        <div className="flex flex-col gap-6 rounded-[16px] bg-[#f8f6f2] p-6 sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <h2 className="m-0 text-[23px] leading-[33px] font-medium text-[#1c1c1c]">Your order</h2>
            <p className="m-0 text-[13px] leading-[19px] text-[#756d68]">{cartReady ? `${cart.itemCount} ${cart.itemCount === 1 ? "item" : "items"}` : "Loading…"}</p>
          </div>
          {cartReady ? (
            <>
              <ul className="m-0 flex list-none flex-col gap-5 p-0">
                {cart.items.map((item) => (
                  <li key={item.variantId} className="flex items-center gap-5">
                    <span className="relative h-[140px] w-[112px] shrink-0 overflow-hidden rounded-[8px] bg-cream [&_img]:object-cover">
                      <ProductImage src={item.image || undefined} alt={item.title} fill sizes="112px" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-2">
                      <span className="text-[18px] leading-[26px] font-medium text-[#1c1c1c]">{item.title}</span>
                      {item.variantTitle && item.variantTitle !== "Default Title" && <span className="text-[12px] leading-[17px] text-[#756d68]">{item.variantTitle}</span>}
                      {item.stockPolicy === "made_to_order" && item.leadTimeDays ? <span data-lead-time className="text-[12px] leading-[17px] text-[#756d68]">Made to order: allow {item.leadTimeDays} days for making</span> : null}
                      <span className="text-[16px] leading-[23px] font-semibold text-maple">{shopMoney(item.pricePaise)}</span>
                      <span className="flex items-center justify-between gap-3">
                        <span className="inline-flex h-7 items-center gap-1 rounded-full border border-solid border-maple/8 px-1 text-[12px] text-maple">
                          <button type="button" aria-label={`One fewer ${item.title}`} disabled={item.quantity <= 1} onClick={() => void setQuantity(item.variantId, item.quantity - 1)} className="grid size-5 cursor-pointer place-items-center rounded-full border-0 bg-[rgba(86,60,73,0.04)] p-0 text-maple disabled:opacity-40">−</button>
                          <output aria-label={`Quantity of ${item.title}`} className="min-w-5 text-center tabular-nums">{item.quantity}</output>
                          <button type="button" aria-label={`One more ${item.title}`} disabled={item.quantity >= 20} onClick={() => void setQuantity(item.variantId, item.quantity + 1)} className="grid size-5 cursor-pointer place-items-center rounded-full border-0 bg-[rgba(86,60,73,0.04)] p-0 text-maple disabled:opacity-40">+</button>
                        </span>
                        <Link href="/cart" className="text-[12px] leading-[17px] font-medium text-maple underline">Edit bag</Link>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <hr className="m-0 h-px border-0 bg-[#e5dfda]" />
              <dl className="m-0 flex flex-col gap-3.5 text-[14px] leading-5">
                <div className="flex justify-between gap-4"><dt className="text-[#756d68]">Subtotal</dt><dd className="m-0 font-medium text-[#1c1c1c]">{shopMoney(cart.subtotalPaise)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-[#756d68]">Delivery</dt><dd className="m-0 font-medium text-[#1c1c1c]">Confirmed with your PIN</dd></div>
              </dl>
              <hr className="m-0 h-px border-0 bg-[#e5dfda]" />
              <div className="flex items-center justify-between gap-4">
                <span className="font-heading text-[20px] leading-[29px] font-medium text-[#1c1c1c]">Total</span>
                <span className="font-heading text-[24px] leading-[35px] font-medium text-maple">{shopMoney(cart.subtotalPaise)}</span>
              </div>
              <p className={muted}>Before delivery and GST, which are confirmed on the next step before payment.</p>
            </>
          ) : (
            <p className={muted}>Loading your saved cart…</p>
          )}
        </div>
        <ul className="m-0 flex list-none flex-col gap-[18px] rounded-[12px] border border-solid border-[#e5dfda] p-6">
          {[["care-truck", "Care, all the way home", "Delivery coordinated around your order."], ["shield", "Made for everyday living", "Thoughtful details. Lasting comfort."]].map(([icon, title, line]) => (
            <li key={icon} className="flex items-center gap-3.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
              <img src={`/checkout/${icon}.svg`} alt="" width={24} height={24} className="size-6 shrink-0" />
              <span className="flex flex-col gap-[3px]">
                <strong className="text-[14px] leading-5 font-medium text-[#1c1c1c]">{title}</strong>
                <span className={muted}>{line}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3 pl-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
          <img src="/checkout/chat.svg" alt="" width={24} height={24} className="size-6 shrink-0" />
          <span className="flex flex-col gap-1">
            <span className="text-[14px] leading-5 font-medium text-[#1c1c1c]">A little help before you decide?</span>
            <Link href="/pages/contact" className="text-[13px] leading-[19px] font-medium text-maple underline">Speak with the Maple team ↗</Link>
          </span>
        </div>
      </aside>
    </div>
  );
}
