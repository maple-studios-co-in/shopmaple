"use client";
import Image, { type ImageProps } from "next/image";
import { shopifyLoader } from "@/lib/image-loading";

/**
 * A Shopify-hosted photo in server-rendered content, resized at Shopify's edge (?width=) rather than by the server's
 * optimizer: a 6 MB PNG hero through the optimizer on a cold cache took seconds or timed out. Client-side only because
 * a server component cannot hand next/image a loader function; the `src` stays the photo's own address.
 */
export function ShopifyImage(props: Omit<ImageProps, "loader">) {
  return <Image {...props} loader={shopifyLoader} />;
}
