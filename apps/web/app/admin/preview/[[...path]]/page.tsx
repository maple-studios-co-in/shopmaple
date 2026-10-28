import type { Metadata } from "next";
import { PreviewShell } from "@/components/admin/preview-shell";
import { listStorefrontPages, storefrontPathHref } from "@/components/storefront/storefront-page";
import { loadPreviewRequest, previewMessages } from "@/lib/draft-preview-request";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Draft preview", robots: { index: false, follow: false, nocache: true } };

export default async function PreviewPage(props: { params: Promise<{ path?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const request = await loadPreviewRequest(props.params, props.searchParams);
  if (!request.ok)
    return (
      <section className="admin-preview-shell admin-preview-message" aria-label="Draft preview">
        <h1>Draft preview</h1>
        <p role="alert">{previewMessages[request.reason]}</p>
        <a href="/admin">Back to admin</a>
      </section>
    );
  const pages = listStorefrontPages(request.content, { draft: true });
  const current = request.path ? storefrontPathHref(request.path) : `/${request.segments.join("/")}`;
  if (!pages.some((page) => page.path === current)) pages.unshift({ path: current, label: `${current} (cannot be previewed)` });
  return <PreviewShell token={request.token} path={current} version={request.version} pages={pages} />;
}
