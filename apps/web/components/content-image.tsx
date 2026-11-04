import Image, { getImageProps as nextImageProps, type ImageProps } from "next/image";
import { isShopifyImage, shopifyLoader } from "@/lib/image-loading";
import { ShopifyImage } from "./shopify-image";

/**
 * Staff-only media previews carry the admin session cookie, which the shared image
 * optimizer neither forwards nor should cache. Those images render unoptimized. Shopify's
 * own photos (not its SVG icons) come resized from Shopify's edge, keeping their address as
 * the `src`; every other image keeps the default optimizer path and markup.
 */
export const isStaffPreviewMedia = (src: unknown) => typeof src === "string" && src.startsWith("/api/admin/media/");

const withPreviewFlag = (props: ImageProps): ImageProps =>
  props.unoptimized || isStaffPreviewMedia(props.src) ? { ...props, unoptimized: true } : props;

/** A raster photo on Shopify's CDN, which Shopify can resize; an SVG it cannot. */
const shopifyPhoto = (props: ImageProps) => !props.unoptimized && isShopifyImage(props.src) && !/\.svg(?:[?#]|$)/i.test(props.src);

export function ContentImage(props: ImageProps) {
  const flagged = withPreviewFlag(props);
  return shopifyPhoto(flagged) ? <ShopifyImage {...flagged} /> : <Image {...flagged} />;
}
export function getContentImageProps(props: ImageProps) {
  const flagged = withPreviewFlag(props);
  return nextImageProps(shopifyPhoto(flagged) ? { ...flagged, loader: shopifyLoader } : flagged);
}
