import type { Metadata } from "next";
import { PreviewFrameDocument, SectionThumbnailDocument } from "@/components/admin/preview-shell";
import { getPublishedContent } from "@/lib/content";
import { ProductHighlightsProvider } from "@/components/store/product-highlights";
import { previewMediaContent } from "@/lib/draft-preview";
import { readThumbnailSection } from "@/lib/live-preview";
import { loadPreviewRequest, PreviewUnavailable } from "@/lib/preview-request";
import { thumbnailContent } from "@/lib/section-thumbnails";
import { renderStorefrontRoute } from "@/lib/storefront-routes";
import "@/styles/admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Draft preview",
  robots: { index: false, follow: false },
};

/**
 * The storefront rendered from the draft, with the draft's own navigation and footer.
 * With `view=published` the same staff-only route (session plus token still required)
 * renders the published snapshot instead, so the live preview can compare the two
 * without ever framing the public storefront. With `section=<key>` on the home page it renders
 * that one homepage section of the draft alone, for a section card's thumbnail.
 */
export default async function PreviewFrame({ params, searchParams }: {
  params: Promise<{ page: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { page } = await params;
  const { token, draft } = await loadPreviewRequest(searchParams);
  if (!draft.ok) return <PreviewUnavailable draft={draft} />;
  const { view, section: sectionParam } = await searchParams;
  const section = readThumbnailSection(page, sectionParam);
  if (section === false) {
    return <PreviewUnavailable draft={{ ok: false, status: 404, code: "PREVIEW_PAGE_UNKNOWN", message: "There is no homepage section at this address to preview." }} />;
  }
  if (section) {
    const route = renderStorefrontRoute(["home"], thumbnailContent(previewMediaContent(draft.content), section));
    return route && <SectionThumbnailDocument section={section}>{route.node}</SectionThumbnailDocument>;
  }
  const published = view === "published";
  if (published && draft.publishedVersion === null) {
    return <PreviewUnavailable draft={{ ok: false, status: 404, code: "PREVIEW_NOT_PUBLISHED", message: "Nothing is published yet. Publish the draft to compare it with the live storefront." }} />;
  }
  const content = published ? await getPublishedContent() : previewMediaContent(draft.content);
  // During an API outage the published reader falls back to the bundled defaults; those must
  // never be shown labelled as the published storefront.
  if (published && content.campaignsAvailable === false) {
    return <PreviewUnavailable draft={{ ok: false, status: 503, code: "PREVIEW_PUBLISHED_UNREACHABLE", message: "The published storefront could not be read. Check that the API is running and try again." }} />;
  }
  const route = renderStorefrontRoute(page, content);
  if (!route) {
    return <PreviewUnavailable draft={{ ok: false, status: 404, code: "PREVIEW_PAGE_UNKNOWN", message: "There is no storefront page at this address to preview." }} />;
  }
  return (
    <PreviewFrameDocument token={token} version={published ? draft.publishedVersion ?? 0 : draft.version} path={route.path} siteChrome={content.siteChrome} view={published ? "published" : "draft"}>
      <ProductHighlightsProvider value={content.productHighlights}>{route.node}</ProductHighlightsProvider>
    </PreviewFrameDocument>
  );
}
