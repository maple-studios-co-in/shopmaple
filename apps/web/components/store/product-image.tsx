"use client";
import { useState } from "react";
import Image, { type ImageProps } from "next/image";
import { ImageOff } from "lucide-react";
import { imageLoaderFor } from "@/lib/image-loading";

/**
 * A product photo, or a labelled placeholder when the image is missing or fails to load (legacy `.product-image-placeholder`).
 * Shopify's photos come resized from Shopify's own edge; if that copy fails, the original is tried once before the
 * placeholder. A photo filling its frame fades in over the frame's colour instead of popping in, unless it is
 * preloaded (the first, most important photo paints at once) or the visitor asks for reduced motion.
 */
type Props = Omit<ImageProps, "src"> & { src?: string | null };
export function ProductImage({ src, alt, onError, onLoad, className, ...props }: Props) {
  const [failed, setFailed] = useState<{ src: string; attempts: number } | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const attempts = src && failed?.src === src ? failed.attempts : 0;
  const tries = imageLoaderFor(src) ? 2 : 1;
  if (!src || attempts >= tries)
    return (
      <div
        data-image-placeholder
        className="flex size-full min-h-[76px] flex-col items-center justify-center gap-2.5 bg-[#f3f1eb] p-4 text-center text-[12px] text-[#66645c]"
        role="img"
        aria-label={`${alt || "Product"} — Image unavailable`}
      >
        <ImageOff size={28} aria-hidden="true" />
        <span>Image unavailable</span>
      </div>
    );
  const fade = Boolean(props.fill) && !props.preload && !props.priority;
  return (
    <Image
      src={src}
      alt={alt}
      {...props}
      loader={attempts === 0 ? imageLoaderFor(src) : undefined}
      unoptimized={props.unoptimized || attempts > 0}
      // A photo that finished before the page woke up never fires onLoad, so the element is asked directly.
      ref={(image) => { if (image?.complete && image.naturalWidth > 0 && loaded !== src) setLoaded(src); }}
      className={[className, fade && "transition-opacity duration-500 ease-out motion-reduce:transition-none", fade && loaded !== src && "opacity-0"].filter(Boolean).join(" ") || undefined}
      onLoad={(event) => {
        setLoaded(src);
        onLoad?.(event);
      }}
      onError={(event) => {
        setFailed({ src, attempts: attempts + 1 });
        // Only the last failure is a failure: a resized copy falling back to the original is still loading.
        if (attempts + 1 >= tries) onError?.(event);
      }}
    />
  );
}
