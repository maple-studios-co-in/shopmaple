import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { StorefrontPage } from "@/components/storefront/storefront-page";
import { loadPreviewRequest, previewMessages } from "@/lib/draft-preview-request";
import { withPreviewMedia } from "@/lib/preview-media";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Draft preview", robots: { index: false, follow: false, nocache: true } };

/** The storefront page itself, rendered from the draft inside the preview shell's frame. */
export default async function PreviewFramePage(props: { params: Promise<{ path?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const request = await loadPreviewRequest(props.params, props.searchParams);
  if (!request.ok) return <p role="alert" className="admin-preview-message">{previewMessages[request.reason]}</p>;
  if (!request.path) return <p role="alert" className="admin-preview-message">This address cannot be previewed from the draft. Choose a page from the preview controls.</p>;
  const content = withPreviewMedia(request.content);
  return (
    <div className="admin-preview-frame-page" data-draft-version={request.version}>
      <Header siteChrome={content.siteChrome} />
      <div id="preview-main">{await StorefrontPage({ path: request.path, content, draft: true })}</div>
      <Footer siteChrome={content.siteChrome} />
    </div>
  );
}
