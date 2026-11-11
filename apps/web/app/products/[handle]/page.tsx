import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getProduct, getProductCards, getRelatedProductCards } from "@/lib/catalog";
import { productRedirect } from "@/lib/product-address";
import { completeLookCategories, lookPieces, otherPieces } from "@/lib/product-related";
import { ProductDetail } from "@/components/product-detail";
import { RelatedProducts } from "@/components/store/related-products";
import presentationData from "@/data/product-presentation.json";
import { JsonLd } from "@/components/store/json-ld";
import { breadcrumbStructuredData, productMetadata, productStructuredData, seoSettings } from "@/lib/seo";
import { collectionTitles } from "@/lib/collections";
import { getPublishedContent } from "@/lib/content";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";
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
  // A bundle staff built in Keeri leads "Complete the look" and "Buy in Bundle", with Keeri's quantities. Without one,
  // "Complete the look" draws from the rooms the piece is styled with, and a room that fails to load only leaves its
  // pieces out; "You may also like" draws from the piece's own category.
  const keeriBundle = product.productPage?.bundles[0];
  const keeriHandles = (keeriBundle?.items ?? []).map((item) => item.handle).filter((h) => h !== product.handle);
  const [related, keeriCards, ...rooms] = await Promise.all([
    product.category ? getRelatedProductCards(product.category) : [],
    keeriHandles.length ? getProductCards(keeriHandles).catch(() => []) : [],
    ...(keeriHandles.length ? [] : completeLookCategories(product.category).map((category) => getRelatedProductCards(category).catch(() => []))),
  ]);
  const keeriLook = keeriHandles.flatMap((h) => keeriCards.filter((card) => card.handle === h));
  const look = keeriLook.length ? keeriLook : lookPieces(rooms, product);
  // "Buy in Bundle" is the bundle staff built in Keeri and nothing else (Keeri's "Complete the look", described in its
  // docs/shopmaple-product-page.md): its other pieces are read in full for their options, and one that fails to load is
  // left out. A piece without a Keeri bundle shows none; the store never pairs pieces itself.
  const bundle = (await Promise.all(keeriLook
    .map((card) => getProduct(card.handle).catch(() => null))))
    .filter((piece): piece is NonNullable<typeof piece> => Boolean(piece?.published));
  const bundleQuantities = keeriLook.length ? Object.fromEntries(keeriBundle!.items.map((item) => [item.handle, item.quantity])) : undefined;
  // Hand-placed white-background cut-outs (local files) for the pieces Keeri has none for, by their unchanged address.
  const presentation = Object.hasOwn(presentationData, handle) ? presentationData[handle as keyof typeof presentationData] : undefined;
  // The banner's photo is template artwork; only its address and description go to the browser.
  const { image, alt } = resolveTemplateMedia("product-banner", (await getPublishedContent()).templateMedia);
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
        completeLook={look}
        bundle={bundle}
        bundleQuantities={bundleQuantities}
        serverNow={Date.now()}
        banner={{ image, alt }}
      >
        <RelatedProducts products={otherPieces(related, product)} />
      </ProductDetail>
    </>
  );
}
