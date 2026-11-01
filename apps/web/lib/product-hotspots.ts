import type { Product } from "@shopmaple/contracts";

/** Where a hotspot sits on a white-background photo (fractions of its width and height) and where its note comes from. */
export type HotspotSpec = { x: number; y: number; label: string; from: string; line?: string };
export type Cutout = { image: string; hotspots: HotspotSpec[] };
export type Hotspot = { x: number; y: number; label: string; note: string };

const clean = (line: string) => line.replace(/^[\s•\-*]+/, "").trim();

/**
 * A note is the product's own words, never written here: `materials` notes are the text after "<line>:" on the matching
 * bullet of the product's materials text ("Upholstery: Velvet and Boucle…"), `dimensions` notes are its bullets joined.
 * A hotspot with nothing behind it in the data returns undefined and is not shown.
 */
export function hotspotNote(spec: HotspotSpec, details: Product["sourceDetails"]): string | undefined {
  const source = spec.from === "materials" ? details?.materials : spec.from === "dimensions" ? details?.dimensions : undefined;
  if (!source) return undefined;
  const lines = source.split("\n").map(clean).filter(Boolean);
  if (spec.from === "dimensions") return lines.map((line) => line.replace(/^([A-Za-z ]+):\s*/, "$1 ")).join(" · ") || undefined;
  const wanted = (spec.line ?? spec.label).toLowerCase();
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon > 0 && line.slice(0, colon).trim().toLowerCase() === wanted) return line.slice(colon + 1).trim() || undefined;
  }
  return undefined;
}

export function resolveHotspots(cutout: Cutout | undefined, details: Product["sourceDetails"]): Hotspot[] {
  return (cutout?.hotspots ?? []).flatMap((spec) => {
    const note = hotspotNote(spec, details);
    return note ? [{ x: spec.x, y: spec.y, label: spec.label, note }] : [];
  });
}
