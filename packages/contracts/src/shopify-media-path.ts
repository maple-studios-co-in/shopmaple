import { z } from "zod";

/**
 * The addresses of the store's own copies of Shopify's media (see shopify-media.ts, server-only, for how a Shopify
 * address becomes one). Pure patterns, safe for any bundle.
 */
/** The extensions a migrated file may have, and whether the store serves it as a picture or a film. */
export const shopifyMediaKinds = {
  jpg: "image", jpeg: "image", png: "image", webp: "image", gif: "image", avif: "image", svg: "image",
  mp4: "video", webm: "video",
} as const;
export type ShopifyMediaExtension = keyof typeof shopifyMediaKinds;
/** A local copy's file name: 32 lowercase hex characters and a known extension, nothing else. */
export const shopifyMediaFilename = /^[a-f0-9]{32}\.(?:jpe?g|png|webp|gif|avif|svg|mp4|webm)$/;
/** A local copy's address on the store. */
export const shopifyMediaPathPattern = /^\/media\/shopify\/[a-f0-9]{32}\.(?:jpe?g|png|webp|gif|avif|svg|mp4|webm)$/;
/**
 * Every Shopify-hosted media address inside a larger text (JSON, HTML), including protocol-relative ones
 * ("//cdn.shopify.com/…", as Shopify's theme data writes them); stops at quotes, spaces, brackets, braces and backslashes.
 */
export const shopifyMediaUrlsInText = /(?:https:)?\/\/(?:cdn\.shopify\.com\/(?:s\/files|videos)\/|shop\.maplefurnishers\.com\/cdn\/shop\/)[^\s"'`<>(){}\\]+/g;
/** Whether a local copy is served as a picture or a film, from its file name. */
export const shopifyMediaKind = (filename: string): "image" | "video" | null =>
  shopifyMediaFilename.test(filename) ? shopifyMediaKinds[filename.slice(filename.lastIndexOf(".") + 1) as ShopifyMediaExtension] : null;

/**
 * A catalogue photo: a public https address, or the store's own copy of a Shopify file. The API names the copy in place
 * of a Shopify address once the server has it, so every schema that reads catalogue photos accepts both.
 */
export const catalogueImageSchema = z.union([
  z.string().regex(shopifyMediaPathPattern),
  z.url().max(4096).refine((url) => URL.canParse(url) && new URL(url).protocol === "https:"),
]);
