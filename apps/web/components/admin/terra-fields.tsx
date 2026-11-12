"use client";
import type { CollectionLandingContent } from "@shopmaple/contracts";
import { resolveTerraPageContent } from "@/lib/terra-content-defaults";
import { CollectionLandingFields } from "./collection-landing-fields";

/**
 * The Terra page's words (Figma 311:921; owner, 10 Nov 2026), in the collection template's editor it shares with Nimbus.
 * A draft saved before Terra existed opens on the frame's words; the first edit saves Terra's own copy.
 */
export function TerraFields({ value, onChange }: { value?: CollectionLandingContent; onChange: (value: CollectionLandingContent) => void }) {
  return (
    <CollectionLandingFields name="Terra" title="The Terra Collection" value={resolveTerraPageContent(value)} onChange={onChange}
      description="Edit /terra-collection. Changes stay in your draft until published. The photos and the collection film are under Artwork, Terra; the links stay with the page, and each setting and concept opens an enquiry about it on the contact form." />
  );
}
