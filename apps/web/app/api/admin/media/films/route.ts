import { forwardFilmUpload } from "@/lib/film-upload-forward";

/** Staff film uploads, streamed straight to the API (lib/film-upload-forward.ts explains why this is not the rewrite). */
export function POST(request: Request) {
  return forwardFilmUpload(request, process.env.API_URL ?? "http://127.0.0.1:4100");
}
