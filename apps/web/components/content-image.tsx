import Image, { getImageProps as nextImageProps, type ImageProps } from "next/image";

/**
 * Staff-only media previews carry the admin session cookie, which the shared image
 * optimizer neither forwards nor should cache. Those images render unoptimized; every
 * other image keeps the default optimizer path and markup.
 */
export const isStaffPreviewMedia = (src: unknown) => typeof src === "string" && src.startsWith("/api/admin/media/");

const withPreviewFlag = (props: ImageProps): ImageProps =>
  props.unoptimized || isStaffPreviewMedia(props.src) ? { ...props, unoptimized: true } : props;

export function ContentImage(props: ImageProps) {
  return <Image {...withPreviewFlag(props)} />;
}
export function getContentImageProps(props: ImageProps) {
  return nextImageProps(withPreviewFlag(props));
}
