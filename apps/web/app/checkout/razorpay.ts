/** Hosted Razorpay Checkout hand-off. The browser only ever sees the public key
 * id and the server-created order; the store verifies every capture with Razorpay. */
export interface HostedPaymentOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: "INR";
  name: string;
  description?: string;
  prefill: { name: string; email: string; contact: string };
  notes?: Record<string, string>;
  theme?: { color: string };
  /** Seconds before the window closes itself; set so it never outlives the stock hold. */
  timeout?: number;
  handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;
  /** Called when the window closes without a payment: closed by the buyer, or timed out. */
  modal: { ondismiss: () => void };
}
/** One failed try (Standard Checkout's `payment.failed`). The window stays open for another; `modal.ondismiss` follows
 * only when it closes. */
export interface HostedPaymentFailure {
  error: {
    code?: string;
    description?: string;
    source?: string;
    step?: string;
    reason?: string;
    metadata?: { order_id?: string; payment_id?: string };
  };
}
/** The events the store listens for on a Razorpay instance, by name. */
export interface HostedPaymentEvents {
  "payment.failed": HostedPaymentFailure;
}
export interface HostedPayment {
  open(): void;
  on<Event extends keyof HostedPaymentEvents>(event: Event, handler: (response: HostedPaymentEvents[Event]) => void): void;
}
type RazorpayConstructor = new (options: HostedPaymentOptions) => HostedPayment;
declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}
const scriptUrl = "https://checkout.razorpay.com/v1/checkout.js";
let loading: Promise<RazorpayConstructor> | null = null;

export function loadHostedPayment(): Promise<RazorpayConstructor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  loading ??= new Promise<RazorpayConstructor>((resolve, reject) => {
    const finish = () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error("Payment provider unavailable"));
    };
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Payment provider unavailable")), { once: true });
    if (!existing) {
      script.src = scriptUrl;
      script.async = true;
      document.head.appendChild(script);
    }
  }).finally(() => {
    loading = null;
  });
  return loading;
}

/** Open Razorpay's window for a server-created order; `onFailure` hears each failed try while it stays open. */
export async function openHostedPayment(options: HostedPaymentOptions, { onFailure }: { onFailure?: (failure: HostedPaymentFailure) => void } = {}) {
  const Provider = await loadHostedPayment();
  const checkout = new Provider(options);
  if (onFailure) checkout.on("payment.failed", onFailure);
  checkout.open();
}
