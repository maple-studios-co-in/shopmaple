import type { StorefrontContent } from "@shopmaple/contracts";
/** Staff-only media path already used by the media library and article previews. */
export const privatePreviewMediaPattern = /^\/api\/admin\/media\/([a-f0-9]{64})\/preview$/;
const managedUploadPattern = /^\/media\/uploads\/([a-f0-9]{64})\.webp$/;
export function isPrivatePreviewMedia(src: unknown): boolean {
  return typeof src === "string" && privatePreviewMediaPattern.test(src);
}
function map(value: unknown): unknown {
  if (typeof value === "string") {
    const managed = managedUploadPattern.exec(value);
    return managed ? `/api/admin/media/${managed[1]}/preview` : value;
  }
  if (Array.isArray(value)) return value.map(map);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, map(entry)]));
  return value;
}
/**
 * Route every managed upload in a draft through the staff preview path so an
 * unpublished image renders for signed-in staff without becoming public. The
 * draft object is left untouched.
 */
export function withPreviewMedia<T extends StorefrontContent>(content: T): T {
  return map(content) as T;
}
