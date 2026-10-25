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
import { cartSchema, type Cart } from "@shopmaple/contracts";
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
  error: string;
  setQuantity: (id: string, quantity: number) => Promise<boolean>;
  favourites: string[];
  toggleFavourite: (id: string) => void;
};
const Context = createContext<ShopState | null>(null);
export function ShopProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart>(empty),
    [cartOpen, setCartOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const revision = useRef(0),
    mutation = useRef(false);
  const [favourites, setFavourites] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    const initialRevision = revision.current;
    fetch("/api/cart", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return cartSchema.parse(await r.json());
      })
      .then((c) => {
        if (active && revision.current === initialRevision) setCart(c);
      })
      .catch(() => {
        if (active && revision.current === initialRevision)
          setError(
            "Your cart couldn't be loaded. Please refresh to try again.",
          );
      });
    try {
      const value = JSON.parse(
        localStorage.getItem("maple-favourites") ?? "[]",
      );
      if (Array.isArray(value))
        setFavourites(
          value.filter((x: unknown) => typeof x === "string").slice(0, 100),
        );
    } catch {
      /* Storage may be unavailable. */
    }
    return () => {
      active = false;
    };
  }, []);
  const setQuantity = useCallback(async (id: string, quantity: number) => {
    if (mutation.current) return false;
    mutation.current = true;
    revision.current += 1;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/cart/items/" + encodeURIComponent(id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.message ?? "Your cart couldn't be updated.");
      setCart(cartSchema.parse(data));
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your cart couldn't be updated.",
      );
      return false;
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }, []);
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
        error,
        setQuantity,
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
