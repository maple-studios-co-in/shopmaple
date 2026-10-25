import type { ImgHTMLAttributes } from "react";

// Node's ESM loader exposes next/image differently from Next's bundler.
// Image loading/optimization is verified in the real browser, not JSDOM.
export default function TestImage({
  fill,
  preload,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & {
  fill?: boolean;
  preload?: boolean;
}) {
  return <img {...props} />;
}
