import type { ProductCard, StorefrontContent } from "@shopmaple/contracts";
import { CollectionLandingView } from "@/components/collection-landing";
import sourceCatalog from "@/data/landing-catalog.json";
import { getProductCards } from "@/lib/catalog";
import { nimbusPieceHandles, resolveNimbusLanding, resolveNimbusPageContent, type NimbusPiece } from "@/lib/nimbus-content-defaults";

type SavedProduct = { handle: string; title: string; image: string };
const saved: Record<string, SavedProduct> = sourceCatalog;

/**
 * The edit's pieces as the live catalogue has them: each product's own name, photo and page. A piece the catalogue no
 * longer lists keeps its saved name and photo and leads to an enquiry about it, as the other landing pages' cards do;
 * while the catalogue cannot be read, the saved names and photos still lead to the product pages.
 */
async function nimbusPieces(): Promise<NimbusPiece[]> {
  let live: Map<string, ProductCard> | null;
  try {
    live = new Map((await getProductCards([...nimbusPieceHandles])).map(product => [product.handle, product]));
  } catch {
    live = null;
  }
  return nimbusPieceHandles.map(handle => {
    const product = live?.get(handle);
    const fallback = saved[handle]!;
    if (product) return { title: product.title, image: product.image ?? fallback.image, href: `/products/${handle}` };
    return {
      title: fallback.title,
      image: fallback.image,
      href: live ? `/contact?${new URLSearchParams({ product: fallback.title })}` : `/products/${handle}`,
    };
  });
}

/**
 * The Nimbus Collection (Figma 311:548; owner, 10 Nov 2026) from a content document: the published store, or a staff
 * draft in the preview. The catalogue is read only when the edit is shown.
 */
export async function NimbusCollection({ site }: { site: Pick<StorefrontContent, "nimbusPage" | "templateMedia" | "siteChrome"> }) {
  const shown = resolveNimbusPageContent(site.nimbusPage).sections.some(item => item.key === "pieces" && item.enabled);
  return <CollectionLandingView page={resolveNimbusLanding(site, shown ? await nimbusPieces() : [])} />;
}
