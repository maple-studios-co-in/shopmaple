import type { ImgHTMLAttributes } from "react";

// As the real one does, a loader is used rather than passed on to the <img>; the stand-in marks it like TestImage below.
export function getImageProps(props: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean; loader?: unknown }) {
  const { unoptimized, loader, ...rest } = props;
  if (unoptimized) return { props: { ...rest, "data-unoptimized": "" } };
  return { props: typeof loader === "function" ? { ...rest, "data-loader": "custom" } : rest };
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
