import type { EditorialNode } from "@shopmaple/contracts";

export type PolicySection = { id: string; number: string; title: string; nodes: EditorialNode[] };
export type PolicyOutline = { intro: EditorialNode[]; sections: PolicySection[] };

/** A node's words as a reader sees them; a line break reads as a space. */
function words(node: EditorialNode): string {
  if (typeof node === "string") return node;
  return node.tag === "br" ? " " : node.children.map(words).join("");
}

const address = (title: string) =>
  title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";

/**
 * The Help pages (Figma 150:2569) read a policy written in the page editor as an opening, then numbered
 * sections: everything before the first h2 is the opening under the title, and each h2 starts a section
 * that runs to the next. "On this page" lists the sections, which link by these ids.
 */
export function policyOutline(nodes: readonly EditorialNode[]): PolicyOutline {
  const intro: EditorialNode[] = [];
  const sections: PolicySection[] = [];
  // A section must never take an id already on the page: the store's main landmark is id="main", and the Help
  // pages' care block is labelled by id="customer-care-title", which a section titled "Customer care" would also make.
  const taken = new Map<string, number>([["main", 1], ["customer-care", 1]]);
  for (const node of nodes) {
    if (typeof node === "string" && !node.trim()) continue;
    if (typeof node !== "string" && node.tag === "h2") {
      const title = words(node).replace(/\s+/g, " ").trim();
      if (!title) continue;
      const base = address(title);
      const count = (taken.get(base) ?? 0) + 1;
      taken.set(base, count);
      sections.push({ id: count === 1 ? base : `${base}-${count}`, number: String(sections.length + 1).padStart(2, "0"), title, nodes: [] });
      continue;
    }
    (sections.at(-1)?.nodes ?? intro).push(node);
  }
  return { intro, sections };
}

/**
 * Which section "On this page" marks as being read, given each heading's distance from the top of the
 * window: the last heading at or above the reading line. Before the first heading arrives that is the
 * first section, and at the bottom of the page the last, so a short closing section can still be marked.
 */
export function readingSection(tops: readonly number[], line: number, atEnd: boolean): number {
  if (tops.length === 0) return -1;
  if (atEnd) return tops.length - 1;
  let reading = 0;
  tops.forEach((top, index) => { if (top <= line) reading = index; });
  return reading;
}
