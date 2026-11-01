import { notFound, permanentRedirect } from "next/navigation";
import { getProduct, getRelatedProductCards } from "@/lib/catalog";
import { productRedirect } from "@/lib/product-address";
import { ProductDetail } from "@/components/product-detail";
import { RelatedProducts } from "@/components/store/related-products";
import presentationData from "@/data/product-presentation.json";
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
  // Old keeri-<id> addresses and old variant ids move permanently to the readable address.
  const moved = productRedirect(handle, product, typeof query.variant === "string" ? query.variant : undefined);
  if (moved) permanentRedirect(moved);
  const related = product.category
    ? await getRelatedProductCards(product.category)
    : [];
  const presentation =
    product.source === "shopify-preview"
      ? presentationData[handle as keyof typeof presentationData]
      : undefined;
  return (
    <>
      <ProductDetail
        key={product.id}
        product={product}
        initialVariant={
          typeof query.variant === "string" ? query.variant : undefined
        }
        presentation={presentation}
      />
      <RelatedProducts products={related.filter((p) => p.id !== product.id).slice(0, 4)} category={product.category} />
    </>
  );
}
