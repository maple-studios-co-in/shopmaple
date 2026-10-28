import type { Metadata } from "next";
import { PreviewShell } from "@/components/admin/preview-shell";
import { loadPreviewRequest, PreviewUnavailable } from "@/lib/preview-request";
import { listPreviewPages, renderStorefrontRoute } from "@/lib/storefront-routes";
import "@/styles/admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Draft preview",
  robots: { index: false, follow: false },
};

export default async function PreviewPage({ params, searchParams }: {
  params: Promise<{ page: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { page } = await params;
  const { token, draft } = await loadPreviewRequest(searchParams);
  if (!draft.ok) return <PreviewUnavailable draft={draft} />;
  const route = renderStorefrontRoute(page, draft.content);
  return (
    <PreviewShell
      token={token}
      segments={page}
      pages={listPreviewPages(draft.content)}
      version={draft.version}
      publishedVersion={draft.publishedVersion}
      expiresAt={draft.expiresAt}
      title={route?.title ?? "an unknown page"}
    />
  );
}
