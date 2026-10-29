import type { StorefrontContent } from "@shopmaple/contracts";

/** One difference between a saved revision and the current draft, as the history sheet lists it. */
export type ContentChange = { area: string; path: string; revision: string; current: string };

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
const limit = 160;
const missing = "(none)";

function show(value: unknown) {
  if (value === undefined) return missing;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function walk(revision: unknown, current: unknown, path: string[], out: ContentChange[], area: string) {
  if (Object.is(revision, current)) return;
  const bothArrays = Array.isArray(revision) && Array.isArray(current);
  if (bothArrays || (isRecord(revision) && isRecord(current))) {
    const keys = bothArrays
      ? Array.from({ length: Math.max((revision as unknown[]).length, (current as unknown[]).length) }, (_, index) => String(index))
      : [...new Set([...Object.keys(revision as object), ...Object.keys(current as object)])];
    for (const key of keys) walk((revision as Record<string, unknown>)[key], (current as Record<string, unknown>)[key], [...path, key], out, area);
    return;
  }
  if (JSON.stringify(revision) === JSON.stringify(current)) return;
  out.push({ area, path: path.join(" > "), revision: show(revision), current: show(current) });
}

/** What restoring `revision` would change in `current`, leaf by leaf, grouped by screen. */
export function diffContent(revision: StorefrontContent, current: StorefrontContent): ContentChange[] {
  const out: ContentChange[] = [];
  const keys = [...new Set([...Object.keys(revision), ...Object.keys(current)])] as (keyof StorefrontContent)[];
  for (const key of keys) walk(revision[key], current[key], [key], out, areas[key] ?? "Other settings");
  return out;
}
