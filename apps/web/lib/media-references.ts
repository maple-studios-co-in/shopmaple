/**
 * A library file's address (`/media/uploads/<sha>.webp|mp4|webm`) where the draft uses it (owner, 23 Nov 2026: edit a
 * picture in the media library, then use the edited copy everywhere the draft used the old one). Addresses are content
 * hashes, so an exact match anywhere in the document is that file and nothing else: in an image field, a hero slide, a
 * page block or a rich-text picture alike.
 */
export function countMediaReferences(value: unknown, url: string): number {
  if (typeof value === "string") return value === url ? 1 : 0;
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + countMediaReferences(item, url), 0);
  if (value && typeof value === "object") return Object.values(value).reduce<number>((sum, item) => sum + countMediaReferences(item, url), 0);
  return 0;
}

/** The document with every use of `from` turned into `to`; the same object when nothing changed. */
export function replaceMediaReferences<T>(value: T, from: string, to: string): T {
  if (typeof value === "string") return (value === from ? to : value) as T;
  if (Array.isArray(value)) {
    const items = value.map((item) => replaceMediaReferences(item, from, to));
    return (items.some((item, index) => item !== value[index]) ? items : value) as T;
  }
  if (value && typeof value === "object") {
    let changed = false;
    const entries = Object.entries(value).map(([key, item]) => {
      const next = replaceMediaReferences(item, from, to);
      if (next !== item) changed = true;
      return [key, next] as const;
    });
    return (changed ? Object.fromEntries(entries) : value) as T;
  }
  return value;
}
