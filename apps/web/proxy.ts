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
// Scripts and styles are never indexed; everything else, images included, gets the header.
export const config = { matcher: ["/((?!_next/static/).*)"] };
