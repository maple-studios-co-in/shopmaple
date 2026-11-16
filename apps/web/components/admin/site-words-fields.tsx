"use client";
import type { SiteWords } from "@shopmaple/contracts";
import { sitePlaces, siteWordKeys, siteWordList, withSiteWord } from "@/lib/site-words";
import { Field } from "./field";
import { FieldGrid, PanelHeader, SectionHeading } from "./kit";

/**
 * Site words: every word the storefront theme writes itself (small headings, buttons, form labels and placeholders), by
 * page. An empty box keeps the theme's own words, shown in grey. Clicking such words in the live preview opens this
 * screen on their box (owner, 16 Nov 2026: everything not from Keeri editable from the live preview).
 */
export function SiteWordsFields({ value, onChange }: { value?: SiteWords; onChange: (next: SiteWords | undefined) => void }) {
  return (
    <>
      <PanelHeader title="Site words"
        description="Small headings, buttons and form words the website writes itself. Leave a box empty to keep the original words, shown in grey. You can also click these words in the live preview." />
      <div className="grid gap-8">
        {sitePlaces.map((place) => (
          <section key={place} aria-label={place}>
            <SectionHeading>{place}</SectionHeading>
            <FieldGrid>
              {siteWordKeys.filter((key) => siteWordList[key].place === place).map((key) => {
                const entry: { text: string; label: string; multiline?: boolean } = siteWordList[key];
                return (
                  <Field key={key} name={`site-word:${key}`} label={entry.label} value={value?.[key] ?? ""} placeholder={entry.text}
                    multiline={entry.multiline} maxLength={600} onChange={(text) => onChange(withSiteWord(value, key, text))} />
                );
              })}
            </FieldGrid>
          </section>
        ))}
      </div>
    </>
  );
}
