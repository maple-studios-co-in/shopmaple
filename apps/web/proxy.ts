import { NextResponse, type NextRequest } from "next/server";
import { robotsHeader, seoSettings } from "@/lib/seo";

/**
 * The noindex header, decided per request: on every response until SEO_INDEXING=on (pages,
 * media, error pages), and on private pages always. next.config headers are fixed at build time.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const tag = robotsHeader(seoSettings(process.env), request.nextUrl.pathname);
  if (tag) response.headers.set("X-Robots-Tag", tag);
  return response;
}
// Scripts and styles are never indexed; everything else, images included, gets the header. Film uploads are left out:
// running the proxy copies a request's body into memory, capped at 10 MB, and a film is up to 80 MB (the API's answer
// there carries its own noindex header).
export const config = { matcher: ["/((?!_next/static/|api/admin/media/films).*)"] };
