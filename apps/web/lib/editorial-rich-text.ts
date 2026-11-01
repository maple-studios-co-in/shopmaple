/**
 * The bridge between stored policies and articles (a validated tree of safe tags) and the admin's
 * rich-text editor (TipTap). An untouched page comes back with exactly its stored structure:
 * div sections (which the storefront styles) are kept as containers, and text the store keeps
 * outside a <p> is marked `bare` so it is saved back without one. Span wrappers carry nothing and
 * are dropped; imported indentation collapses to single spaces, as browsers show it. On the way
 * out, links and images the store would refuse are dropped (their words stay), and control
 * characters from pasted documents are removed.
 */
import type { JSONContent } from "@tiptap/react";
import { contentImageSchema, managedUpload, safeLink, type EditorialNode } from "@shopmaple/contracts";

type Mark = NonNullable<JSONContent["marks"]>[number];
type Element = Exclude<EditorialNode, string>;
const markOf: Record<string, Mark["type"]> = { strong: "bold", b: "bold", em: "italic", i: "italic", u: "underline" };
const element = (node: EditorialNode): node is Element => typeof node !== "string";
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Inline content, with the marks of the tags around it; runs of whitespace read as one space. */
function inline(nodes: EditorialNode[], marks: Mark[] = []): JSONContent[] {
  return nodes.flatMap((node): JSONContent[] => {
    if (typeof node === "string") {
      const text = node.replace(/\s+/g, " ");
      return text ? [{ type: "text", text, ...(marks.length ? { marks } : {}) }] : [];
    }
    if (node.tag === "br") return [{ type: "hardBreak" }];
    if (node.tag === "img") return [];
    if (node.tag === "a") return inline(node.children, [...marks, { type: "link", attrs: { href: node.href } }]);
    const mark = markOf[node.tag];
    return inline(node.children, mark ? [...marks, { type: mark }] : marks);
  });
}
/** A paragraph's words without the spaces a browser would not show at its start and end. */
function trimmed(content: JSONContent[]): JSONContent[] {
  const out = content.map((node) => ({ ...node }));
  const first = out.find((node) => node.type === "text"), last = [...out].reverse().find((node) => node.type === "text");
  if (first?.text) first.text = first.text.replace(/^ +/, "");
  if (last?.text) last.text = last.text.replace(/ +$/, "");
  return out.filter((node) => node.type !== "text" || node.text);
}

const image = (node: Element): JSONContent => ({ type: "image", attrs: { src: node.src, alt: node.alt ?? "" } });
const nestedImages = (nodes: EditorialNode[]): Element[] => nodes.flatMap((node) => !element(node) ? [] : node.tag === "img" ? [node] : nestedImages(node.children));

/** A run of inline content as paragraphs; images, which cannot sit in a line of text, follow it. */
function paragraphs(nodes: EditorialNode[], bare: boolean): JSONContent[] {
  const content = trimmed(inline(nodes));
  return [
    ...(content.length ? [{ type: "paragraph", ...(bare ? { attrs: { bare: true } } : {}), content }] : []),
    ...nestedImages(nodes).map(image),
  ];
}

const inlineTags = new Set(["strong", "b", "em", "i", "u", "a", "span", "br", "img"]);
/** Block content; text stored directly in a container becomes a `bare` paragraph. */
function blocks(nodes: EditorialNode[]): JSONContent[] {
  const out: JSONContent[] = [];
  let run: EditorialNode[] = [];
  const flush = () => { out.push(...paragraphs(run, true)); run = []; };
  for (const node of nodes) {
    if (typeof node === "string" || inlineTags.has(node.tag)) { run.push(node); continue; }
    flush();
    out.push(...block(node));
  }
  flush();
  return out;
}
/** Sections, list items, quotes and table cells need at least one paragraph. */
const cell = (nodes: EditorialNode[]): JSONContent[] => { const content = blocks(nodes); return content.length ? content : [{ type: "paragraph", attrs: { bare: true } }]; };

function block(node: Element): JSONContent[] {
  const level = /^h([1-6])$/.exec(node.tag)?.[1];
  if (level) return [{ type: "heading", attrs: { level: Number(level) }, content: trimmed(inline(node.children)) }, ...nestedImages(node.children).map(image)];
  switch (node.tag) {
    case "p": return paragraphs(node.children, false);
    case "div": return [{ type: "div", content: cell(node.children) }];
    case "ul": case "ol":
      return [{ type: node.tag === "ul" ? "bulletList" : "orderedList", content: node.children.filter(element).map((item) => ({ type: "listItem", content: cell(item.children) })) }];
    case "blockquote": return [{ type: "blockquote", content: cell(node.children) }];
    case "hr": return [{ type: "horizontalRule" }];
    case "table": {
      const sections = ["thead", "tbody", "tfoot"];
      const parts = node.children.filter(element);
      const rows = parts.flatMap((part) => part.tag === "tr" ? [part] : sections.includes(part.tag) ? part.children.filter((row): row is Element => element(row) && row.tag === "tr") : []);
      // Stray text inside a table (an imported caption) shows above it in browsers; keep it there.
      const caption = parts.filter((part) => part.tag !== "tr" && !sections.includes(part.tag));
      return [...paragraphs(caption, false), { type: "table", content: rows.map((row) => ({ type: "tableRow", content: row.children.filter(element).map((c) => ({
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
  const text = node.text?.replace(controls, "");
  if (!text) return [];
  let out: EditorialNode = text;
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
/** A container's children: bare paragraphs give back their words directly; two in a row keep a line break between them. */
function fromChildren(content: JSONContent[] = []): EditorialNode[] {
  const out: EditorialNode[] = [];
  let lastBare = false;
  for (const node of content) {
    if (node.type === "paragraph" && node.attrs?.bare) {
      const words = fromInline(node.content);
      if (!words.length) continue;
      if (lastBare) out.push({ tag: "br", children: [] });
      out.push(...words);
      lastBare = true;
    } else {
      out.push(...fromBlock(node));
      lastBare = false;
    }
  }
  return out;
}
const plain = (node: JSONContent): string => (node.text ?? (node.content ?? []).map(plain).join("")).replace(controls, "");
function fromBlock(node: JSONContent): EditorialNode[] {
  const children = () => fromChildren(node.content);
  switch (node.type) {
    case "paragraph": { const content = fromInline(node.content); return content.length ? [{ tag: "p", children: content }] : []; }
    case "heading": return [{ tag: `h${Math.min(6, Math.max(1, Number(node.attrs?.level) || 2))}`, children: fromInline(node.content) }];
    case "div": return [{ tag: "div", children: children() }];
    case "bulletList": return [{ tag: "ul", children: (node.content ?? []).flatMap(fromBlock) }];
    case "orderedList": return [{ tag: "ol", children: (node.content ?? []).flatMap(fromBlock) }];
    case "listItem": return [{ tag: "li", children: children() }];
    case "blockquote": return [{ tag: "blockquote", children: children() }];
    case "horizontalRule": return [{ tag: "hr", children: [] }];
    case "image": {
      const src = node.attrs?.src, alt = typeof node.attrs?.alt === "string" ? node.attrs.alt.replace(controls, "").slice(0, 200) : "";
      // Only images the store may show (approved hosts or media library uploads); a pasted image from another site is dropped.
      return typeof src === "string" && (src.startsWith("https://") || managedUpload.test(src)) && contentImageSchema.safeParse(src).success ? [{ tag: "img", src, ...(alt ? { alt } : {}), children: [] }] : [];
    }
    case "table": return [{ tag: "table", children: [{ tag: "tbody", children: (node.content ?? []).flatMap(fromBlock) }] }];
    case "tableRow": return [{ tag: "tr", children: (node.content ?? []).flatMap(fromBlock) }];
    case "tableHeader": return [{ tag: "th", children: children() }];
    case "tableCell": return [{ tag: "td", children: children() }];
    default: { const text = plain(node); return text.trim() ? [{ tag: "p", children: [text] }] : []; }
  }
}

export function fromEditorDoc(doc: JSONContent): EditorialNode[] {
  return fromChildren(doc.content);
}
