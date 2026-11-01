import type { AuthoredBlock, ContentPage, EditorialNode } from "@shopmaple/contracts";

/** Text with its line breaks kept, as the storefront showed it. */
const lines = (text: string): EditorialNode[] =>
  text.split("\n").flatMap((line, index) => (index ? [{ tag: "br", children: [] }, line] : [line]));
const paragraph = (text: string): EditorialNode => ({ tag: "p", children: lines(text) });

function fromBlock(block: AuthoredBlock): EditorialNode {
  switch (block.type) {
    case "paragraph": return paragraph(block.text);
    case "heading": return { tag: `h${block.level}`, children: [block.text] };
    case "quote": return { tag: "blockquote", children: [paragraph(block.text)] };
    case "list": return { tag: block.ordered ? "ol" : "ul", children: block.items.map((item) => ({ tag: "li", children: [paragraph(item)] })) };
    case "link": return { tag: "p", children: [{ tag: "a", href: block.href, children: [block.text] }] };
    case "image": return { tag: "img", src: block.src, alt: block.alt, children: [] };
  }
}

/**
 * A page body as rich text: its own rich text once it has some, otherwise its blocks or plain
 * text (paragraphs split on blank lines) carried over word for word. Opening a page in the editor
 * never saves this on its own; only an edit does.
 */
export function pageDocument(page: ContentPage): EditorialNode[] {
  if (page.content) return page.content;
  if (page.blocks) return page.blocks.map(fromBlock);
  return page.body.split(/\n\s*\n/).filter((text) => text.trim()).map(paragraph);
}
