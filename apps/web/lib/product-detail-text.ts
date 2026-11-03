import type { ProductRichText, ProductRichTextNode } from "@shopmaple/contracts";

/**
 * The catalogue's "Label: value" lines ("Frame: Oak", "Width: 28\" (≈ 71 cm)", or "Width 56 cm") as rows. Null when
 * any line is not one, so prose stays prose.
 */
export function labelledRows(text: string | null | undefined): [string, string][] | null {
  const lines = (text ?? "").split(/\r?\n/).map((line) => line.replace(/^[•*-]\s*/, "").trim()).filter(Boolean);
  if (!lines.length) return null;
  const rows: [string, string][] = [];
  for (const line of lines) {
    const row = /^([^:]{1,32}):\s*(\S.*)$/.exec(line) ?? /^([A-Za-z][A-Za-z &/-]{0,30}?)\s+(\d.*)$/.exec(line);
    if (!row) return null;
    rows.push([row[1]!.trim(), row[2]!.trim()]);
  }
  return rows;
}

/** A captured rich text's words, for measuring and matching. */
export function richPlain(content: ProductRichText | null | undefined): string {
  const words: string[] = [];
  const walk = (nodes: ProductRichTextNode[]) => {
    for (const node of nodes) {
      if (node.type === "text") words.push(node.value);
      else walk(node.children);
    }
  };
  walk(content?.children ?? []);
  return words.join(" ");
}

// Words the catalogue uses for upholstered pieces.
const upholstery = /fabric|upholster|boucl|velvet|linen|leather|cushion|cotton|chenille|suede|textile/i;

/** The caption under the piece: fabric and finish for upholstered pieces, else finish and size (the store's FAQ). */
export function choiceLine(materials: string): string {
  return upholstery.test(materials) ? "Your choice of fabric. Your choice of finish." : "Your choice of finish. Your choice of size.";
}
