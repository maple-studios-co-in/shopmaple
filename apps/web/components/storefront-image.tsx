import NextImage, { getImageProps, type ImageProps } from "next/image";
import { isPrivatePreviewMedia } from "@/lib/preview-media";
export { getImageProps };
/**
 * next/image for storefront content. Private media in a draft preview is served
 * from the authenticated staff path, which the image optimizer cannot fetch and
 * must never cache, so those sources render unoptimized and load with the
 * staff cookie from the browser. Public media is untouched.
 */
export default function StorefrontImage(props: ImageProps) {
  return isPrivatePreviewMedia(props.src) && !props.unoptimized ? <NextImage {...props} unoptimized /> : <NextImage {...props} />;
}
