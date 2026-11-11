import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getProduct } from "@/lib/catalog";

/**
 * Decides whether the product exists before loading.tsx streams the logo screen, so an unknown handle answers a real
 * 404 (the status is fixed once streaming starts). The page reads the same product from the catalogue cache, so this
 * adds no catalogue request.
 */
export default async function ProductLayout({ children, params }: { children: ReactNode; params: Promise<{ handle: string }> }) {
  if (!(await getProduct((await params).handle))) notFound();
  return children;
}
