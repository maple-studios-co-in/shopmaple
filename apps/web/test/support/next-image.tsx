import type { ImgHTMLAttributes } from "react";

export function getImageProps(props: ImgHTMLAttributes<HTMLImageElement>) {
  return { props };
}

// Node's ESM loader exposes next/image differently from Next's bundler.
// Image loading/optimization is verified in the real browser, not JSDOM.
export default function TestImage({
  fill,
  preload,
  unoptimized,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & {
  fill?: boolean;
  preload?: boolean;
  unoptimized?: boolean;
}) {
  return <img {...props} />;
}
