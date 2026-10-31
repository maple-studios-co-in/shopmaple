"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ProductHighlights } from "@shopmaple/contracts";

type Lookup = {
  swatch: (name: string) => string | undefined;
  product: (handle: string) => ProductHighlights["products"][number] | undefined;
};

const empty: Lookup = { swatch: () => undefined, product: () => undefined };
const Context = createContext<Lookup>(empty);

/** Staff-entered card highlights (colour dots, New, ratings). The layout passes the published set; a draft preview passes its own. */
export function ProductHighlightsProvider({ value, children }: { value?: ProductHighlights; children: ReactNode }) {
  const lookup = useMemo<Lookup>(() => {
    if (!value) return empty;
    const swatches = new Map(value.swatches.map((swatch) => [swatch.name.trim().toLowerCase(), swatch.hex]));
    const products = new Map(value.products.map((product) => [product.handle, product]));
    return { swatch: (name) => swatches.get(name.trim().toLowerCase()), product: (handle) => products.get(handle) };
  }, [value]);
  return <Context.Provider value={lookup}>{children}</Context.Provider>;
}

export const useProductHighlights = () => useContext(Context);
