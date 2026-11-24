import { createElement, Fragment, type CSSProperties } from "react";
import { editorialAligns, editorialColors, editorialHighlight, managedUpload, siteHosts, storeMedia } from "@shopmaple/contracts";
import { ContentImage as Image } from "@/components/content-image";
import { storeOrigins } from "@/lib/site-origins";
export type ContentNode =
  | string
  | {
      tag: string;
      children: ContentNode[];
      href?: string;
      src?: string;
      alt?: string;
      align?: string;
      color?: string;
    };
const tags = new Set([
  "div",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "strong",
  "b",
  "em",
  "i",
  "u",
  // The rich text editor's strikethrough, highlight, superscript and subscript (owner, 24 Nov 2026).
  "s",
  "mark",
  "sup",
  "sub",
  "br",
  "a",
  "blockquote",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "span",
  "hr",
]);
const alignable = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6"]);
/**
 * The only styles stored text may carry: an alignment the editor offers on a paragraph or heading, a colour from the
 * store's palette on a span (by name), and the highlighter's colour. Anything else is ignored, never drawn.
 */
function styleOf(node: Exclude<ContentNode, string>): CSSProperties | undefined {
  if (alignable.has(node.tag) && (editorialAligns as readonly (string | undefined)[]).includes(node.align)) return { textAlign: node.align as CSSProperties["textAlign"] };
  if (node.tag === "span" && node.color && Object.hasOwn(editorialColors, node.color)) return { color: editorialColors[node.color as keyof typeof editorialColors].hex };
  if (node.tag === "mark") return { backgroundColor: editorialHighlight, color: "inherit", padding: "0 0.1em", borderRadius: "2px" };
  return undefined;
}
function destination(href: string) {
  try {
    // A relative link, or one to the store's own addresses (SITE_URL, SITE_ALIASES), is a path here; the old shop's
    // /pages/<slug> is /<slug> here. The base only resolves relative links.
    const url = new URL(href, "https://local.invalid");
    if (url.host === "local.invalid" || siteHosts(storeOrigins()).includes(url.host))
      return url.pathname.replace(/^\/pages\//, "/") + url.search + url.hash;
    if (
      url.hostname.endsWith(".myshopify.com") ||
      url.hostname === "checkout.shopify.com"
    )
      return "/contact";
    return ["https:", "mailto:", "tel:"].includes(url.protocol)
      ? href
      : undefined;
  } catch {
    return undefined;
  }
}
function emptyDecoration(node: ContentNode): boolean {
  return typeof node === "string"
    ? node.trim().length === 0
    : ["div", "span"].includes(node.tag) && node.children.every(emptyDecoration);
}

// Imported HTML may contain decorative wrappers between table rows. Normalize
// only structural table parents; keep cell contents and substantive copy intact.
function tableChildren(tag: string, children: ContentNode[]): ContentNode[] {
  if (!["table", "thead", "tbody", "tr"].includes(tag)) return children;
  const wrap = (tag: string, child: ContentNode): ContentNode => ({ tag, children: [child] });
  return children.filter(node => !emptyDecoration(node)).map(node => {
    const childTag = typeof node === "string" ? undefined : node.tag;
    if (tag === "table" && ["thead", "tbody"].includes(childTag ?? "")) return node;
    if (["thead", "tbody"].includes(tag) && childTag === "tr") return node;
    const isCell = childTag === "td" || childTag === "th";
    if (tag === "tr") return isCell ? node : wrap("td", node);
    const row = childTag === "tr" ? node : wrap("tr", isCell ? node : wrap("td", node));
    return tag === "table" ? wrap("tbody", row) : row;
  });
}

/** `previewUploads`: the admin preview shows unpublished media library uploads through the private preview address. */
export function StoreContent({ nodes, previewUploads = false }: { nodes: ContentNode[]; previewUploads?: boolean }) {
  return (
    <>
      {nodes.map((node, index) => {
        if (typeof node === "string")
          return <Fragment key={index}>{node}</Fragment>;
        if (node.tag === "img") {
          // The staff draft preview frame has already moved uploads to their private preview address.
          if (node.src && /^\/api\/admin\/media\/[a-f0-9]{64}\/preview$/.test(node.src))
            // eslint-disable-next-line @next/next/no-img-element -- a private, signed-in preview address
            return <img key={index} src={node.src} alt={node.alt || ""} width={1200} height={800} style={{ width: "100%", height: "auto" }} />;
          // A picture the store serves itself (media library uploads, Keeri photos, campaign art).
          if (node.src && storeMedia(node.src))
            return previewUploads && managedUpload.test(node.src) ? (
              // eslint-disable-next-line @next/next/no-img-element -- a private, signed-in preview address
              <img key={index} src={`/api/admin/media/${node.src.slice(15, 79)}/preview`} alt={node.alt || ""} width={1200} height={800} style={{ width: "100%", height: "auto" }} />
            ) : (
              <Image
                key={index}
                src={node.src}
                alt={node.alt || ""}
                width={1200}
                height={800}
                sizes="(max-width:749px) 92vw, 860px"
                style={{ width: "100%", height: "auto" }}
              />
            );
          // Any other picture is left out: the store shows only its own media (no Shopify files, owner 11 Nov 2026).
          return null;
        }
        if (!tags.has(node.tag)) return null;
        const tag = node.tag === "h1" ? "h2" : node.tag;
        const style = styleOf(node);
        const props = {
          key: index,
          ...(tag === "a" ? { href: destination(node.href || "") } : {}),
          ...(tag === "table" ? { tabIndex: 0, "aria-label": "Content table" } : {}),
          ...(style ? { style } : {}),
        };
        return createElement(
          tag,
          props,
          ...(["hr", "br"].includes(tag)
            ? []
            : [<StoreContent key="content" nodes={tableChildren(tag, node.children)} previewUploads={previewUploads} />]),
        );
      })}
    </>
  );
}
