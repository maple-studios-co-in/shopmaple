"use client";
import { useEffect } from "react";
import { recordProductVisit } from "@/lib/recent-products";

/** Mounted by the canonical product page, never by a recommendation card. */
export function ProductVisit({ handle }: { handle: string }) {
  useEffect(() => { recordProductVisit(handle); }, [handle]);
  return null;
}
