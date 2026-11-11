"use client";
import type { NimbusPageContent } from "@shopmaple/contracts";
import { resolveNimbusPageContent } from "@/lib/nimbus-content-defaults";
import { CollectionLandingFields } from "./collection-landing-fields";

/**
 * The Nimbus page's words (Figma 311:548; owner, 10 Nov 2026), in the collection template's editor. A draft still holding
 * the original template's copy opens on the redesign's words, keeping any staff wrote; the first edit saves the redesign.
 */
export function NimbusFields({ value, onChange }: { value?: NimbusPageContent; onChange: (value: NimbusPageContent) => void }) {
  return (
    <CollectionLandingFields name="Nimbus" title="The Nimbus Collection" value={resolveNimbusPageContent(value)} onChange={onChange}
      description="Edit /nimbus-collection. Changes stay in your draft until published. The photos are under Artwork, Nimbus; the film, the links and the edit's products stay with the page." />
  );
}
