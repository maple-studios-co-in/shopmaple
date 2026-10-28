import type { ImgHTMLAttributes } from "react";

export function getImageProps(props: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) {
  const { unoptimized, ...rest } = props;
  return { props: unoptimized ? { ...rest, "data-unoptimized": "" } : rest };
}

// Node's ESM loader exposes next/image differently from Next's bundler.
// Image loading/optimization is verified in the real browser, not JSDOM.
// `unoptimized` surfaces as a data attribute so tests can see the optimizer decision.
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
  return <img {...props} data-unoptimized={unoptimized ? "" : undefined} />;
}
