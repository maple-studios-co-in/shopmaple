import { cardHandle, parseCatalogueCard } from "./catalogue-responses";
import { isProductHandle } from "./recent-products";

/** Bound both headers and body, even when transport does not honor cancellation. */
export async function requestSavedProduct(handle: string, signal: AbortSignal) {
  if (!isProductHandle(handle)) throw new Error("Saved furniture unavailable");
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
        const response = await fetch("/api/catalogue/cards/" + encodeURIComponent(handle), {
          signal: transport.signal,
        });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error("Saved furniture unavailable");
        return parseCatalogueCard(await response.json(), cardHandle(response, handle));
      })(),
      interrupted,
    ]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}
