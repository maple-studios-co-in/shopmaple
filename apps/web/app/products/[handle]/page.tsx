import { notFound } from "next/navigation";
import { getProduct } from "@/lib/catalog";
import { ProductDetail } from "@/components/product-detail";
export const dynamic = "force-dynamic";
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
  return (
    <ProductDetail
      product={product}
      initialVariant={
        typeof query.variant === "string" ? query.variant : undefined
      }
    />
  );
}
