"use client";
import { useState } from "react";
import Image, { type ImageProps } from "next/image";
import { ImageOff } from "lucide-react";
import { imageLoaderFor } from "@/lib/image-loading";

// Legacy markup's photo. Shopify's photos come resized from Shopify's own edge (lib/image-loading); if that copy fails,
// the original is tried once before the placeholder.
type Props = Omit<ImageProps, "src"> & { src?: string | null };
export function ProductImage({ src, alt, onError, ...props }: Props) {
  const [failed, setFailed] = useState<{ src: string; attempts: number } | null>(null);
  const attempts = src && failed?.src === src ? failed.attempts : 0;
  const tries = imageLoaderFor(src) ? 2 : 1;
  if (!src || attempts >= tries)
    return (
      <div
        className="product-image-placeholder"
        role="img"
        aria-label={`${alt || "Product"} — Image unavailable`}
      >
        <ImageOff size={28} aria-hidden="true" />
        <span>Image unavailable</span>
      </div>
    );
  return (
    <Image
      src={src}
      alt={alt}
      {...props}
      loader={attempts === 0 ? imageLoaderFor(src) : undefined}
      unoptimized={props.unoptimized || attempts > 0}
      onError={(event) => {
        setFailed({ src, attempts: attempts + 1 });
        if (attempts + 1 >= tries) onError?.(event);
      }}
    />
  );
}
