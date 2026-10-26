import { notFound } from "next/navigation";
import { getProduct, getProducts } from "@/lib/catalog";
import { ProductDetail } from "@/components/product-detail";
import { ProductCard } from "@/components/product-card";
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
    ? await getProducts({ category: product.category, limit: "5" })
    : { products: [] };
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
      {related.products.some((p) => p.id !== product.id) && (
        <section className="pdp-related">
          <h2>You might also like...</h2>
          <div className="product-grid">
            {related.products
              .filter((p) => p.id !== product.id)
              .slice(0, 4)
              .map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
          </div>
        </section>
      )}
      <HomeNewsletter />
      <HomeValues />
    </>
  );
}
