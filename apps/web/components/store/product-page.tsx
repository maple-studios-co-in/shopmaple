import { getProduct, getProductCards, getRelatedProductCards } from "@/lib/catalog";
import { completeLookCategories, lookPieces, otherPieces, pickedLooks } from "@/lib/product-related";
import { ProductDetail } from "@/components/product-detail";
import { RelatedProducts } from "@/components/store/related-products";
import presentationData from "@/data/product-presentation.json";
import { JsonLd } from "@/components/store/json-ld";
import { breadcrumbStructuredData, productStructuredData, seoSettings } from "@/lib/seo";
import { collectionTitles } from "@/lib/collections";
import { getPublishedContent, type StorefrontDocument } from "@/lib/content";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";

export type LoadedProduct = NonNullable<Awaited<ReturnType<typeof getProduct>>>;

/**
 * A piece's page (/products/<handle>), for a product the caller has already read: the public route draws it from the
 * published snapshot (read here, after the catalogue), the staff live preview passes a draft (`content`), so the page's
 * banner is the draft's. `handle` is the address it was asked by, which the hand-placed cut-outs are keyed on.
 */
export async function ProductPageView({ handle, product, variant, content }: {
  handle: string;
  product: LoadedProduct;
  variant?: string;
  content?: StorefrontDocument;
}) {
  // A bundle staff built in Keeri leads "Complete the look" and "Buy in Bundle", with Keeri's quantities. Without one,
  // "Complete the look" draws from the rooms the piece is styled with, and a room that fails to load only leaves its
  // pieces out; "You may also like" draws from the piece's own category.
  // Above both, the pieces Keeri staff picked for a variant lead that variant's "Complete the look" (the first four the
  // store lists); a variant without picks, or whose picks all fail to load, keeps the choice above.
  const keeriBundle = product.productPage?.bundles[0];
  const keeriHandles = (keeriBundle?.items ?? []).map((item) => item.handle).filter((h) => h !== product.handle);
  const picks = product.variants.map((v) => [v.id, (v.productPage?.completeLook ?? []).filter((p) => p.handle !== product.handle)] as const);
  const pickedHandles = [...new Set(picks.flatMap(([, list]) => list.map((p) => p.handle)))];
  const everyPicked = picks.length > 0 && picks.every(([, list]) => list.length);
  const [related, keeriCards, pickedCards, ...rooms] = await Promise.all([
    product.category ? getRelatedProductCards(product.category) : [],
    keeriHandles.length ? getProductCards(keeriHandles).catch(() => []) : [],
    pickedHandles.length ? getProductCards(pickedHandles).catch(() => []) : [],
    ...(keeriHandles.length || everyPicked ? [] : completeLookCategories(product.category).map((category) => getRelatedProductCards(category).catch(() => []))),
  ]);
  const keeriLook = keeriHandles.flatMap((h) => keeriCards.filter((card) => card.handle === h));
  const look = keeriLook.length ? keeriLook : lookPieces(rooms, product);
  const lookByVariant = pickedLooks(picks, pickedCards);
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
  const { image, alt } = resolveTemplateMedia("product-banner", (content ?? await getPublishedContent()).templateMedia);
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
        initialVariant={variant}
        presentation={presentation}
        completeLook={look}
        lookByVariant={lookByVariant}
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
