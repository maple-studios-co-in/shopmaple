import type { StorefrontContent } from "@shopmaple/contracts";

/** One difference between a saved revision and the current draft, as the history sheet lists it. */
export type ContentChange = { area: string; path: string; label: string; revision: string; current: string };

/** The admin screen that edits each top-level part of the content, so changes read in staff terms. */
const areas: Partial<Record<keyof StorefrontContent, string>> = {
  homeSections: "Homepage",
  homeCopy: "Homepage",
  homeDetails: "Homepage",
  homeCitiesLayout: "Homepage",
  motion: "Homepage",
  siteChrome: "Navigation & footer",
  homeMerchandising: "Merchandising",
  templateMedia: "Artwork",
  campaigns: "Campaigns",
  instagramPosts: "Instagram",
  pages: "Pages",
  storyPage: "Existing pages",
  nimbusPage: "Existing pages",
  servicePages: "Existing pages",
  editorialContent: "Policies & blogs",
  authoredArticles: "Policies & blogs",
  landingPages: "Category pages",
};
/** Staff names for the top-level parts of the content (the first part of a change's label). */
const groups: Partial<Record<keyof StorefrontContent, string>> = {
  homeSections: "Homepage sections", homeCopy: "Homepage copy", homeDetails: "Homepage details", homeCitiesLayout: "Homepage cities",
  motion: "Motion", siteChrome: "Navigation and footer", homeMerchandising: "Merchandising", templateMedia: "Artwork",
  campaigns: "Campaigns", instagramPosts: "Instagram posts", pages: "Pages", storyPage: "Our Story page", nimbusPage: "Nimbus page",
  servicePages: "Service pages", editorialContent: "Policies and blogs", authoredArticles: "Articles", landingPages: "Category pages",
};
const limit = 160;
/** "chairsHeading" -> "Chairs heading", "dining-banner" -> "Dining banner". */
const words = (key: string) => {
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};
/** An array item's own name when it has one (title, label, key, slug ...), else its position. */
function itemName(item: unknown, index: number) {
  if (isRecord(item)) for (const field of ["title", "label", "name", "key", "slug", "handle"]) {
    const value = item[field];
    if (typeof value === "string" && value) return field === "key" || field === "slug" || field === "handle" ? words(value) : value;
  }
  return `Item ${index + 1}`;
}
const missing = "(none)";

function show(value: unknown) {
  if (value === undefined) return missing;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function walk(revision: unknown, current: unknown, path: string[], out: ContentChange[], area: string, label: string[]) {
  if (Object.is(revision, current)) return;
  const bothArrays = Array.isArray(revision) && Array.isArray(current);
  if (bothArrays || (isRecord(revision) && isRecord(current))) {
    const keys = bothArrays
      ? Array.from({ length: Math.max((revision as unknown[]).length, (current as unknown[]).length) }, (_, index) => String(index))
      : [...new Set([...Object.keys(revision as object), ...Object.keys(current as object)])];
    for (const key of keys) {
      const next = [(revision as Record<string, unknown>)[key], (current as Record<string, unknown>)[key]] as const;
      const name = bothArrays ? itemName(next[0] ?? next[1], Number(key)) : words(key);
      walk(next[0], next[1], [...path, key], out, area, [...label, name]);
    }
    return;
  }
  if (JSON.stringify(revision) === JSON.stringify(current)) return;
  out.push({ area, path: path.join(" > "), label: label.join(": "), revision: show(revision), current: show(current) });
}

/** What restoring `revision` would change in `current`, leaf by leaf, grouped by screen. */
export function diffContent(revision: StorefrontContent, current: StorefrontContent): ContentChange[] {
  const out: ContentChange[] = [];
  const keys = [...new Set([...Object.keys(revision), ...Object.keys(current)])] as (keyof StorefrontContent)[];
  for (const key of keys) walk(revision[key], current[key], [key], out, areas[key] ?? "Other settings", [groups[key] ?? words(key)]);
  return out;
}
