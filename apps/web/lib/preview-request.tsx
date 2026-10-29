import "server-only";
import { cookies } from "next/headers";
import { previewTokenPattern, readDraftPreview, type DraftPreview } from "./draft-preview";

/** Validates the token from the address and reads the draft with the browser's staff cookie. */
export async function loadPreviewRequest(searchParams: Promise<Record<string, string | string[] | undefined>>): Promise<{ token: string; draft: DraftPreview }> {
  const { token } = await searchParams;
  const value = typeof token === "string" && previewTokenPattern.test(token) ? token : "";
  if (!value) {
    return { token: "", draft: { ok: false, status: 400, code: "PREVIEW_TOKEN_INVALID", message: "This preview link is not valid. Open the preview again from the editor." } };
  }
  const jar = await cookies();
  const cookieHeader = jar.getAll().map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  return { token: value, draft: await readDraftPreview(value, cookieHeader) };
}

export function PreviewUnavailable({ draft }: { draft: Extract<DraftPreview, { ok: false }> }) {
  return (
    <section className="shop-admin grid min-h-dvh place-items-center bg-background px-6 py-12" aria-labelledby="preview-unavailable">
      <div className="grid max-w-[60ch] gap-4">
        <h1 id="preview-unavailable" className="font-display text-[36px] leading-tight font-normal">Draft preview unavailable</h1>
        <p role="alert" className="rounded-lg border border-danger/20 bg-danger-bg px-4 py-3 text-[13.5px] font-medium text-danger">{draft.status === 401 ? "Sign in to the admin dashboard, then open the preview again from the editor." : draft.message}</p>
        <p><a href="/admin" className="rounded-sm text-[13.5px] font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/60">Back to editor</a></p>
      </div>
    </section>
  );
}
