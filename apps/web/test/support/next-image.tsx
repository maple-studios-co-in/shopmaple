import type { ImgHTMLAttributes } from "react";

// Node's ESM loader exposes next/image differently from Next's bundler.
// Image loading/optimization is verified in the real browser, not JSDOM.
export default function TestImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  return <img {...props} />;
}
