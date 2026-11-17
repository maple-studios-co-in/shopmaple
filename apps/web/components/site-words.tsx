"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { SiteWords } from "@shopmaple/contracts";
import { siteWordText, type SiteWordKey } from "@/lib/site-word-defaults";

type Words = { words?: SiteWords; marked: boolean };
const Context = createContext<Words>({ marked: false });

/**
 * The theme's own words as staff changed them (lib/site-words.ts). The layout passes the published set; a draft preview
 * passes the draft's, `marked`, so each word carries its place and click-to-edit opens the one field that holds it.
 */
export function SiteWordsProvider({ words, marked = false, children }: { words?: SiteWords; marked?: boolean; children: ReactNode }) {
  const value = useMemo(() => ({ words, marked }), [words, marked]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** The words of one place, as plain text: for a button's label, a list's first choice or anything that cannot hold markup. */
export function useSiteWord(key: SiteWordKey): string {
  return siteWordText(useContext(Context).words, key);
}

/** A form box's placeholder; in the draft preview it also names its place, so a click on the box opens its field. */
export function useSiteWordPlaceholder(key: SiteWordKey): { placeholder: string; "data-site-word-placeholder"?: string } {
  const { words, marked } = useContext(Context);
  const placeholder = siteWordText(words, key);
  return marked ? { placeholder, "data-site-word-placeholder": key } : { placeholder };
}

/** One place's words, inline. In the draft preview they sit in a span that names the place, for click-to-edit. */
export function SiteWord({ k }: { k: SiteWordKey }) {
  const { words, marked } = useContext(Context);
  const text = siteWordText(words, k);
  return marked ? <span data-site-word={k}>{text}</span> : <>{text}</>;
}
