import type { Metadata } from "next";
import { PreviewFrameDocument } from "@/components/admin/preview-shell";
import { getPublishedContent } from "@/lib/content";
import { previewMediaContent } from "@/lib/draft-preview";
import { loadPreviewRequest, PreviewUnavailable } from "@/lib/preview-request";
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
 * without ever framing the public storefront.
 */
export default async function PreviewFrame({ params, searchParams }: {
  params: Promise<{ page: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { page } = await params;
  const { token, draft } = await loadPreviewRequest(searchParams);
  if (!draft.ok) return <PreviewUnavailable draft={draft} />;
  const { view } = await searchParams;
  const published = view === "published";
  if (published && draft.publishedVersion === null) {
    return <PreviewUnavailable draft={{ ok: false, status: 404, code: "PREVIEW_NOT_PUBLISHED", message: "Nothing is published yet. Publish the draft to compare it with the live storefront." }} />;
  }
  const content = published ? await getPublishedContent() : previewMediaContent(draft.content);
  const route = renderStorefrontRoute(page, content);
  if (!route) {
    return <PreviewUnavailable draft={{ ok: false, status: 404, code: "PREVIEW_PAGE_UNKNOWN", message: "There is no storefront page at this address to preview." }} />;
  }
  return (
    <PreviewFrameDocument token={token} version={published ? draft.publishedVersion ?? 0 : draft.version} path={route.path} siteChrome={content.siteChrome} view={published ? "published" : "draft"}>
      {route.node}
    </PreviewFrameDocument>
  );
}
