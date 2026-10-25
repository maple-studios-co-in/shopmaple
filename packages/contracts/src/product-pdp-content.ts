import { z } from "zod";

export type ProductRichTextNode =
  | { type: "text"; value: string; bold?: boolean; italic?: boolean }
  | { type: "paragraph"; children: ProductRichTextNode[] }
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; children: ProductRichTextNode[] }
  | { type: "link"; url: string; title?: string | null; target?: "_blank" | "_self" | null; children: ProductRichTextNode[] }
  | { type: "list"; listType: "ordered" | "unordered"; children: ProductRichTextNode[] }
  | { type: "list-item"; children: ProductRichTextNode[] };
export type ProductRichText = { type: "root"; children: ProductRichTextNode[] };

function safeUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

/** Iterative validation bounds work before traversing untrusted recursive JSON. */
function validRichText(input: unknown): input is ProductRichText {
  const stack: Array<{ value: unknown; depth: number; parent: string | null }> = [{ value: input, depth: 0, parent: null }];
  let nodes = 0, textLength = 0;
  while (stack.length) {
    const { value, depth, parent } = stack.pop()!;
    if (++nodes > 500 || depth > 12 || !value || typeof value !== "object" || Array.isArray(value)) return false;
    const node = value as Record<string, unknown>;
    const type = node.type;
    if (typeof type !== "string") return false;
    const allowed: Record<string, string[]> = {
      root: ["type", "children"], paragraph: ["type", "children"], heading: ["type", "level", "children"],
      text: ["type", "value", "bold", "italic"], link: ["type", "url", "title", "target", "children"],
      list: ["type", "listType", "children"], "list-item": ["type", "children"],
    };
    if (!Object.hasOwn(allowed, type) || Object.keys(node).some(key => !allowed[type]!.includes(key))) return false;
    const childrenByParent: Record<string, string[]> = {
      root: ["paragraph", "heading", "list"], paragraph: ["text", "link"], heading: ["text", "link"],
      link: ["text"], list: ["list-item"], "list-item": ["text", "link", "paragraph", "list"],
    };
    if (parent === null ? type !== "root" : !childrenByParent[parent]?.includes(type)) return false;
    if (type === "text") {
      if (typeof node.value !== "string" || (node.bold !== undefined && typeof node.bold !== "boolean") || (node.italic !== undefined && typeof node.italic !== "boolean")) return false;
      textLength += node.value.length;
      if (textLength > 50_000) return false;
      continue;
    }
    if (type === "heading" && (!Number.isInteger(node.level) || Number(node.level) < 1 || Number(node.level) > 6)) return false;
    if (type === "list" && node.listType !== "ordered" && node.listType !== "unordered") return false;
    if (type === "link" && (!safeUrl(node.url) || (node.title !== undefined && node.title !== null && (typeof node.title !== "string" || node.title.length > 500)) || (node.target !== undefined && node.target !== null && !["_blank", "_self"].includes(String(node.target))))) return false;
    if (!Array.isArray(node.children) || node.children.length > 500 || stack.length + node.children.length + nodes > 500) return false;
    for (const child of node.children) stack.push({ value: child, depth: depth + 1, parent: type });
  }
  // The depth/node checks above also reject cycles before serialization.
  return JSON.stringify(input).length <= 100_000;
}
export const productRichTextSchema = z.custom<ProductRichText>(validRichText, "Invalid or oversized Shopify rich text");
export const productPdpContentSchema = z.object({
  source: z.literal("shopify-metafields"),
  sourceProductId: z.string().regex(/^gid:\/\/shopify\/Product\/[1-9][0-9]*$/),
  capturedAt: z.iso.datetime({ offset: true }),
  details: productRichTextSchema.nullable(),
  materialsCare: productRichTextSchema.nullable(),
  shippingReturns: productRichTextSchema.nullable(),
}).strict();
export type ProductPdpContent = z.infer<typeof productPdpContentSchema>;
