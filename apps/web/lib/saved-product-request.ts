import { productSchema } from "@shopmaple/contracts";
import { toProductCard } from "./product-card-model";

/** Bound both headers and body, even when transport does not honor cancellation. */
export async function requestSavedProduct(handle: string, signal: AbortSignal) {
  const transport = new AbortController();
  let cancel!: () => void;
  const interrupted = new Promise<never>((_resolve, reject) => {
    cancel = () => {
      reject(new Error("Saved furniture unavailable"));
      transport.abort();
    };
  });
  signal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, 6000);
  try {
    if (signal.aborted) cancel();
    return await Promise.race([
      (async () => {
        if (transport.signal.aborted) throw new Error("Saved furniture unavailable");
        const response = await fetch("/api/products/" + encodeURIComponent(handle), {
          signal: transport.signal,
        });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error("Saved furniture unavailable");
        const product = productSchema.parse(await response.json());
        if (product.handle !== handle || !product.published)
          throw new Error("Saved furniture unavailable");
        return toProductCard(product);
      })(),
      interrupted,
    ]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}
