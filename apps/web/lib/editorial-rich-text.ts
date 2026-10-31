/**
 * The bridge between stored policies and articles (a validated tree of safe tags) and the admin's
 * rich-text editor (TipTap). Layout wrappers (div, span) carry no meaning and are dropped; every
 * other tag the storefront renders survives a round trip. Links the store would refuse lose their
 * link but keep their words, and content the editor cannot express becomes plain paragraphs.
 */
import type { JSONContent } from "@tiptap/react";
import { safeLink, type EditorialNode } from "@shopmaple/contracts";

type Mark = NonNullable<JSONContent["marks"]>[number];
type Element = Exclude<EditorialNode, string>;
const markOf: Record<string, Mark["type"]> = { strong: "bold", b: "bold", em: "italic", i: "italic", u: "underline" };
const element = (node: EditorialNode): node is Element => typeof node !== "string";
const blank = (node: EditorialNode) => typeof node === "string" && !node.trim();

/** Inline content, with the marks of the tags around it. */
function inline(nodes: EditorialNode[], marks: Mark[] = []): JSONContent[] {
  return nodes.flatMap((node): JSONContent[] => {
    if (typeof node === "string") return node ? [{ type: "text", text: node, ...(marks.length ? { marks } : {}) }] : [];
    if (node.tag === "br") return [{ type: "hardBreak" }];
    if (node.tag === "a") return inline(node.children, [...marks, { type: "link", attrs: { href: node.href } }]);
    const mark = markOf[node.tag];
    return inline(node.children, mark ? [...marks, { type: mark }] : marks);
  });
}

const image = (node: Element): JSONContent => ({ type: "image", attrs: { src: node.src, alt: node.alt ?? "" } });
const nestedImages = (node: EditorialNode): Element[] => !element(node) ? [] : node.children.flatMap((child) => element(child) && child.tag === "img" ? [child] : nestedImages(child));
/** A run of inline content as paragraphs, split where an image sits between the words. */
function paragraphs(nodes: EditorialNode[]): JSONContent[] {
  const out: JSONContent[] = [];
  let run: EditorialNode[] = [];
  const flush = () => {
    if (run.some((node) => !blank(node))) out.push({ type: "paragraph", content: inline(run) });
    // An image nested in the words (inside a span or link) cannot sit in a line of text; it follows its paragraph.
    out.push(...run.flatMap(nestedImages).map(image));
    run = [];
  };
  for (const node of nodes) {
    if (element(node) && node.tag === "img") { flush(); out.push(image(node)); }
    else run.push(node);
  }
  flush();
  return out;
}

const inlineTags = new Set(["strong", "b", "em", "i", "u", "a", "span", "br", "img"]);
/** Block content; inline runs between blocks become paragraphs. */
function blocks(nodes: EditorialNode[]): JSONContent[] {
  const out: JSONContent[] = [];
  let run: EditorialNode[] = [];
  const flush = () => { out.push(...paragraphs(run)); run = []; };
  for (const node of nodes) {
    if (typeof node === "string" || inlineTags.has(node.tag)) { run.push(node); continue; }
    flush();
    out.push(...block(node));
  }
  flush();
  return out;
}
/** List items, quotes and table cells need at least one paragraph. */
const cell = (nodes: EditorialNode[]): JSONContent[] => { const content = blocks(nodes); return content.length ? content : [{ type: "paragraph" }]; };

function block(node: Element): JSONContent[] {
  const level = /^h([1-6])$/.exec(node.tag)?.[1];
  if (level) return [{ type: "heading", attrs: { level: Number(level) }, content: inline(node.children) }];
  switch (node.tag) {
    case "p": return paragraphs(node.children);
    case "ul": case "ol":
      return [{ type: node.tag === "ul" ? "bulletList" : "orderedList", content: node.children.filter(element).map((item) => ({ type: "listItem", content: cell(item.children) })) }];
    case "blockquote": return [{ type: "blockquote", content: cell(node.children) }];
    case "hr": return [{ type: "horizontalRule" }];
    case "table": {
      const sections = ["thead", "tbody", "tfoot"];
      const parts = node.children.filter(element);
      const rows = parts.flatMap((part) => part.tag === "tr" ? [part] : sections.includes(part.tag) ? part.children.filter((row): row is Element => element(row) && row.tag === "tr") : []);
      // Stray text inside a table (an imported caption) shows above it in browsers; keep it there as a paragraph.
      const caption = parts.filter((part) => part.tag !== "tr" && !sections.includes(part.tag));
      return [...paragraphs(caption), { type: "table", content: rows.map((row) => ({ type: "tableRow", content: row.children.filter(element).map((c) => ({
        type: c.tag === "th" ? "tableHeader" : "tableCell", content: cell(c.children),
      })) })) }];
    }
    default: return blocks(node.children);
  }
}

export function toEditorDoc(nodes: EditorialNode[]): JSONContent {
  return { type: "doc", content: blocks(nodes) };
}

/** Text with its marks as nested tags: link outermost, then bold, italic, underline. */
function textNode(node: JSONContent): EditorialNode[] {
  if (!node.text) return [];
  let out: EditorialNode = node.text;
  const marks = node.marks ?? [];
  for (const [type, tag] of [["underline", "u"], ["italic", "em"], ["bold", "strong"]] as const)
    if (marks.some((m) => m.type === type)) out = { tag, children: [out] };
  const href = marks.find((m) => m.type === "link")?.attrs?.href;
  if (typeof href === "string" && safeLink(href)) out = { tag: "a", href, children: [out] };
  return [out];
}
function fromInline(content: JSONContent[] = []): EditorialNode[] {
  const out = content.flatMap((node): EditorialNode[] => node.type === "hardBreak" ? [{ tag: "br", children: [] }] : node.type === "text" ? textNode(node) : fromInline(node.content));
  // Adjacent runs inside the same link are one link, as they were stored.
  return out.reduce<EditorialNode[]>((merged, node) => {
    const last = merged.at(-1);
    if (element(node) && node.tag === "a" && last && element(last) && last.tag === "a" && last.href === node.href) last.children.push(...node.children);
    else merged.push(node);
    return merged;
  }, []);
}
const plain = (node: JSONContent): string => node.text ?? (node.content ?? []).map(plain).join("");
function fromBlock(node: JSONContent): EditorialNode[] {
  const children = () => (node.content ?? []).flatMap(fromBlock);
  switch (node.type) {
    case "paragraph": { const content = fromInline(node.content); return content.length ? [{ tag: "p", children: content }] : []; }
    case "heading": return [{ tag: `h${Math.min(6, Math.max(1, Number(node.attrs?.level) || 2))}`, children: fromInline(node.content) }];
    case "bulletList": return [{ tag: "ul", children: children() }];
    case "orderedList": return [{ tag: "ol", children: children() }];
    case "listItem": return [{ tag: "li", children: children() }];
    case "blockquote": return [{ tag: "blockquote", children: children() }];
    case "horizontalRule": return [{ tag: "hr", children: [] }];
    case "image": {
      const src = node.attrs?.src, alt = node.attrs?.alt;
      return typeof src === "string" && src.startsWith("https://") ? [{ tag: "img", src, ...(alt ? { alt: String(alt).slice(0, 200) } : {}), children: [] }] : [];
    }
    case "table": return [{ tag: "table", children: [{ tag: "tbody", children: children() }] }];
    case "tableRow": return [{ tag: "tr", children: children() }];
    case "tableHeader": return [{ tag: "th", children: children() }];
    case "tableCell": return [{ tag: "td", children: children() }];
    default: { const text = plain(node); return text.trim() ? [{ tag: "p", children: [text] }] : []; }
  }
}

export function fromEditorDoc(doc: JSONContent): EditorialNode[] {
  return (doc.content ?? []).flatMap(fromBlock);
}
