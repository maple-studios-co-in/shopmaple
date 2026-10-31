import { notFound } from "next/navigation";
import { getProduct, getRelatedProductCards } from "@/lib/catalog";
import { ProductDetail } from "@/components/product-detail";
import { RelatedProducts } from "@/components/store/related-products";
import { HomeNewsletter, HomeValues } from "@/components/home-sections";
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
      <RelatedProducts products={related.filter((p) => p.id !== product.id).slice(0, 4)} />
      <HomeNewsletter />
      <HomeValues />
    </>
  );
}
