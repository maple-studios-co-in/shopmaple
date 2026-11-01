import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getProduct, getRelatedProductCards } from "@/lib/catalog";
import { productRedirect } from "@/lib/product-address";
import { ProductDetail } from "@/components/product-detail";
import { RelatedProducts } from "@/components/store/related-products";
import presentationData from "@/data/product-presentation.json";
import { JsonLd } from "@/components/store/json-ld";
import { breadcrumbStructuredData, productMetadata, productStructuredData, seoSettings } from "@/lib/seo";
import { collectionTitles } from "@/lib/collections";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  // A failed catalogue read must not drop the page's robots tag: the error page that follows is never indexed.
  const product = await getProduct((await params).handle).catch(() => undefined);
  if (product === undefined) return { title: "Product", robots: { index: false, follow: false } };
  return product ? productMetadata(seoSettings(process.env), product) : { title: "Product not found", robots: { index: false, follow: false } };
}
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
  const seo = seoSettings(process.env);
  const trail: [string, string][] = [["Home", "/"],
    ...(product.category ? [[collectionTitles[product.category] ?? "Furniture", `/collections/${product.category}`] as [string, string]] : []),
    [product.title, `/products/${product.handle}`]];
  return (
    <>
      <JsonLd data={[productStructuredData(seo, product), breadcrumbStructuredData(seo, trail)]} />
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
