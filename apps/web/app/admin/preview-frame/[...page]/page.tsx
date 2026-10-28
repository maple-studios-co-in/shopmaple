import type { Metadata } from "next";
import { PreviewFrameDocument } from "@/components/admin/preview-shell";
import { previewMediaContent } from "@/lib/draft-preview";
import { loadPreviewRequest, PreviewUnavailable } from "@/lib/preview-request";
import { renderStorefrontRoute } from "@/lib/storefront-routes";
import "@/styles/admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Draft preview",
  robots: { index: false, follow: false },
};

/** The storefront rendered from the draft, with the draft's own navigation and footer. */
export default async function PreviewFrame({ params, searchParams }: {
  params: Promise<{ page: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { page } = await params;
  const { token, draft } = await loadPreviewRequest(searchParams);
  if (!draft.ok) return <PreviewUnavailable draft={draft} />;
  const content = previewMediaContent(draft.content);
  const route = renderStorefrontRoute(page, content);
  if (!route) {
    return <PreviewUnavailable draft={{ ok: false, status: 404, code: "PREVIEW_PAGE_UNKNOWN", message: "There is no storefront page at this address to preview." }} />;
  }
  return (
    <PreviewFrameDocument token={token} version={draft.version} path={route.path} siteChrome={content.siteChrome}>
      {route.node}
    </PreviewFrameDocument>
  );
}
