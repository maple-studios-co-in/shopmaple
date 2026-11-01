import { Fragment, type ReactNode } from "react";
import type { ProductRichText as RichText, ProductRichTextNode } from "@shopmaple/contracts";

function safeHref(value: string): string | undefined {
  if (value.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return;
  if (value.startsWith("/")) return value.startsWith("//") ? undefined : value;
  try {
    const url = new URL(value);
    if (!["https:", "http:", "mailto:"].includes(url.protocol) || url.username || url.password) return;
    if (url.hostname === "shop.maplefurnishers.com") {
      // A double-slash path must never become a protocol-relative external link.
      if (url.pathname.startsWith("//")) return;
      return url.pathname + url.search + url.hash;
    }
    return value;
  } catch { return; }
}

function renderNode(node: ProductRichTextNode): ReactNode {
  if (node.type === "text") {
    let value: ReactNode = node.value;
    if (node.bold) value = <strong>{value}</strong>;
    if (node.italic) value = <em>{value}</em>;
    return value;
  }
  const children = node.children.map((child, index) => <Fragment key={index}>{renderNode(child)}</Fragment>);
  switch (node.type) {
    case "paragraph": return <p>{children}</p>;
    case "heading": {
      const Heading = ({ 1: "h1", 2: "h2", 3: "h3", 4: "h4", 5: "h5", 6: "h6" } as const)[node.level];
      return <Heading>{children}</Heading>;
    }
    case "list": return node.listType === "ordered" ? <ol>{children}</ol> : <ul>{children}</ul>;
    case "list-item": return <li>{children}</li>;
    case "link": {
      const href = safeHref(node.url);
      if (!href) return children;
      return <a href={href} title={node.title ?? undefined} target={node.target ?? undefined}
        rel={node.target === "_blank" ? "noopener noreferrer" : undefined}>{children}</a>;
    }
  }
}

export function ProductRichText({ content }: { content: RichText | null }) {
  if (!content || content.children.length === 0) return null;
  return <div className="pdp-rich-text">{content.children.map((node, index) => <Fragment key={index}>{renderNode(node)}</Fragment>)}</div>;
}
