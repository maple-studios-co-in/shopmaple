import { createElement, Fragment } from "react";
import Image from "next/image";
export type ContentNode =
  | string
  | {
      tag: string;
      children: ContentNode[];
      href?: string;
      src?: string;
      alt?: string;
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
function destination(href: string) {
  try {
    const url = new URL(href, "https://store.maplefurnishers.com");
    if (
      url.hostname === "shop.maplefurnishers.com" ||
      url.hostname === "store.maplefurnishers.com"
    )
      return url.pathname + url.search + url.hash;
    if (
      url.hostname.endsWith(".myshopify.com") ||
      url.hostname === "checkout.shopify.com"
    )
      return "/pages/contact";
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

export function StoreContent({ nodes }: { nodes: ContentNode[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        if (typeof node === "string")
          return <Fragment key={index}>{node}</Fragment>;
        if (node.tag === "img") {
          let url: URL | null = null;
          try {
            url = node.src
              ? new URL(node.src, "https://store.maplefurnishers.com")
              : null;
          } catch {
            return null;
          }
          if (
            !url ||
            url.protocol !== "https:" ||
            !["shop.maplefurnishers.com", "cdn.shopify.com"].includes(
              url.hostname,
            )
          )
            return null;
          return (
            <Image
              key={index}
              src={url.href}
              alt={node.alt || ""}
              width={1200}
              height={800}
              sizes="(max-width:749px) 92vw, 860px"
              style={{ width: "100%", height: "auto" }}
            />
          );
        }
        if (!tags.has(node.tag)) return null;
        const tag = node.tag === "h1" ? "h2" : node.tag;
        const props = {
          key: index,
          ...(tag === "a" ? { href: destination(node.href || "") } : {}),
          ...(tag === "table" ? { tabIndex: 0, "aria-label": "Content table" } : {}),
        };
        return createElement(
          tag,
          props,
          ...(["hr", "br"].includes(tag)
            ? []
            : [<StoreContent key="content" nodes={tableChildren(tag, node.children)} />]),
        );
      })}
    </>
  );
}
