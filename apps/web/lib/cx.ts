/**
 * Joins class names, skipping empty ones. Unlike `cn` it never merges conflicting utilities, so it adds
 * no library to the bundle; storefront components on every page's first load use it.
 */
export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
