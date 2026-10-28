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
    <section className="shop-admin admin-preview-unavailable" aria-labelledby="preview-unavailable">
      <h1 id="preview-unavailable">Draft preview unavailable</h1>
      <p role="alert">{draft.status === 401 ? "Sign in to the admin dashboard, then open the preview again from the editor." : draft.message}</p>
      <p><a href="/admin">Back to editor</a></p>
    </section>
  );
}
