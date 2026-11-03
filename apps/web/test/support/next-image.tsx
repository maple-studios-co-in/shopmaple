import type { ImgHTMLAttributes } from "react";

export function getImageProps(props: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) {
  const { unoptimized, ...rest } = props;
  return { props: unoptimized ? { ...rest, "data-unoptimized": "" } : rest };
}

// Node's ESM loader exposes next/image differently from Next's bundler.
// Image loading/optimization is verified in the real browser, not JSDOM.
// `unoptimized` and a custom `loader` surface as data attributes so tests can see the optimizer decision.
export default function TestImage({
  fill,
  preload,
  unoptimized,
  loader,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & {
  fill?: boolean;
  preload?: boolean;
  unoptimized?: boolean;
  loader?: unknown;
}) {
  return <img {...props} data-unoptimized={unoptimized ? "" : undefined} data-loader={typeof loader === "function" && !unoptimized ? "custom" : undefined} />;
}
