import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getProduct } from "@/lib/catalog";
import { productRedirect } from "@/lib/product-address";
import { ProductPageView } from "@/components/store/product-page";
import { productMetadata, seoSettings } from "@/lib/seo";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  // A failed catalogue read must not drop the page's robots tag: the error page that follows is never indexed.
  const product = await getProduct((await params).handle).catch(() => undefined);
  if (product === undefined) return { title: "Product", robots: { index: false, follow: false } };
  return product ? productMetadata(seoSettings(process.env), product) : { title: "Product not found", robots: { index: false, follow: false } };
}
/** The page itself is components/store/product-page.tsx, which the staff live preview draws from a draft too. */
export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const [{ handle }, query] = await Promise.all([params, searchParams]);
  const product = await getProduct(handle);
  if (!product) notFound();
  const variant = typeof query.variant === "string" ? query.variant : undefined;
  // Old keeri-<id> addresses and old variant ids move permanently to the readable address.
  const moved = productRedirect(handle, product, variant);
  if (moved) permanentRedirect(moved);
  // Called, not mounted, so the route returns the finished page as it always has; it reads the published banner itself.
  return ProductPageView({ handle, product, variant });
}
