/** A rendered src, raw or through the image optimizer (/_next/image?url=…), as a plain path to compare. */
export const shown = (src: string | null | undefined) => {
  const value = src ?? "";
  return value.startsWith("/_next/image?") ? new URLSearchParams(value.slice(value.indexOf("?") + 1)).get("url") ?? "" : value;
};
