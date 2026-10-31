"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** False on the server and while hydrating, true afterwards: lets a control stay a plain link until its script is ready. */
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
