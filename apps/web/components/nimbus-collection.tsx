import type { StorefrontContent } from "@shopmaple/contracts";
import { CollectionLandingView } from "@/components/collection-landing";
import { getProductCards } from "@/lib/catalog";
import { nimbusPieceHandles, resolveNimbusLanding, resolveNimbusPageContent, type NimbusPiece } from "@/lib/nimbus-content-defaults";

/**
 * The edit's pieces as the live catalogue has them: each product's own name, photo and page, in the edit's order. A piece
 * the catalogue does not list, or one without a photo, is null and left out; while the catalogue cannot be read the edit
 * is empty. Nothing is saved alongside: product names and photos come from Keeri only (owner, 11 Nov 2026).
 */
async function nimbusPieces(): Promise<(NimbusPiece | null)[]> {
  try {
    const live = new Map((await getProductCards([...nimbusPieceHandles])).map(product => [product.handle, product]));
    return nimbusPieceHandles.map(handle => {
      const product = live.get(handle);
      return product?.image ? { title: product.title, image: product.image, href: `/products/${handle}` } : null;
    });
  } catch {
    return [];
  }
}

/**
 * The Nimbus Collection (Figma 311:548; owner, 10 Nov 2026) from a content document: the published store, or a staff
 * draft in the preview. The catalogue is read only when the edit is shown.
 */
export async function NimbusCollection({ site }: { site: Pick<StorefrontContent, "nimbusPage" | "templateMedia" | "siteChrome"> }) {
  const shown = resolveNimbusPageContent(site.nimbusPage).sections.some(item => item.key === "pieces" && item.enabled);
  return <CollectionLandingView page={resolveNimbusLanding(site, shown ? await nimbusPieces() : [])} />;
}
