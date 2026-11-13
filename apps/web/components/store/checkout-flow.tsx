"use client";
import { checkoutRequestSchema, type CheckoutRequest } from "@shopmaple/contracts";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { z } from "zod";
import { useShop } from "@/components/shop-provider";
import { CheckoutClosed } from "@/app/checkout/checkout-closed";
import {
  CheckoutClientError,
  createCheckoutClient,
  type CheckoutAccount,
  type CheckoutAttempt,
  type CheckoutOptions,
} from "@/app/checkout/checkout-client";
import { openHostedPayment } from "@/app/checkout/razorpay";
import { CheckoutDetails, type CheckoutDefaults } from "./checkout-details";
import { PaymentFailure, PaymentPending, PaymentSuccess, type PaymentCheck, type PaymentShortfall, type ResultPhotos } from "./checkout-result";

type Stage =
  | { kind: "details" }
  | { kind: "resuming" }
  | { kind: "quote"; attempt: CheckoutAttempt }
  // Opened again from the failure screen (`retry`), the window keeps that screen behind it rather than the form.
  | { kind: "paying"; attempt: CheckoutAttempt; retry?: PaymentShortfall }
  // Razorpay's window closed without a payment: after a failed try, or with none. The attempt and its hold stay.
  | { kind: "failed"; attempt: CheckoutAttempt; reason: PaymentShortfall }
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
/** The form field a problem belongs to, and what to say there. The order's one name is asked as first and last name. */
const fieldOf = (path: string) =>
  path === "customer.name" ? "firstName" : path === "customer.email" ? "email" : path === "customer.phone" ? "phone"
    : path.replace(/^shippingAddress\./, "shipping.").replace(/^billingAddress\./, "billing.");
const fieldProblems: Record<string, string> = {
  email: "Enter a valid email address, such as name@example.com.",
  firstName: "Enter the name of the person receiving the delivery.",
  phone: "Enter a 10-digit mobile number.",
  line1: "Enter the house number, building and street.",
  line2: "Shorten the apartment or landmark line.",
  city: "Enter the city.",
  stateCode: "Choose the state.",
  pincode: "Enter the 6-digit PIN code.",
};
/** The details already entered win; otherwise a signed-in customer's contact and default address fill the form. */
function defaultsFrom(input: CheckoutRequest | null, account: CheckoutAccount | undefined): CheckoutDefaults | null {
  if (input) {
    const [firstName = "", ...rest] = input.customer.name.split(" ");
    return { email: input.customer.email, firstName, lastName: rest.join(" "), phone: input.customer.phone.replace(/^\+91/, ""),
      shipping: input.shippingAddress, billing: input.billingAddress };
  }
  const prefill = account?.prefill;
  if (!prefill) return null;
  const [firstName = "", ...rest] = prefill.name.trim().split(/\s+/);
  return { email: prefill.email, firstName, lastName: rest.join(" "), phone: prefill.phone.replace(/^\+91/, ""), shipping: prefill.address, billing: null };
}
const promoShape = "Codes are 3 to 24 letters and numbers, such as DIWALI15.";
const defaultConfirmationWindowMs = 150_000;
/** Below this much of the hold left, the buyer gets a fresh quote instead of a payment window. */
const minimumPayWindowMs = 60_000;
const storageKey = "maple-checkout-attempt-v1";
const storedAttemptSchema = z.object({
  attemptId: z.uuid(),
  input: checkoutRequestSchema,
  submitted: z.boolean(),
  // The pieces' photos for the result screens, as the cart showed them when payment started (capture empties it).
  // Anything malformed drops the photos, never the attempt.
  photos: z.record(z.string().max(200), z.string().min(1).max(2048)).optional().catch(undefined),
});
type StoredAttempt = z.infer<typeof storedAttemptSchema>;
function readStored(): StoredAttempt | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    return raw ? storedAttemptSchema.parse(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
function writeStored(value: StoredAttempt) {
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    /* Without storage a reload cannot resume; the server still refuses a second payable attempt. */
  }
}
function clearStored() {
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    /* Nothing to clear. */
  }
}
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
    // The form asks for first and last name (frame 30:492); the order keeps one name.
    customer: { name: [read("firstName"), read("lastName")].filter(Boolean).join(" "), email: read("email"), phone: read("phone").replace(/[\s-]/g, "") },
    shippingAddress: shipping,
    billingAddress: sameBilling ? shipping : address("billing"),
    deliveryMethodId: read("deliveryMethodId"),
  };
}
/** A message that takes the page's place: waiting, confirmation, review. The frame's step line stays above it. */
function Notice({ title, step = "checkout", children }: { title: string; step?: "checkout" | "confirmation"; children: ReactNode }) {
  return (
    <section data-checkout-state aria-live="polite" className="checkout-notice">
      <nav className="checkout-steps" aria-label="Checkout steps">
        <ol>
          <li><Link href="/cart">Bag</Link></li>
          <li aria-current={step === "checkout" ? "step" : undefined}>Checkout</li>
          <li aria-current={step === "confirmation" ? "step" : undefined}>Confirmation</li>
        </ol>
      </nav>
      {/* After a change of screen (the payment received, a review), the heading takes focus, as a result screen's does. */}
      <h1 className="checkout-notice-title" tabIndex={-1} data-checkout-result-heading="">{title}</h1>
      {children}
    </section>
  );
}
const orderLink = (id: string) => (
  <Link className="account-cta" data-variant="quiet" data-fill-button="outline" href={`/orders/${id}`}>
    View order status
  </Link>
);

type FlowProps = {
  options: CheckoutOptions;
  /** Whether customer accounts are on, and who is signed in (their details fill the form). */
  account?: CheckoutAccount;
  pollIntervalMs?: number;
  confirmationWindowMs?: number;
};
/** Live checkout, as one page (Figma 394:1310): details → Keeri quote (Shiprocket delivery) → Razorpay → confirmation. */
export function CheckoutFlow(props: FlowProps) {
  const top = useRef<HTMLDivElement>(null);
  return (
    <div ref={top} data-store data-checkout className="scroll-mt-6 font-text">
      <CheckoutStages {...props} top={top} />
    </div>
  );
}
function CheckoutStages({
  options,
  account,
  pollIntervalMs = 2500,
  confirmationWindowMs = defaultConfirmationWindowMs,
  top,
}: FlowProps & { top: RefObject<HTMLDivElement | null> }) {
  const id = useId();
  const { cart, cartReady, recoverCart } = useShop();
  const client = useMemo(() => createCheckoutClient(), []);
  const [stage, setStage] = useState<Stage>({ kind: "details" });
  const [input, setInput] = useState<CheckoutRequest | null>(null);
  // "Send my order updates on WhatsApp": the buyer's consent, unticked until they tick it.
  const [whatsappUpdates, setWhatsappUpdates] = useState(false);
  const [sameBilling, setSameBilling] = useState(true);
  const [deliveryMethodId, setDeliveryMethodId] = useState(options.deliveryMethods[0]?.id ?? "");
  const [problems, setProblems] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // After "Edit details" the buyer stays where they were: focus goes to the form's button, not the top of the page.
  const focusPrimary = useRef(false);
  // The code as typed, and why it was refused; both live beside the code field on the details step.
  const [promoCode, setPromoCode] = useState("");
  const [promoError, setPromoError] = useState("");
  const [notice, setNotice] = useState("");
  // Shiprocket could not price delivery to the entered pincode: offer an enquiry instead.
  const [unpriced, setUnpriced] = useState(false);
  // The stock hold is too close to lapsing for a payment window: only a fresh quote may continue.
  const [requote, setRequote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(false);
  // Set the moment the provider reports the buyer completed payment; never cleared by a timeout.
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);
  // The pending screen's "Check payment status": a check under way, what the last one found, and a count whose change
  // starts the confirmation watch afresh.
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<PaymentCheck | null>(null);
  const [checks, setChecks] = useState(0);
  const checkRequested = useRef(false);
  // The pieces' photos by variant id, kept from the cart when payment starts: capture empties the cart.
  const [photos, setPhotos] = useState<ResultPhotos>({});
  const [now, setNow] = useState(() => Date.now());
  const resumed = useRef(false);
  const confirmingId = stage.kind === "confirming" ? stage.attempt.id : null;
  // The quote and the failure screen both leave a payable attempt that another tab, or a late capture, may complete.
  const watchingId = (stage.kind === "quote" || stage.kind === "failed") && stage.attempt.state === "awaiting_payment" ? stage.attempt.id : null;
  const settledId = stage.kind === "confirmed" || (stage.kind === "review" && (paid || stage.attempt.paid)) ? stage.attempt.id : null;
  const quoteExpiry = stage.kind === "quote" && stage.attempt.quote ? Date.parse(stage.attempt.quote.expiresAt) : null;
  const expired = requote || (quoteExpiry !== null && quoteExpiry <= now);
  // A payment the buyer made that the store has not confirmed: the pending screen (Figma 459:1337), while the checkout
  // watches for it and after its watch ran out. Money the store already has, or a hold that lapsed, gets a notice instead.
  const showsPending =
    (stage.kind === "confirming" && !paid) ||
    (stage.kind === "review" && stage.reason === "timeout" && paymentSubmitted && !paid && !stage.attempt.paid && stage.attempt.state !== "paid_hold_lapsed");
  // What the page shows, finer than the stage: the pending screen spans confirming and a timed-out review, and confirming
  // shows the "Payment received" notice once the store has the money.
  const screen = showsPending ? "pending" : stage.kind === "confirming" ? "received" : stage.kind;

  function fail(error: unknown) {
    if (error instanceof CheckoutClientError && error.kind === "closed") {
      setStage({ kind: "closed" });
      return;
    }
    if (error instanceof CheckoutClientError && error.kind === "promo") {
      setPromoError(error.message);
      return;
    }
    setUnpriced(error instanceof CheckoutClientError && error.kind === "unpriced");
    setNotice(
      error instanceof CheckoutClientError
        ? error.message
        : "We couldn't complete that step. Please try again. No payment has been taken.",
    );
  }
  /** Walk away from an attempt: free its hold if one exists and forget its idempotency key. */
  async function leaveAttempt(attempt: CheckoutAttempt | null) {
    clearStored();
    if (!attempt) return;
    client.forgetKey();
    if (attempt.state !== "awaiting_payment") return;
    try {
      await client.release(attempt.id);
    } catch {
      /* The server quarantines an uncertain release; the hold otherwise lapses on its own. */
    }
  }
  async function requestQuote(data: CheckoutRequest, fresh: boolean) {
    setBusy(true);
    setNotice("");
    setPromoError("");
    setUnpriced(false);
    setRequote(false);
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
    const form = event.currentTarget;
    const code = promoCode.trim();
    const parsed = checkoutRequestSchema.safeParse({
      ...readForm(form, sameBilling),
      ...(code ? { promoCode: code } : {}),
      ...(options.whatsappOrderUpdates && whatsappUpdates ? { whatsappOrderUpdates: true } : {}),
    });
    if (!parsed.success) {
      // With billing the same as delivery, a delivery problem is not repeated as a billing one.
      const issues = parsed.error.issues.filter((issue) => issue.path[0] !== "promoCode" && !(sameBilling && issue.path[0] === "billingAddress"));
      setPromoError(parsed.error.issues.some((issue) => issue.path[0] === "promoCode") ? promoShape : "");
      setProblems([...new Set(issues.map((issue) => fieldLabels[issue.path.join(".")] ?? "Your details"))]);
      const found: Record<string, string> = {};
      for (const issue of issues) {
        const field = fieldOf(issue.path.join("."));
        const message = fieldProblems[field.replace(/^(shipping|billing)\./, "")];
        if (message && !found[field]) found[field] = message;
      }
      setFieldErrors(found);
      // Focus the first problem in the order the form asks; a code alone that is malformed takes the focus.
      const first = [...form.elements].find((element) => element instanceof HTMLElement && "name" in element && typeof element.name === "string" && found[element.name]);
      ((first ?? (issues.length ? null : form.elements.namedItem("promoCode"))) as HTMLElement | null | undefined)?.focus();
      return;
    }
    setProblems([]);
    setFieldErrors({});
    setInput(parsed.data);
    await requestQuote(parsed.data, false);
  }
  /** Open Razorpay's window for the attempt; `retry` is set when the buyer tries again from the failure screen. */
  async function pay(attempt: CheckoutAttempt, retry?: PaymentShortfall) {
    if (!input) return;
    setBusy(true);
    setNotice("");
    const pictured = Object.fromEntries(cart.items.filter((item) => item.image).map((item) => [item.variantId, item.image]));
    if (Object.keys(pictured).length > 0) setPhotos((current) => ({ ...current, ...pictured }));
    try {
      const ready = await client.paymentOrder(attempt.id);
      if (!ready.providerOrderId)
        throw new CheckoutClientError("blocked", "This checkout requires review. Check your order status before trying another payment.");
      // The server's own count wins: a buyer's clock may be minutes off.
      const holdLeftMs =
        typeof ready.payWithinSeconds === "number"
          ? ready.payWithinSeconds * 1000
          : ready.payBy
            ? Date.parse(ready.payBy) - Date.now()
            : null;
      if (holdLeftMs !== null && holdLeftMs < minimumPayWindowMs) {
        // A payment window that outlived the stock hold could take money for goods no longer held.
        setStage({ kind: "quote", attempt: ready });
        setRequote(true);
        setNotice("Your reserved stock is about to be released. Get a new quote to continue. No payment has been taken.");
        return;
      }
      setStage({ kind: "paying", attempt: ready, retry });
      // Standard Checkout keeps its window open after a failed try so the buyer can try again there. Whether one failed
      // decides what its closing shows: "Payment failed", or "Payment not completed" when the buyer closed it untried.
      let failedTry = false;
      await openHostedPayment({
        key: options.paymentKeyId,
        order_id: ready.providerOrderId,
        amount: ready.amountPaise,
        currency: "INR",
        name: "Maple Furnishers",
        description: `${cart.itemCount} ${cart.itemCount === 1 ? "item" : "items"}`,
        prefill: { name: input.customer.name, email: input.customer.email, contact: input.customer.phone },
        theme: { color: "#80241c" },
        ...(holdLeftMs !== null ? { timeout: Math.floor(holdLeftMs / 1000) } : {}),
        handler: (signed) => {
          setPaid(false);
          setPaymentSubmitted(true);
          setStage({ kind: "confirming", attempt: ready });
          // The store verifies the signature and the capture itself; the webhook is the fallback.
          void client.paymentCallback(ready.id, signed).catch(() => {});
        },
        modal: {
          ondismiss: () => {
            setStage((current) => (current.kind === "paying" ? { kind: "failed", attempt: ready, reason: failedTry ? "failed" : "dismissed" } : current));
          },
        },
      }, { onFailure: () => { failedTry = true; } });
    } catch (error) {
      // Keeri refused the hold for the code (the offer stopped, or this customer used it meanwhile). Nothing is held
      // and the attempt is over: back to the details, with the reason beside the code to change or remove.
      if (error instanceof CheckoutClientError && error.kind === "promo") {
        setStage({ kind: "details" });
        setPromoError(error.message);
        void leaveAttempt(attempt);
        return;
      }
      setStage((current) => (current.kind === "paying" ? (retry ? { kind: "failed", attempt, reason: retry } : { kind: "quote", attempt }) : current));
      if (error instanceof CheckoutClientError) fail(error);
      else setNotice("The payment window couldn't be opened. Please try again. No payment has been taken.");
    } finally {
      setBusy(false);
    }
  }
  /** Quote again without the code: the old attempt is left (its hold freed) and the next quote gets a new key. */
  function removeCode(previous: CheckoutAttempt) {
    if (!input) return;
    const rest = { ...input };
    delete rest.promoCode;
    setPromoCode("");
    setInput(rest);
    setStage({ kind: "details" });
    void leaveAttempt(previous).then(() => requestQuote(rest, true));
  }
  // The quote and the payment window fill in the same page, where the buyer is. A message that replaces the page
  // (pending, received, confirmed, failed, review, closed) starts them at its top. The pending screen is one screen while
  // its watch runs out and is asked again (confirming ↔ timed-out review): the buyer stays where they are, on the button
  // they pressed.
  const shown = useRef(screen);
  useEffect(() => {
    if (shown.current === screen) return;
    shown.current = screen;
    if (screen !== "pending") setLastCheck(null);
    if (!["resuming", "details", "quote", "paying"].includes(screen)) top.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    if (screen === "details" && focusPrimary.current) {
      focusPrimary.current = false;
      top.current?.querySelector<HTMLElement>("[data-checkout-primary]")?.focus();
    }
    // A result screen follows Razorpay's window, whose closing leaves focus nowhere, and a notice that replaces the
    // pending screen (the payment received, a review) replaces what had focus: the new heading takes it.
    if (["confirmed", "failed", "pending", "received", "review"].includes(screen))
      top.current?.querySelector<HTMLElement>("[data-checkout-result-heading]")?.focus({ preventScroll: true });
  }, [screen, top]);
  useEffect(() => {
    if (quoteExpiry === null || quoteExpiry <= now) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(quoteExpiry - now + 50, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [quoteExpiry, now]);
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    const stored = readStored();
    if (!stored) return;
    let cancelled = false;
    setInput(stored.input);
    if (stored.photos) setPhotos(stored.photos);
    setPromoCode(stored.input.promoCode ?? "");
    setWhatsappUpdates(stored.input.whatsappOrderUpdates === true);
    setStage({ kind: "resuming" });
    void (async () => {
      try {
        const current = await client.status(stored.attemptId);
        if (cancelled) return;
        const quoteLive = current.quote ? Date.parse(current.quote.expiresAt) > Date.now() : false;
        if (current.paid || current.state === "captured" || (current.state === "awaiting_payment" && stored.submitted)) {
          if (current.paid) setPaid(true);
          setPaymentSubmitted(stored.submitted || current.paid);
          setStage({ kind: "confirming", attempt: current });
        } else if (current.state === "reconciliation_required") {
          setStage({ kind: "review", attempt: current, reason: "review" });
        } else if (current.state === "awaiting_payment" || (current.state === "reservation_required" && quoteLive)) {
          setNow(Date.now());
          setStage({ kind: "quote", attempt: current });
        } else {
          clearStored();
          setStage({ kind: "details" });
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof CheckoutClientError && error.kind === "closed") setStage({ kind: "closed" });
        else {
          clearStored();
          setStage({ kind: "details" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);
  useEffect(() => {
    // The failure screen keeps the attempt too: a reload resumes it at the quote, never at a second payment. So does a
    // payment whose confirmation outlasted the watch: a reload comes back to it (the pending screen), never to a fresh
    // checkout with the cart still full.
    const outlasted = stage.kind === "review" && stage.reason === "timeout" && (paymentSubmitted || paid || stage.attempt.paid);
    if (stage.kind === "quote" || stage.kind === "paying" || stage.kind === "failed" || stage.kind === "confirming" || outlasted) {
      if (input) writeStored({ attemptId: stage.attempt.id, input, submitted: paymentSubmitted, photos });
    } else if (stage.kind !== "resuming") clearStored();
  }, [stage, input, paymentSubmitted, paid, photos]);
  useEffect(() => {
    // Capture empties the saved cart server-side; show that rather than the pre-order lines.
    if (settledId) void recoverCart();
  }, [settledId, recoverCart]);
  useEffect(() => {
    // A payable attempt may be completed in another tab or window; keep watching it quietly.
    if (!watchingId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + confirmationWindowMs;
    const tick = async () => {
      if (cancelled) return;
      try {
        const current = await client.status(watchingId);
        if (cancelled) return;
        if (current.paid || current.state === "captured") {
          setPaid(true);
          setPaymentSubmitted(true);
          setStage({ kind: "confirming", attempt: current });
          return;
        }
        if (current.state === "reconciliation_required") {
          setStage({ kind: "review", attempt: current, reason: "review" });
          return;
        }
      } catch {
        /* Transient; the buyer can still act on the page. */
      }
      if (Date.now() < deadline) timer = setTimeout(() => void tick(), Math.max(pollIntervalMs, 1000));
    };
    timer = setTimeout(() => void tick(), Math.max(pollIntervalMs, 1000));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [watchingId, client, pollIntervalMs, confirmationWindowMs]);
  useEffect(() => {
    if (!confirmingId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + confirmationWindowMs;
    // A check the buyer asked for is answered by the next reply, or the next failure to get one. "Still awaiting
    // confirmation" is said only when the store answered that; a reply that moves the page on needs no answer.
    const settle = (outcome: PaymentCheck["outcome"] | null) => {
      if (!checkRequested.current) return;
      checkRequested.current = false;
      setChecking(false);
      setLastCheck(outcome ? { at: new Date(), outcome } : null);
    };
    const tick = async () => {
      if (cancelled) return;
      try {
        const current = await client.status(confirmingId);
        if (cancelled) return;
        if (current.paid) setPaid(true);
        if (current.fulfillmentStatus === "confirmed" && current.orderReference) {
          settle(null);
          setStage({ kind: "confirmed", attempt: current });
          return;
        }
        if (current.fulfillmentStatus === "review_required" || current.state === "reconciliation_required") {
          settle(null);
          setStage({ kind: "review", attempt: current, reason: "review" });
          return;
        }
        settle(current.paid ? null : "pending");
      } catch (error) {
        if (cancelled) return;
        if (error instanceof CheckoutClientError && error.kind === "closed") {
          settle(null);
          setStage({ kind: "closed" });
          return;
        }
        settle("error");
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
    // `checks` changes when the buyer asks again: the watch starts afresh, with a check at once and a new window.
  }, [confirmingId, checks, client, pollIntervalMs, confirmationWindowMs]);
  /** "Check payment status" on the pending screen: ask the store now, and watch for confirmation for another window. */
  function checkAgain(attempt: CheckoutAttempt) {
    checkRequested.current = true;
    setChecking(true);
    if (stage.kind === "confirming") setChecks((count) => count + 1);
    else setStage({ kind: "confirming", attempt });
  }

  if (stage.kind === "closed") return <CheckoutClosed />;
  if (stage.kind === "resuming")
    return (
      <Notice title="One moment">
        <p role="status" className="account-muted">Checking your checkout…</p>
      </Notice>
    );
  // The result screens picture each piece as the cart showed it when payment started, else as it shows it now.
  const resultPhotos = (): ResultPhotos => ({
    ...Object.fromEntries(cart.items.filter((item) => item.image).map((item) => [item.variantId, item.image])),
    ...photos,
  });
  if (stage.kind === "confirmed")
    return (
      <PaymentSuccess attempt={stage.attempt} customer={input ? { name: input.customer.name, email: input.customer.email } : null}
        photos={resultPhotos()} signedIn={Boolean(account?.prefill)} />
    );
  const failure = (payable: CheckoutAttempt, shortfall: PaymentShortfall) => (
    <PaymentFailure attempt={payable} reason={shortfall} photos={resultPhotos()} busy={busy || stage.kind === "paying"} notice={notice}
      onRetry={() => void pay(payable, shortfall)} onChooseMethod={() => void pay(payable, shortfall)} />
  );
  if (stage.kind === "failed") return failure(stage.attempt, stage.reason);
  // Behind a window opened again from the failure screen, that screen stays, its buttons waiting.
  if (stage.kind === "paying" && stage.retry) return failure(stage.attempt, stage.retry);
  // A payment made but not yet confirmed (Figma 459:1337), while the checkout watches for it and after its watch ran out.
  const pending = (attempt: CheckoutAttempt) => (
    <PaymentPending attempt={attempt} photos={resultPhotos()} checking={checking} lastCheck={lastCheck} watching={stage.kind === "confirming"}
      onCheck={() => checkAgain(attempt)} />
  );
  if (stage.kind === "review") {
    const received = paid || stage.attempt.paid;
    const submitted = received || paymentSubmitted;
    const lapsed = stage.attempt.state === "paid_hold_lapsed";
    if (showsPending) return pending(stage.attempt);
    return (
      <Notice
        title={received ? "Your payment has been received" : submitted ? "Your payment is still being confirmed" : "This checkout needs a check"}
      >
        <p className="checkout-notice-text">
          {lapsed
            ? "We couldn't hold your piece in time, so our team is confirming your order by hand. We'll contact you within one business day, and if we can't confirm it we'll refund in full. You don't need to pay again."
            : stage.reason === "timeout"
              ? "We're still confirming your payment and order with our team. This can take a few minutes, and you don't need to pay again."
              : received
                ? "Our team is reviewing this order before confirming it. You don't need to pay again."
                : submitted
                  ? "Our team is checking this payment and order. You don't need to pay again."
                  : "Our team needs to review this checkout before payment can continue. No payment has been taken."}
        </p>
        <p className="checkout-notice-text">
          {stage.attempt.orderNumber ? <>Your order number is <strong>{stage.attempt.orderNumber}</strong>. </> : null}
          Your checkout reference is <strong>{stage.attempt.id}</strong>. Quote it if you contact us.
        </p>
        <div className="account-buttons">
          {submitted && orderLink(stage.attempt.id)}
          <Link className="account-cta" data-fill-button="" href="/contact">
            Contact our team
          </Link>
          <Link className="account-cta" data-variant="quiet" data-fill-button="outline" href="/cart">
            Return to cart
          </Link>
        </div>
      </Notice>
    );
  }
  if (stage.kind === "confirming") {
    if (showsPending) return pending(stage.attempt);
    return (
      <Notice title="Payment received">
        <p role="status" className="checkout-notice-text">Confirming your order with our team. This usually takes a moment.</p>
      </Notice>
    );
  }
  if (stage.kind === "details" && cartReady && cart.items.length === 0)
    return (
      <Notice title="Your cart is empty">
        <p className="checkout-notice-text">Add a piece to your cart before checking out.</p>
        <div className="account-buttons">
          <Link href="/collections/all" className="account-cta" data-fill-button="">
            Explore furniture
          </Link>
        </div>
      </Notice>
    );
  const purchasable = !cartReady || (cart.subtotalPaise !== null && cart.items.every((item) => item.cartable));
  if (stage.kind === "details" && !purchasable)
    return (
      <Notice title="Some items need confirmation first">
        <p className="checkout-notice-text">One or more items in your cart need a price or availability check before online payment.</p>
        <div className="account-buttons">
          <Link href="/cart" className="account-cta" data-fill-button="">
            Review your cart
          </Link>
          <Link href="/contact" className="account-cta" data-variant="quiet" data-fill-button="outline">
            Ask about these items
          </Link>
        </div>
      </Notice>
    );
  const enquiryHref =
    "/contact?" +
    new URLSearchParams({
      topic: "Delivery quote",
      ...(input ? { pincode: input.shippingAddress.pincode } : {}),
      product: cart.items.map((item) => `${item.title} (${item.variantTitle}) × ${item.quantity}`).join("; ").slice(0, 500),
    });
  const attempt = stage.kind === "quote" || stage.kind === "paying" ? stage.attempt : null;
  return (
    <CheckoutDetails
      id={id}
      phase={stage.kind}
      defaults={defaultsFrom(input, account)}
      options={options}
      deliveryMethodId={attempt && input ? input.deliveryMethodId : deliveryMethodId}
      onDeliveryMethod={setDeliveryMethodId}
      sameBilling={sameBilling}
      onSameBilling={setSameBilling}
      whatsappUpdates={whatsappUpdates}
      onWhatsappUpdates={setWhatsappUpdates}
      fieldErrors={fieldErrors}
      problems={problems}
      notice={notice}
      busy={busy}
      enquiryHref={unpriced ? enquiryHref : null}
      account={account}
      attempt={attempt}
      expired={expired}
      promoCode={promoCode}
      onPromoCode={(code) => { setPromoCode(code); setPromoError(""); }}
      promoError={promoError}
      onRemoveCode={() => attempt && removeCode(attempt)}
      onSubmit={(event) => void submit(event)}
      onPay={() => attempt && void pay(attempt)}
      onRequote={() => {
        if (!input || !attempt) return;
        void leaveAttempt(attempt).then(() => requestQuote(input, true));
      }}
      onEdit={() => {
        if (!attempt) return;
        setNotice("");
        setRequote(false);
        focusPrimary.current = true;
        setStage({ kind: "details" });
        void leaveAttempt(attempt);
      }}
    />
  );
}
