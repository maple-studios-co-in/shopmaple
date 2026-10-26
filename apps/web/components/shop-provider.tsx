"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import {
  cartMutationInputSchema,
  cartMutationResponseSchema,
  guardedCartSchema,
  type Cart,
  type CartMutationInput,
} from "@shopmaple/contracts";
const empty: Cart = {
  items: [],
  itemCount: 0,
  subtotalPaise: 0,
  currency: "INR",
  checkoutEnabled: false,
  mode: "preview",
};
type ShopState = {
  cart: Cart;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  busy: boolean;
  cartReady: boolean;
  error: string;
  setQuantity: (id: string, quantity: number) => Promise<boolean>;
  cartRecovery: "load" | "mutation" | null;
  checkingCart: boolean;
  recoverCart: () => Promise<void>;
  favourites: string[];
  toggleFavourite: (id: string) => void;
};
const Context = createContext<ShopState | null>(null);
const pendingStorageKey = "maple-cart-pending-v1";
const uncertainMessage = "We couldn't confirm your cart update. Check the update before making another change.";
const rejectedStatuses: Record<string, number> = {
  CART_SESSION_CHANGED: 409,
  CART_OPERATION_CONFLICT: 409,
  CART_REVISION_CONFLICT: 409,
  PRODUCT_NOT_FOUND: 404,
  ENQUIRY_REQUIRED: 409,
  CART_LIMIT: 409,
};
type PendingMutation = { variantId: string; input: CartMutationInput };

function readPending(): PendingMutation | null {
  const stored = window.sessionStorage.getItem(pendingStorageKey);
  if (!stored) return null;
  const value: unknown = JSON.parse(stored);
  if (!value || typeof value !== "object" || !("variantId" in value) ||
      typeof value.variantId !== "string" || value.variantId.length < 1 ||
      value.variantId.length > 160 || !("input" in value)) throw new Error();
  return { variantId: value.variantId, input: cartMutationInputSchema.parse(value.input) };
}

export function ShopProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart>(empty),
    [cartOpen, setCartOpen] = useState(false),
    [busy, setBusy] = useState(true),
    [cartReady, setCartReady] = useState(false),
    [error, setError] = useState(""),
    [cartRecovery, setCartRecovery] = useState<ShopState["cartRecovery"]>(null),
    [checkingCart, setCheckingCart] = useState(false);
  const cartRef = useRef<Cart>(empty),
    mutation = useRef(false),
    writesBlocked = useRef(true),
    ready = useRef(false),
    pending = useRef<PendingMutation | null>(null),
    epoch = useRef(0),
    requests = useRef(new Set<AbortController>());
  const [favourites, setFavourites] = useState<string[]>([]);

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const controller = new AbortController();
    requests.current.add(controller);
    let abort!: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(new Error("Cart request interrupted"));
      controller.signal.addEventListener("abort", abort, { once: true });
    });
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      return await Promise.race([
        (async () => {
          const response = await fetch(path, { ...init, cache: "no-store", signal: controller.signal });
          return { ok: response.ok, status: response.status, data: await response.json() as unknown };
        })(),
        cancelled,
      ]);
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", abort);
      requests.current.delete(controller);
    }
  }, []);

  const applyCart = useCallback((value: Cart) => {
    cartRef.current = value;
    setCart(value);
    ready.current = true;
    setCartReady(true);
  }, []);

  const loadCart = useCallback(async () => {
    const current = epoch.current;
    mutation.current = true;
    writesBlocked.current = true;
    setCheckingCart(true);
    setBusy(true);
    setError("");
    try {
      pending.current = readPending();
      const result = await request("/api/cart");
      if (!result.ok) throw new Error();
      const value = guardedCartSchema.parse(result.data);
      if (epoch.current !== current) return;
      applyCart(value);
      setCartRecovery(pending.current ? "mutation" : null);
      setError(pending.current ? uncertainMessage : "");
      writesBlocked.current = !!pending.current;
      setBusy(!!pending.current);
    } catch {
      if (epoch.current !== current) return;
      setError("Your cart couldn't be loaded. Please try again.");
      setCartRecovery("load");
    } finally {
      if (epoch.current === current) {
        mutation.current = false;
        setCheckingCart(false);
      }
    }
  }, [request, applyCart]);

  useEffect(() => {
    epoch.current += 1;
    void loadCart();
    try {
      const value = JSON.parse(localStorage.getItem("maple-favourites") ?? "[]");
      if (Array.isArray(value))
        setFavourites(value.filter((x: unknown) => typeof x === "string").slice(0, 100));
    } catch {
      /* Storage may be unavailable. */
    }
    return () => {
      epoch.current += 1;
      for (const controller of requests.current) controller.abort();
    };
  }, [loadCart]);

  const sendMutation = useCallback(async (operation: PendingMutation) => {
    const current = epoch.current;
    mutation.current = true;
    writesBlocked.current = true;
    setBusy(true);
    setCheckingCart(true);
    setError("");
    try {
      const response = await request("/api/cart/items/" + encodeURIComponent(operation.variantId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(operation.input),
      });
      let value: Cart;
      if (response.ok) {
        const result = cartMutationResponseSchema.parse(response.data);
        if (result.mutationResult.id !== operation.input.mutation.id ||
            result.mutationContext.cartIdentity !== operation.input.mutation.cartIdentity ||
            result.mutationContext.revision <= operation.input.mutation.expectedRevision) throw new Error();
        value = result;
      } else {
        const data = response.data;
        if (!data || typeof data !== "object" || !("mutationResult" in data) ||
            !("code" in data) || typeof data.code !== "string" ||
            rejectedStatuses[data.code] !== response.status) throw new Error();
        const receipt = data.mutationResult;
        if (!receipt || typeof receipt !== "object" || !("id" in receipt) ||
            receipt.id !== operation.input.mutation.id || !("status" in receipt) ||
            receipt.status !== "rejected") throw new Error();
        const fresh = await request("/api/cart");
        if (!fresh.ok) throw new Error();
        value = guardedCartSchema.parse(fresh.data);
      }
      if (epoch.current !== current) return false;
      // Clear only after a matching durable outcome and an authoritative cart.
      const stored = readPending();
      if (stored?.input.mutation.id !== operation.input.mutation.id ||
          stored.variantId !== operation.variantId ||
          JSON.stringify(stored.input) !== JSON.stringify(operation.input)) {
        pending.current = stored;
        throw new Error();
      }
      window.sessionStorage.removeItem(pendingStorageKey);
      pending.current = null;
      writesBlocked.current = false;
      applyCart(value);
      setCartRecovery(null);
      setBusy(false);
      setError(response.ok ? "" : "Your cart has changed. Please check the quantities before trying again.");
      return response.ok;
    } catch {
      if (epoch.current === current) {
        setError(uncertainMessage);
        setCartRecovery("mutation");
      }
      return false;
    } finally {
      if (epoch.current === current) {
        mutation.current = false;
        setCheckingCart(false);
      }
    }
  }, [request, applyCart]);

  const setQuantity = useCallback(async (id: string, quantity: number) => {
    const context = cartRef.current.mutationContext;
    if (!ready.current || mutation.current || writesBlocked.current || pending.current || !context) return false;
    let operation: PendingMutation;
    try {
      if (!id || id.length > 160) throw new Error();
      operation = { variantId: id, input: cartMutationInputSchema.parse({
        quantity,
        mutation: { id: crypto.randomUUID(), cartIdentity: context.cartIdentity, expectedRevision: context.revision },
      }) };
      window.sessionStorage.setItem(pendingStorageKey, JSON.stringify(operation));
    } catch {
      setError("Your browser couldn't save cart recovery details. Please allow browser storage and try again.");
      return false;
    }
    pending.current = operation;
    return sendMutation(operation);
  }, [sendMutation]);

  const recoverCart = useCallback(async () => {
    if (mutation.current) return;
    if (pending.current) await sendMutation(pending.current);
    else await loadCart();
  }, [sendMutation, loadCart]);
  function toggleFavourite(id: string) {
    setFavourites((previous) => {
      const next = previous.includes(id)
        ? previous.filter((x) => x !== id)
        : [...previous, id].slice(-100);
      try {
        localStorage.setItem("maple-favourites", JSON.stringify(next));
      } catch {
        /* Keep the current session usable. */
      }
      return next;
    });
  }
  return (
    <Context.Provider
      value={{
        cart,
        cartOpen,
        setCartOpen,
        busy,
        cartReady,
        error,
        setQuantity,
        cartRecovery,
        checkingCart,
        recoverCart,
        favourites,
        toggleFavourite,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useShop() {
  const state = useContext(Context);
  if (!state) throw new Error("ShopProvider is required");
  return state;
}
